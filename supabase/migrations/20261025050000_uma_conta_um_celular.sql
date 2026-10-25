-- Uma conta, um celular.
--
-- Ao entrar num celular novo, o login desse celular passa a ser o único válido da conta
-- ("o último a entrar vale"). O celular antigo é desconectado pelo app e, mesmo que fique
-- sem internet e volte depois, o banco recusa as ações dele (corridas, mensagens, online,
-- posição, propostas) até a pessoa entrar de novo.
--
-- Conta marcada com `multi_session = true` fica fora da regra (para contas de teste).
-- A equipe do painel também fica fora (usa e-mail e senha, não o app).

alter table public.profiles add column multi_session boolean not null default false;

-- O login válido de cada conta. Só as funções abaixo mexem na tabela.
create table public.account_sessions (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  session_id text not null,
  claimed_at timestamptz not null default now()
);

alter table public.account_sessions enable row level security;
revoke all on public.account_sessions from anon, authenticated;

-- Chamada logo depois de um login novo: este celular passa a ser o válido.
create function public.claim_session()
returns boolean
language plpgsql
security definer set search_path = ''
as $$
declare
  v_sid text := auth.jwt() ->> 'session_id';
begin
  if auth.uid() is null or v_sid is null then
    return false;
  end if;

  if exists (select 1 from public.profiles p where p.id = auth.uid() and p.multi_session) then
    return true;
  end if;

  insert into public.account_sessions (user_id, session_id)
  values (auth.uid(), v_sid)
  on conflict (user_id) do update set session_id = excluded.session_id, claimed_at = now();

  return true;
end;
$$;

-- Este celular ainda é o válido da conta? Sem registro ainda (conta que nunca
-- entrou por um app novo) vale como válido.
create function public.session_is_current()
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select auth.uid() is null
    or coalesce((select p.multi_session from public.profiles p where p.id = auth.uid()), false)
    or not exists (select 1 from public.account_sessions s where s.user_id = auth.uid())
    or exists (
      select 1 from public.account_sessions s
      where s.user_id = auth.uid() and s.session_id = auth.jwt() ->> 'session_id'
    );
$$;

revoke execute on function public.claim_session() from public, anon;
revoke execute on function public.session_is_current() from public, anon;
grant execute on function public.claim_session() to authenticated;
grant execute on function public.session_is_current() to authenticated;

-- A trava: gravações de um celular que não é mais o válido são recusadas.
create function private.guard_session()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if auth.uid() is not null and not private.is_staff() and not public.session_is_current() then
    raise exception 'Sua conta foi aberta em outro celular. Entre de novo.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function private.guard_session() from public, anon, authenticated;

create trigger rides_guard_session
  before insert or update on public.rides
  for each row execute function private.guard_session();

create trigger ride_messages_guard_session
  before insert on public.ride_messages
  for each row execute function private.guard_session();

create trigger ride_proposals_guard_session
  before insert or update on public.ride_proposals
  for each row execute function private.guard_session();

create trigger driver_locations_guard_session
  before insert or update on public.driver_locations
  for each row execute function private.guard_session();

create trigger passenger_locations_guard_session
  before insert or update on public.passenger_locations
  for each row execute function private.guard_session();

create trigger drivers_online_guard_session
  before update of is_online on public.drivers
  for each row execute function private.guard_session();

-- Para deixar contas de teste fora da regra (opcional), rode no SQL Editor, trocando os números:
--   update public.profiles set multi_session = true where phone in ('5588900000001', '5588900000004');
