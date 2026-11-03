-- Preço por faixas de distância.
-- Viagem entre cidades: bandeirada + três faixas de valor por km (serra, descida da serra, estrada longa), já com o
-- tempo dentro do valor. Ida e volta = ida × fator, com horas de espera incluídas (o que passar cobra por minuto).
-- Corrida dentro da cidade: depois de certa distância, o km passa a custar menos (sítios e distritos).

alter table public.fares
  add column intercity_t1_km numeric(6, 1) not null default 72 check (intercity_t1_km between 0 and 2000),
  add column intercity_rate2 numeric(6, 2) not null default 6.70 check (intercity_rate2 between 0 and 500),
  add column intercity_t2_km numeric(6, 1) not null default 90 check (intercity_t2_km between 0 and 2000),
  add column intercity_rate3 numeric(6, 2) not null default 2.72 check (intercity_rate3 between 0 and 500),
  add column city_far_km numeric(6, 1) not null default 4 check (city_far_km between 0 and 2000),
  add column city_far_per_km numeric(6, 2) not null default 0.60 check (city_far_per_km between 0 and 500);

alter table public.fares alter column intercity_per_km set default 1.70;

-- Carro e moto (moto a 70% do carro nas faixas de estrada).
update public.fares set
  intercity_per_km = case vehicle_type when 'moto' then 1.20 else 1.70 end,
  intercity_rate2 = case vehicle_type when 'moto' then 4.70 else 6.70 end,
  intercity_rate3 = case vehicle_type when 'moto' then 1.90 else 2.72 end,
  city_far_per_km = case vehicle_type when 'moto' then 0.40 else 0.60 end;

alter table public.pricing_settings
  add column round_trip_factor numeric(4, 2) not null default 1.50 check (round_trip_factor between 1 and 3),
  add column included_wait_minutes smallint not null default 120 check (included_wait_minutes between 0 and 480);

-- ---------------------------------------------------------------------------
-- Preço de uma corrida (sem fator dinâmico), por faixas
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
  v_near numeric;
  v_fare public.fares;
  v_intercity boolean := p_destination_city_id is not null and p_destination_city_id <> p_city_id;
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

  if v_intercity then
    return query select
      round(
        v_fare.base
        + v_fare.intercity_per_km * least(v_km, v_fare.intercity_t1_km)
        + v_fare.intercity_rate2 * greatest(0, least(v_km, v_fare.intercity_t2_km) - v_fare.intercity_t1_km)
        + v_fare.intercity_rate3 * greatest(0, v_km - v_fare.intercity_t2_km),
        2),
      v_km;
  else
    v_near := least(v_km, v_fare.city_far_km);
    return query select
      round(
        v_fare.base + v_fare.per_km * v_near + v_fare.per_min * (v_near / 30 * 60)
        + v_fare.city_far_per_km * greatest(0, v_km - v_fare.city_far_km),
        2),
      v_km;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cotação: ida e volta = ida × fator; a espera passa a contar só depois das horas incluídas
-- ---------------------------------------------------------------------------

create or replace function public.quote_ride(
  p_city_id bigint,
  p_origin_lng double precision,
  p_origin_lat double precision,
  p_destination_lng double precision,
  p_destination_lat double precision,
  p_destination_city_id bigint default null,
  p_round_trip boolean default false,
  p_wait_minutes int default 0
)
returns table (
  vehicle_type public.vehicle_type,
  quote_id uuid,
  price numeric,
  card_price numeric,
  distance_km numeric,
  expires_at timestamptz
)
language plpgsql
volatile
security definer set search_path = ''
as $$
declare
  v_type public.vehicle_type;
  v_origin extensions.geography := private.point(p_origin_lng, p_origin_lat);
  v_destination extensions.geography := private.point(p_destination_lng, p_destination_lat);
  v_intercity boolean := p_destination_city_id is not null and p_destination_city_id <> p_city_id;
  v_wait int := coalesce(p_wait_minutes, 0);
  v_base numeric;
  v_km numeric;
  v_factor numeric;
  v_price numeric;
  v_rt_factor numeric;
  v_included int;
  v_quote public.price_quotes;
begin
  if auth.uid() is null then
    raise exception 'Faça login para ver o preço';
  end if;

  if p_round_trip and not v_intercity then
    raise exception 'Ida e volta só vale em viagem para outra cidade';
  end if;
  if v_wait < 0 or v_wait > 480 then
    raise exception 'A espera vai de 0 a 8 horas';
  end if;
  if not p_round_trip then
    v_wait := 0;
  end if;

  select s.round_trip_factor, s.included_wait_minutes into v_rt_factor, v_included
  from public.pricing_settings s where s.id = 1;

  delete from public.price_quotes q
  where q.passenger_id = auth.uid() and q.expires_at < now() - interval '1 hour';

  foreach v_type in array enum_range(null::public.vehicle_type) loop
    begin
      select q.price, q.distance_km into v_base, v_km
      from private.ride_quote(p_city_id, v_type, v_origin, v_destination, p_destination_city_id) q;

      if v_intercity then
        v_factor := 1.00;
        v_price := v_base;
        if p_round_trip then
          -- Ida e volta: a ida vezes o fator, com as horas de espera incluídas; o que passar cobra por minuto.
          v_price := round(v_base * coalesce(v_rt_factor, 1.5), 2)
            + round(coalesce(private.intercity_wait_per_min(p_city_id, v_type), 0) * greatest(0, v_wait - coalesce(v_included, 120)), 2);
        end if;
      else
        v_factor := private.pricing_factor(p_city_id, v_type);
        v_price := round(v_base * v_factor, 2);
      end if;

      insert into public.price_quotes (
        passenger_id, city_id, destination_city_id, vehicle_type,
        origin, destination, price, factor, distance_km, round_trip, wait_minutes
      )
      values (
        auth.uid(), p_city_id, p_destination_city_id, v_type,
        v_origin, v_destination, v_price, v_factor, v_km, p_round_trip, v_wait
      )
      returning * into v_quote;

      vehicle_type := v_type;
      quote_id := v_quote.id;
      price := v_quote.price;
      card_price := round(v_quote.price * (1 + private.card_surcharge()), 2);
      distance_km := v_quote.distance_km;
      expires_at := v_quote.expires_at;
      return next;
    exception when raise_exception then
      null;
    end;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Painel
-- ---------------------------------------------------------------------------

drop function public.staff_add_fare(bigint, public.vehicle_type, numeric, numeric, numeric, date, numeric, numeric);

create function public.staff_add_fare(
  p_city_id bigint,
  p_vehicle_type public.vehicle_type,
  p_base numeric,
  p_per_km numeric,
  p_per_min numeric,
  p_effective_from date,
  p_intercity_per_km numeric default null,
  p_intercity_wait_per_min numeric default null,
  p_intercity_t1_km numeric default null,
  p_intercity_rate2 numeric default null,
  p_intercity_t2_km numeric default null,
  p_intercity_rate3 numeric default null,
  p_city_far_km numeric default null,
  p_city_far_per_km numeric default null
)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_prev public.fares;
  v_r1 numeric;
  v_wait numeric;
  v_t1 numeric;
  v_r2 numeric;
  v_t2 numeric;
  v_r3 numeric;
  v_far_km numeric;
  v_far numeric;
begin
  perform private.require_staff();

  if p_base is null or p_per_km is null or p_per_min is null
     or p_base < 0 or p_per_km < 0 or p_per_min < 0
     or p_base > 500 or p_per_km > 500 or p_per_min > 500 then
    raise exception 'Confira os valores da tarifa (de 0 a 500)';
  end if;

  if p_effective_from is null then
    raise exception 'Diga a partir de que dia a tarifa vale';
  end if;

  -- O que não vier preenchido herda da tarifa em vigor (ou do padrão).
  select * into v_prev from public.fares f
  where f.city_id = p_city_id and f.vehicle_type = p_vehicle_type and f.effective_from <= current_date
  order by f.effective_from desc limit 1;

  v_r1 := coalesce(round(p_intercity_per_km, 2), v_prev.intercity_per_km, 1.70);
  v_wait := coalesce(round(p_intercity_wait_per_min, 2), v_prev.intercity_wait_per_min, 0.10);
  v_t1 := coalesce(round(p_intercity_t1_km, 1), v_prev.intercity_t1_km, 72);
  v_r2 := coalesce(round(p_intercity_rate2, 2), v_prev.intercity_rate2, 6.70);
  v_t2 := coalesce(round(p_intercity_t2_km, 1), v_prev.intercity_t2_km, 90);
  v_r3 := coalesce(round(p_intercity_rate3, 2), v_prev.intercity_rate3, 2.72);
  v_far_km := coalesce(round(p_city_far_km, 1), v_prev.city_far_km, 4);
  v_far := coalesce(round(p_city_far_per_km, 2), v_prev.city_far_per_km, 0.60);

  if v_r1 < 0 or v_r1 > 500 or v_wait < 0 or v_wait > 500 or v_r2 < 0 or v_r2 > 500
     or v_r3 < 0 or v_r3 > 500 or v_far < 0 or v_far > 500
     or v_t1 < 0 or v_t1 > 2000 or v_t2 < 0 or v_t2 > 2000 or v_far_km < 0 or v_far_km > 2000 then
    raise exception 'Confira os valores da tarifa';
  end if;
  if v_t2 < v_t1 then
    raise exception 'A segunda faixa precisa começar depois da primeira';
  end if;

  insert into public.fares (
    city_id, vehicle_type, base, per_km, per_min, effective_from,
    intercity_per_km, intercity_wait_per_min, intercity_t1_km, intercity_rate2, intercity_t2_km, intercity_rate3,
    city_far_km, city_far_per_km
  )
  values (
    p_city_id, p_vehicle_type, round(p_base, 2), round(p_per_km, 2), round(p_per_min, 2), p_effective_from,
    v_r1, v_wait, v_t1, v_r2, v_t2, v_r3, v_far_km, v_far
  )
  on conflict (city_id, vehicle_type, effective_from) do update
    set base = excluded.base, per_km = excluded.per_km, per_min = excluded.per_min,
        intercity_per_km = excluded.intercity_per_km, intercity_wait_per_min = excluded.intercity_wait_per_min,
        intercity_t1_km = excluded.intercity_t1_km, intercity_rate2 = excluded.intercity_rate2,
        intercity_t2_km = excluded.intercity_t2_km, intercity_rate3 = excluded.intercity_rate3,
        city_far_km = excluded.city_far_km, city_far_per_km = excluded.city_far_per_km;
end;
$$;

revoke execute on function public.staff_add_fare(bigint, public.vehicle_type, numeric, numeric, numeric, date, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric) from public, anon;
grant execute on function public.staff_add_fare(bigint, public.vehicle_type, numeric, numeric, numeric, date, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric) to authenticated;

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
        'intercity_per_km', f.intercity_per_km, 'intercity_wait_per_min', f.intercity_wait_per_min,
        'intercity_t1_km', f.intercity_t1_km, 'intercity_rate2', f.intercity_rate2,
        'intercity_t2_km', f.intercity_t2_km, 'intercity_rate3', f.intercity_rate3,
        'city_far_km', f.city_far_km, 'city_far_per_km', f.city_far_per_km,
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
      round_trip_factor = coalesce((p_patch ->> 'round_trip_factor')::numeric, s.round_trip_factor),
      included_wait_minutes = coalesce((p_patch ->> 'included_wait_minutes')::smallint, s.included_wait_minutes),
      updated_at = now()
  where s.id = 1;
exception
  when check_violation then
    raise exception 'Um dos valores está fora do limite permitido';
end;
$$;
