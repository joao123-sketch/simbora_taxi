-- Várias cidades: raio de atendimento por cidade, conferência da origem na cotação
-- e "abrir cidade" (cria, copia as tarifas de uma cidade modelo e ativa de uma vez).
-- O destino continua livre (dentro da cidade ou em outra cidade); só a origem é conferida.

alter table public.cities
  add column radius_km numeric(5, 2) not null default 8 check (radius_km between 1 and 50);

drop view public.cities_map;

create view public.cities_map
with (security_invoker = true)
as
select
  id,
  name,
  state,
  active,
  extensions.st_y(center::extensions.geometry) as lat,
  extensions.st_x(center::extensions.geometry) as lng,
  radius_km
from public.cities;

grant select on public.cities_map to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Origem dentro do raio da cidade
-- ---------------------------------------------------------------------------

create function private.assert_origin_in_city(
  p_city_id bigint,
  p_origin extensions.geography
)
returns void
language plpgsql
stable
security definer set search_path = ''
as $$
declare
  v_center extensions.geography;
  v_radius numeric;
begin
  select c.center, c.radius_km into v_center, v_radius
  from public.cities c
  where c.id = p_city_id;

  if v_center is null then
    raise exception 'Cidade não encontrada';
  end if;

  if extensions.st_distance(p_origin, v_center) > v_radius * 1000 then
    raise exception 'Você está fora da área desta cidade. O Simbora Car atende só perto do centro de cada cidade aberta.';
  end if;
end;
$$;

revoke execute on function private.assert_origin_in_city(bigint, extensions.geography) from public, anon, authenticated;

-- Mesma cotação de 20261109000000_faixas_de_preco.sql, com a conferência da origem
-- logo depois do login (fora do bloco por veículo, para o erro chegar ao app).
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

  perform private.assert_origin_in_city(p_city_id, v_origin);

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
-- Painel: abrir cidade e mudar o raio
-- ---------------------------------------------------------------------------

create function public.staff_open_city(
  p_name text,
  p_state text,
  p_lat double precision,
  p_lng double precision,
  p_radius_km numeric,
  p_copy_fares_from bigint
)
returns bigint
language plpgsql
security definer set search_path = ''
as $$
declare
  v_name text := trim(coalesce(p_name, ''));
  v_state text := upper(trim(coalesce(p_state, '')));
  v_id bigint;
  v_copied int;
begin
  perform private.require_staff();

  if length(v_name) < 2 or length(v_name) > 60 then
    raise exception 'O nome da cidade tem de 2 a 60 letras';
  end if;
  if v_state !~ '^[A-Z]{2}$' then
    raise exception 'O estado são 2 letras, como CE';
  end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'Confira a latitude e a longitude da cidade';
  end if;
  if p_radius_km is null or p_radius_km < 1 or p_radius_km > 50 then
    raise exception 'O raio vai de 1 a 50 km';
  end if;

  -- A cidade modelo precisa ter tarifa vigente de carro e de moto.
  if (
    select count(distinct f.vehicle_type)
    from public.fares f
    where f.city_id = p_copy_fares_from and f.effective_from <= current_date
  ) < 2 then
    raise exception 'A cidade modelo precisa ter tarifa de carro e de moto';
  end if;

  insert into public.cities (name, state, active, center, radius_km)
  values (v_name, v_state, true, private.point(p_lng, p_lat), p_radius_km)
  returning id into v_id;

  insert into public.fares (
    city_id, vehicle_type, effective_from, base, per_km, per_min,
    intercity_per_km, intercity_wait_per_min, intercity_t1_km, intercity_rate2,
    intercity_t2_km, intercity_rate3, city_far_km, city_far_per_km
  )
  select
    v_id, f.vehicle_type, current_date, f.base, f.per_km, f.per_min,
    f.intercity_per_km, f.intercity_wait_per_min, f.intercity_t1_km, f.intercity_rate2,
    f.intercity_t2_km, f.intercity_rate3, f.city_far_km, f.city_far_per_km
  from (
    select distinct on (f2.vehicle_type) f2.*
    from public.fares f2
    where f2.city_id = p_copy_fares_from and f2.effective_from <= current_date
    order by f2.vehicle_type, f2.effective_from desc
  ) f;
  get diagnostics v_copied = row_count;

  if v_copied < 2 then
    raise exception 'Não foi possível copiar as tarifas';
  end if;

  return v_id;
exception
  when unique_violation then
    raise exception 'Essa cidade já existe';
end;
$$;

revoke execute on function public.staff_open_city(text, text, double precision, double precision, numeric, bigint) from public, anon;
grant execute on function public.staff_open_city(text, text, double precision, double precision, numeric, bigint) to authenticated;

create function public.staff_set_city_radius(p_city_id bigint, p_radius_km numeric)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  perform private.require_staff();

  if p_radius_km is null or p_radius_km < 1 or p_radius_km > 50 then
    raise exception 'O raio vai de 1 a 50 km';
  end if;

  update public.cities set radius_km = p_radius_km where id = p_city_id;
  if not found then
    raise exception 'Cidade não encontrada';
  end if;
end;
$$;

revoke execute on function public.staff_set_city_radius(bigint, numeric) from public, anon;
grant execute on function public.staff_set_city_radius(bigint, numeric) to authenticated;
