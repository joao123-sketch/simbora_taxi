-- Painel da equipe (Etapa 10): quem é da equipe e as funções que só ela chama.
-- O painel entra com e-mail e senha pelo Supabase e usa só estas funções; o
-- banco confere se a pessoa está em `public.staff` antes de qualquer coisa.
--
-- Para dar acesso a alguém (depois de criar o usuário em Authentication > Users),
-- rode no SQL Editor do Supabase, trocando o e-mail:
--   insert into public.staff (user_id)
--   select id from auth.users where email = 'equipe@exemplo.com';

create table public.staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Ninguém lê nem escreve direto: nem o app, nem o painel.
alter table public.staff enable row level security;
revoke all on public.staff from anon, authenticated;

create function private.is_staff()
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (select 1 from public.staff s where s.user_id = (select auth.uid()));
$$;

revoke execute on function private.is_staff() from public, anon, authenticated;

create function private.require_staff()
returns void
language plpgsql
stable
security definer set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'Acesso só para a equipe';
  end if;
end;
$$;

revoke execute on function private.require_staff() from public, anon, authenticated;

-- O painel pergunta se quem entrou é da equipe.
create function public.staff_me()
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select private.is_staff();
$$;

revoke execute on function public.staff_me() from public, anon;
grant execute on function public.staff_me() to authenticated;

-- ---------------------------------------------------------------------------
-- Taxa do cartão editável (antes era um número fixo no código)
-- ---------------------------------------------------------------------------

alter table public.pricing_settings
  add column card_surcharge numeric(4, 3) not null default 0.05 check (card_surcharge between 0 and 0.30);

create or replace function private.card_surcharge()
returns numeric
language sql
stable
security definer set search_path = ''
as $$
  select s.card_surcharge from public.pricing_settings s where s.id = 1;
$$;

-- ---------------------------------------------------------------------------
-- Motoristas
-- ---------------------------------------------------------------------------

-- Lista de motoristas com tudo o que a equipe confere (inclui os dados
-- pessoais, que só a equipe vê). Quem aguarda aprovação aparece primeiro.
create function public.staff_list_drivers(p_status public.driver_status default null)
returns table (
  driver_id uuid,
  full_name text,
  phone text,
  status public.driver_status,
  vehicle_type public.vehicle_type,
  vehicle_model text,
  vehicle_color text,
  vehicle_plate text,
  vehicle_year int,
  city_name text,
  is_online boolean,
  created_at timestamptz,
  approved_at timestamptz,
  cpf text,
  birth_date date,
  cnh_category text,
  cnh_ear boolean,
  declared_helmets boolean,
  declared_leg_guard boolean,
  declared_line_cutter boolean,
  terms_accepted boolean,
  cnh_ok boolean,
  criminal_record_ok boolean,
  crlv_ok boolean,
  inspection_ok boolean,
  helmets_ok boolean,
  vest_delivered boolean,
  leg_guard_ok boolean,
  line_cutter_ok boolean,
  notes text
)
language plpgsql
stable
security definer set search_path = ''
as $$
begin
  perform private.require_staff();

  return query
  select
    d.id, p.full_name, p.phone, d.status, d.vehicle_type,
    d.vehicle_model, d.vehicle_color, d.vehicle_plate, d.vehicle_year,
    c.name, d.is_online, d.created_at, d.approved_at,
    dp.cpf, dp.birth_date, dp.cnh_category, dp.cnh_ear,
    dp.declared_helmets, dp.declared_leg_guard, dp.declared_line_cutter,
    exists (select 1 from public.driver_acceptances a where a.driver_id = d.id and a.document = 'termos'),
    ck.cnh_ok, ck.criminal_record_ok, ck.crlv_ok, ck.inspection_ok,
    ck.helmets_ok, ck.vest_delivered, ck.leg_guard_ok, ck.line_cutter_ok, ck.notes
  from public.drivers d
  join public.profiles p on p.id = d.id
  join public.cities c on c.id = d.city_id
  left join public.driver_private dp on dp.driver_id = d.id
  left join public.driver_checklist ck on ck.driver_id = d.id
  where p_status is null or d.status = p_status
  order by (d.status = 'pending') desc, d.created_at desc;
end;
$$;

revoke execute on function public.staff_list_drivers(public.driver_status) from public, anon;
grant execute on function public.staff_list_drivers(public.driver_status) to authenticated;

-- Marca ou desmarca o que a equipe conferiu. `p_patch` traz só o que mudou,
-- por exemplo {"cnh_ok": true, "notes": "CNH vence em 2027"}.
create function public.staff_set_checklist(p_driver uuid, p_patch jsonb)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  perform private.require_staff();

  update public.driver_checklist c
  set cnh_ok = coalesce((p_patch ->> 'cnh_ok')::boolean, c.cnh_ok),
      criminal_record_ok = coalesce((p_patch ->> 'criminal_record_ok')::boolean, c.criminal_record_ok),
      crlv_ok = coalesce((p_patch ->> 'crlv_ok')::boolean, c.crlv_ok),
      inspection_ok = coalesce((p_patch ->> 'inspection_ok')::boolean, c.inspection_ok),
      helmets_ok = coalesce((p_patch ->> 'helmets_ok')::boolean, c.helmets_ok),
      vest_delivered = coalesce((p_patch ->> 'vest_delivered')::boolean, c.vest_delivered),
      leg_guard_ok = coalesce((p_patch ->> 'leg_guard_ok')::boolean, c.leg_guard_ok),
      line_cutter_ok = coalesce((p_patch ->> 'line_cutter_ok')::boolean, c.line_cutter_ok),
      notes = case when p_patch ? 'notes' then nullif(trim(p_patch ->> 'notes'), '') else c.notes end,
      updated_at = now()
  where c.driver_id = p_driver;

  if not found then
    raise exception 'Motorista sem checklist';
  end if;
end;
$$;

revoke execute on function public.staff_set_checklist(uuid, jsonb) from public, anon;
grant execute on function public.staff_set_checklist(uuid, jsonb) to authenticated;

-- Aprova, suspende ou bloqueia. A aprovação continua passando pela trava do
-- banco: sem o checklist completo ela é recusada e diz o que falta.
create function public.staff_set_driver_status(p_driver uuid, p_status public.driver_status)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  perform private.require_staff();

  update public.drivers d
  set status = p_status,
      is_online = case when p_status = 'approved' then d.is_online else false end
  where d.id = p_driver;

  if not found then
    raise exception 'Motorista não encontrado';
  end if;
end;
$$;

revoke execute on function public.staff_set_driver_status(uuid, public.driver_status) from public, anon;
grant execute on function public.staff_set_driver_status(uuid, public.driver_status) to authenticated;

-- ---------------------------------------------------------------------------
-- Preços
-- ---------------------------------------------------------------------------

-- Tudo de preço de uma vez: cidades, tarifas (com o histórico), preços entre
-- cidades e as configurações (preço dinâmico e taxa do cartão).
create function public.staff_pricing_overview()
returns jsonb
language plpgsql
stable
security definer set search_path = ''
as $$
begin
  perform private.require_staff();

  return jsonb_build_object(
    'cities', (
      select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'state', c.state, 'active', c.active) order by c.name), '[]'::jsonb)
      from public.cities c
    ),
    'fares', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'city_id', f.city_id, 'city_name', c.name, 'vehicle_type', f.vehicle_type,
        'base', f.base, 'per_km', f.per_km, 'per_min', f.per_min, 'minimum', f.minimum,
        'effective_from', f.effective_from
      ) order by c.name, f.vehicle_type, f.effective_from desc), '[]'::jsonb)
      from public.fares f join public.cities c on c.id = f.city_id
    ),
    'intercity', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'origin_city_id', i.origin_city_id, 'origin_name', o.name,
        'destination_city_id', i.destination_city_id, 'destination_name', t.name,
        'vehicle_type', i.vehicle_type, 'price', i.price
      ) order by o.name, t.name, i.vehicle_type), '[]'::jsonb)
      from public.intercity_fares i
      join public.cities o on o.id = i.origin_city_id
      join public.cities t on t.id = i.destination_city_id
    ),
    'settings', (select to_jsonb(s) from public.pricing_settings s where s.id = 1)
  );
end;
$$;

revoke execute on function public.staff_pricing_overview() from public, anon;
grant execute on function public.staff_pricing_overview() to authenticated;

-- Nova tarifa a partir de uma data (a mais recente que já começou é a que vale;
-- as antigas ficam de histórico). Na mesma data, corrige a linha existente.
create function public.staff_add_fare(
  p_city_id bigint,
  p_vehicle_type public.vehicle_type,
  p_base numeric,
  p_per_km numeric,
  p_per_min numeric,
  p_minimum numeric,
  p_effective_from date
)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  perform private.require_staff();

  if p_base is null or p_per_km is null or p_per_min is null or p_minimum is null
     or p_base < 0 or p_per_km < 0 or p_per_min < 0 or p_minimum < 0
     or p_base > 500 or p_per_km > 500 or p_per_min > 500 or p_minimum > 500 then
    raise exception 'Confira os valores da tarifa (de 0 a 500)';
  end if;

  if p_effective_from is null then
    raise exception 'Diga a partir de que dia a tarifa vale';
  end if;

  insert into public.fares (city_id, vehicle_type, base, per_km, per_min, minimum, effective_from)
  values (p_city_id, p_vehicle_type, round(p_base, 2), round(p_per_km, 2), round(p_per_min, 2), round(p_minimum, 2), p_effective_from)
  on conflict (city_id, vehicle_type, effective_from) do update
    set base = excluded.base, per_km = excluded.per_km, per_min = excluded.per_min, minimum = excluded.minimum;
end;
$$;

revoke execute on function public.staff_add_fare(bigint, public.vehicle_type, numeric, numeric, numeric, numeric, date) from public, anon;
grant execute on function public.staff_add_fare(bigint, public.vehicle_type, numeric, numeric, numeric, numeric, date) to authenticated;

-- Preço fechado entre duas cidades.
create function public.staff_set_intercity_price(
  p_origin_city_id bigint,
  p_destination_city_id bigint,
  p_vehicle_type public.vehicle_type,
  p_price numeric
)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  perform private.require_staff();

  if p_price is null or p_price <= 0 or p_price > 5000 then
    raise exception 'O preço vai de R$ 0,01 a R$ 5.000,00';
  end if;
  if p_origin_city_id = p_destination_city_id then
    raise exception 'Escolha duas cidades diferentes';
  end if;

  insert into public.intercity_fares (origin_city_id, destination_city_id, vehicle_type, price)
  values (p_origin_city_id, p_destination_city_id, p_vehicle_type, round(p_price, 2))
  on conflict (origin_city_id, destination_city_id, vehicle_type) do update
    set price = excluded.price;
end;
$$;

revoke execute on function public.staff_set_intercity_price(bigint, bigint, public.vehicle_type, numeric) from public, anon;
grant execute on function public.staff_set_intercity_price(bigint, bigint, public.vehicle_type, numeric) to authenticated;

-- Configurações de preço: trava e regra do preço dinâmico e taxa do cartão.
-- `p_patch` traz só o que mudou. Os limites de cada campo são conferidos pela
-- própria tabela.
create function public.staff_set_pricing_settings(p_patch jsonb)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  perform private.require_staff();

  update public.pricing_settings s
  set locked = coalesce((p_patch ->> 'locked')::boolean, s.locked),
      locked_factor = coalesce((p_patch ->> 'locked_factor')::numeric, s.locked_factor),
      step_size = coalesce((p_patch ->> 'step_size')::numeric, s.step_size),
      max_step = coalesce((p_patch ->> 'max_step')::smallint, s.max_step),
      window_minutes = coalesce((p_patch ->> 'window_minutes')::smallint, s.window_minutes),
      slow_seconds = coalesce((p_patch ->> 'slow_seconds')::smallint, s.slow_seconds),
      min_requests = coalesce((p_patch ->> 'min_requests')::smallint, s.min_requests),
      step_every_minutes = coalesce((p_patch ->> 'step_every_minutes')::smallint, s.step_every_minutes),
      share_per_step = coalesce((p_patch ->> 'share_per_step')::numeric, s.share_per_step),
      card_surcharge = coalesce((p_patch ->> 'card_surcharge')::numeric, s.card_surcharge),
      updated_at = now()
  where s.id = 1;
exception
  when check_violation then
    raise exception 'Um dos valores está fora do limite permitido';
end;
$$;

revoke execute on function public.staff_set_pricing_settings(jsonb) from public, anon;
grant execute on function public.staff_set_pricing_settings(jsonb) to authenticated;
