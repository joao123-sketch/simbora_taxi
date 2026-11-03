-- Tarifa própria da viagem entre cidades. Na estrada o carro anda a 100 km/h e não pega o trânsito da cidade,
-- então o preço usa um valor por km e um valor por minuto de espera próprios (ajustáveis no painel),
-- e o tempo de viagem é contado a 100 km/h.

alter table public.fares
  add column intercity_per_km numeric(6, 2) not null default 0.80 check (intercity_per_km between 0 and 500),
  add column intercity_wait_per_min numeric(6, 2) not null default 0.10 check (intercity_wait_per_min between 0 and 500);

update public.fares set intercity_per_km = 0.55, intercity_wait_per_min = 0.07 where vehicle_type = 'moto';

create function private.intercity_wait_per_min(p_city_id bigint, p_vehicle_type public.vehicle_type)
returns numeric
language sql
stable
security definer set search_path = ''
as $$
  select f.intercity_wait_per_min
  from public.fares f
  where f.city_id = p_city_id
    and f.vehicle_type = p_vehicle_type
    and f.effective_from <= current_date
  order by f.effective_from desc
  limit 1;
$$;

revoke execute on function private.intercity_wait_per_min(bigint, public.vehicle_type) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Preço da viagem entre cidades: bandeirada + valor por km próprio + tempo a 100 km/h
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
      round(v_fare.base + v_fare.intercity_per_km * v_km + v_fare.per_min * (v_km / 100 * 60), 2),
      v_km;
  else
    return query select
      round(v_fare.base + v_fare.per_km * v_km + v_fare.per_min * (v_km / 30 * 60), 2),
      v_km;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cotação: a espera da ida e volta usa o valor por minuto de espera da viagem entre cidades
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
          -- A ida dobrada (ida e volta) mais a espera pelo valor por minuto de espera.
          v_price := v_base * 2 + round(coalesce(private.intercity_wait_per_min(p_city_id, v_type), 0) * v_wait, 2);
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
-- Painel: os dois valores novos na tarifa
-- ---------------------------------------------------------------------------

drop function public.staff_add_fare(bigint, public.vehicle_type, numeric, numeric, numeric, date);

create function public.staff_add_fare(
  p_city_id bigint,
  p_vehicle_type public.vehicle_type,
  p_base numeric,
  p_per_km numeric,
  p_per_min numeric,
  p_effective_from date,
  p_intercity_per_km numeric default null,
  p_intercity_wait_per_min numeric default null
)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  perform private.require_staff();

  if p_base is null or p_per_km is null or p_per_min is null
     or p_base < 0 or p_per_km < 0 or p_per_min < 0
     or p_base > 500 or p_per_km > 500 or p_per_min > 500
     or p_intercity_per_km < 0 or p_intercity_per_km > 500
     or p_intercity_wait_per_min < 0 or p_intercity_wait_per_min > 500 then
    raise exception 'Confira os valores da tarifa (de 0 a 500)';
  end if;

  if p_effective_from is null then
    raise exception 'Diga a partir de que dia a tarifa vale';
  end if;

  -- Sem os valores de viagem entre cidades, a tarifa nova herda os da tarifa em vigor (ou o padrão).
  insert into public.fares (city_id, vehicle_type, base, per_km, per_min, effective_from, intercity_per_km, intercity_wait_per_min)
  values (
    p_city_id, p_vehicle_type, round(p_base, 2), round(p_per_km, 2), round(p_per_min, 2), p_effective_from,
    coalesce(round(p_intercity_per_km, 2), (
      select f.intercity_per_km from public.fares f
      where f.city_id = p_city_id and f.vehicle_type = p_vehicle_type and f.effective_from <= current_date
      order by f.effective_from desc limit 1), 0.80),
    coalesce(round(p_intercity_wait_per_min, 2), (
      select f.intercity_wait_per_min from public.fares f
      where f.city_id = p_city_id and f.vehicle_type = p_vehicle_type and f.effective_from <= current_date
      order by f.effective_from desc limit 1), 0.10)
  )
  on conflict (city_id, vehicle_type, effective_from) do update
    set base = excluded.base, per_km = excluded.per_km, per_min = excluded.per_min,
        intercity_per_km = case when p_intercity_per_km is null then public.fares.intercity_per_km else excluded.intercity_per_km end,
        intercity_wait_per_min = case when p_intercity_wait_per_min is null then public.fares.intercity_wait_per_min else excluded.intercity_wait_per_min end;
end;
$$;

revoke execute on function public.staff_add_fare(bigint, public.vehicle_type, numeric, numeric, numeric, date, numeric, numeric) from public, anon;
grant execute on function public.staff_add_fare(bigint, public.vehicle_type, numeric, numeric, numeric, date, numeric, numeric) to authenticated;

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
