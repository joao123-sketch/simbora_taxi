-- Liberar número pelo painel: quando o SMS não chega (ex.: chip de operadora pequena), a equipe digita o
-- número no painel e recebe na tela o código de entrada para passar à pessoa por WhatsApp ou ligação.
--
-- (Depois, a migration 20261112010000 simplificou: a equipe só libera o número e a própria pessoa pede o código no app.)
-- Como funciona:
--   1. staff_release_phone(telefone) marca o número como liberado por 30 minutos e pede o código ao Supabase Auth
--      (o mesmo pedido que o app faz), pelo pg_net.
--   2. O Send SMS Hook (função send-sms) vê que o número está liberado: em vez de mandar o SMS, guarda o código
--      aqui (hook_store_release_code).
--   3. O painel lê o código com staff_released_code(telefone) e mostra para a equipe. A pessoa digita o código
--      na tela de código do app, como se tivesse chegado por SMS.
-- O código só é guardado para número liberado pela equipe e some quando a liberação vence.
--
-- Depois de aplicar, grave o endereço do projeto e a chave PÚBLICA (anon/publishable, a mesma do app):
--   insert into private.auth_config (id, url, anon_key)
--   values (1, 'https://SEU-PROJETO.supabase.co', 'A-CHAVE-PUBLICA')
--   on conflict (id) do update set url = excluded.url, anon_key = excluded.anon_key;

create table private.auth_config (
  id int primary key check (id = 1),
  url text not null,
  anon_key text not null
);

alter table private.auth_config enable row level security;
revoke all on private.auth_config from public, anon, authenticated;

-- phone: só os dígitos com o 55, ex.: 5588988941408.
create table private.phone_releases (
  phone text primary key,
  released_by uuid references auth.users (id) on delete set null,
  released_at timestamptz not null default now(),
  expires_at timestamptz not null,
  code text,
  code_at timestamptz
);

alter table private.phone_releases enable row level security;
revoke all on private.phone_releases from public, anon, authenticated;

-- Telefone do painel (com ou sem +55, máscara, espaços) para só dígitos com o 55. Erro se não for celular brasileiro.
create function private.release_phone_digits(p_phone text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  if length(v_digits) = 11 then
    v_digits := '55' || v_digits;
  end if;
  if v_digits !~ '^55\d{2}9\d{8}$' then
    raise exception 'Digite o celular com DDD, por exemplo (88) 99999-0000';
  end if;
  return v_digits;
end;
$$;

revoke execute on function private.release_phone_digits(text) from public, anon, authenticated;

-- Equipe: libera o número e pede o código.
create function public.staff_release_phone(p_phone text)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_digits text;
  v_cfg private.auth_config;
begin
  perform private.require_staff();
  v_digits := private.release_phone_digits(p_phone);

  select * into v_cfg from private.auth_config where id = 1;
  if not found then
    raise exception 'Falta configurar o endereço do projeto (private.auth_config). Veja docs/EQUIPE.md';
  end if;

  delete from private.phone_releases where expires_at < now();

  insert into private.phone_releases (phone, released_by, released_at, expires_at, code, code_at)
  values (v_digits, auth.uid(), now(), now() + interval '30 minutes', null, null)
  on conflict (phone) do update
    set released_by = excluded.released_by, released_at = excluded.released_at,
        expires_at = excluded.expires_at, code = null, code_at = null;

  -- O mesmo pedido que o app faz ao tocar em "Receber código".
  perform net.http_post(
    url := v_cfg.url || '/auth/v1/otp',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', v_cfg.anon_key),
    body := jsonb_build_object('phone', '+' || v_digits, 'create_user', true),
    timeout_milliseconds := 10000
  );
end;
$$;

-- Equipe: o código que o hook guardou (vazio enquanto ele não chegou).
create function public.staff_released_code(p_phone text)
returns table (code text, code_at timestamptz, expires_at timestamptz)
language plpgsql
stable
security definer set search_path = ''
as $$
declare
  v_digits text;
begin
  perform private.require_staff();
  v_digits := private.release_phone_digits(p_phone);
  return query
    select r.code, r.code_at, r.expires_at
    from private.phone_releases r
    where r.phone = v_digits and r.expires_at > now();
end;
$$;

-- Equipe: cancela a liberação (o código deixa de aparecer).
create function public.staff_cancel_release(p_phone text)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  perform private.require_staff();
  delete from private.phone_releases where phone = private.release_phone_digits(p_phone);
end;
$$;

-- Só o hook (service_role) guarda o código; devolve true se o número estava liberado.
create function public.hook_store_release_code(p_phone text, p_code text)
returns boolean
language plpgsql
security definer set search_path = ''
as $$
declare
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  update private.phone_releases
  set code = p_code, code_at = now()
  where phone = v_digits and expires_at > now();
  return found;
end;
$$;

revoke execute on function public.staff_release_phone(text) from public, anon;
revoke execute on function public.staff_released_code(text) from public, anon;
revoke execute on function public.staff_cancel_release(text) from public, anon;
grant execute on function public.staff_release_phone(text) to authenticated;
grant execute on function public.staff_released_code(text) to authenticated;
grant execute on function public.staff_cancel_release(text) to authenticated;

revoke execute on function public.hook_store_release_code(text, text) from public, anon, authenticated;
grant execute on function public.hook_store_release_code(text, text) to service_role;
