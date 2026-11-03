-- Viagem entre cidades pela métrica normal: o preço sai da distância do endereço até o ponto de partida,
-- na tarifa da cidade de origem (mesma conta da corrida dentro da cidade). Acaba o valor fixo por rota.
-- O motorista pode propor um valor acima do calculado, até um teto (percentual único, ajustável no painel).

alter table public.pricing_settings
  add column proposal_cap numeric(4, 2) not null default 0.30 check (proposal_cap between 0 and 1);

-- ---------------------------------------------------------------------------
-- Preço: viagem para outra cidade usa a tarifa da cidade de origem
-- ---------------------------------------------------------------------------

create or replace function private.ride_quote(
  p_city_id bigint,
  p_vehicle_type public.vehicle_type,
  p_origin extensions.geography,
  p_destination extensions.geography,
  p_destination_city_id bigint
)
returns table (price numeric, distance_km numeric)
language plpgsql
stable
security definer set search_path = ''
as $$
declare
  v_km numeric;
  v_fare public.fares;
begin
  v_km := round((extensions.st_distance(p_origin, p_destination) / 1000 * 1.3)::numeric, 2);

  select * into v_fare
  from public.fares f
  where f.city_id = p_city_id
    and f.vehicle_type = p_vehicle_type
    and f.effective_from <= current_date
  order by f.effective_from desc
  limit 1;

  if not found then
    raise exception 'Sem tarifa para essa cidade';
  end if;

  return query select
    round(v_fare.base + v_fare.per_km * v_km + v_fare.per_min * (v_km / 30 * 60), 2),
    v_km;
end;
$$;

-- ---------------------------------------------------------------------------
-- Painel: sem rotas fixas, com o teto da proposta
-- ---------------------------------------------------------------------------

create or replace function public.staff_pricing_overview()
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
        'base', f.base, 'per_km', f.per_km, 'per_min', f.per_min,
        'effective_from', f.effective_from
      ) order by c.name, f.vehicle_type, f.effective_from desc), '[]'::jsonb)
      from public.fares f join public.cities c on c.id = f.city_id
    ),
    'delivery_sizes', (
      select coalesce(jsonb_agg(to_jsonb(d) order by d.size), '[]'::jsonb)
      from public.delivery_sizes d
    ),
    'settings', (select to_jsonb(s) from public.pricing_settings s where s.id = 1)
  );
end;
$$;

create or replace function public.staff_set_pricing_settings(p_patch jsonb)
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
      delivery_discount = coalesce((p_patch ->> 'delivery_discount')::numeric, s.delivery_discount),
      night_surcharge = coalesce((p_patch ->> 'night_surcharge')::numeric, s.night_surcharge),
      night_from = coalesce((p_patch ->> 'night_from')::smallint, s.night_from),
      night_until = coalesce((p_patch ->> 'night_until')::smallint, s.night_until),
      max_factor = coalesce((p_patch ->> 'max_factor')::numeric, s.max_factor),
      proposal_cap = coalesce((p_patch ->> 'proposal_cap')::numeric, s.proposal_cap),
      updated_at = now()
  where s.id = 1;
exception
  when check_violation then
    raise exception 'Um dos valores está fora do limite permitido';
end;
$$;

-- ---------------------------------------------------------------------------
-- Fim das rotas fixas
-- ---------------------------------------------------------------------------

drop function public.staff_set_intercity_price(bigint, bigint, public.vehicle_type, numeric);
drop function public.staff_delete_intercity_pair(bigint, bigint);
drop table public.intercity_fares;

-- O motorista e o passageiro leem o teto para mostrar o limite na tela.
create function public.proposal_cap()
returns numeric
language sql
stable
security definer set search_path = ''
as $$
  select s.proposal_cap from public.pricing_settings s where s.id = 1;
$$;

revoke execute on function public.proposal_cap() from public, anon;
grant execute on function public.proposal_cap() to authenticated;
