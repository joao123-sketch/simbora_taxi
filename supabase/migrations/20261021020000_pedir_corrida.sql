-- Pedir corrida: o preço é calculado no banco, nunca pelo app.

-- Centro de cada cidade: destino das corridas intermunicipais e ponto
-- inicial do mapa. Coordenadas aproximadas.
alter table public.cities add column center extensions.geography(point, 4326);

update public.cities set center = extensions.st_setsrid(extensions.st_makepoint(-40.7475, -4.1670), 4326)::extensions.geography
  where name = 'Guaraciaba do Norte' and state = 'CE';
update public.cities set center = extensions.st_setsrid(extensions.st_makepoint(-40.9210, -3.8545), 4326)::extensions.geography
  where name = 'Ubajara' and state = 'CE';
update public.cities set center = extensions.st_setsrid(extensions.st_makepoint(-40.9917, -3.7322), 4326)::extensions.geography
  where name = 'Tianguá' and state = 'CE';
update public.cities set center = extensions.st_setsrid(extensions.st_makepoint(-40.8650, -4.0485), 4326)::extensions.geography
  where name = 'São Benedito' and state = 'CE';

-- O app lê latitude e longitude prontas, sem lidar com PostGIS.
create view public.cities_map
with (security_invoker = true)
as
select
  id,
  name,
  state,
  active,
  extensions.st_y(center::extensions.geometry) as lat,
  extensions.st_x(center::extensions.geometry) as lng
from public.cities;

-- Preço de uma corrida. Sem API de rotas por enquanto: distância em linha
-- reta x 1,3 e velocidade média de 30 km/h para o tempo.
create function private.ride_quote(
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
  v_fixed numeric;
  v_fare public.fares;
begin
  v_km := round((extensions.st_distance(p_origin, p_destination) / 1000 * 1.3)::numeric, 2);

  if p_destination_city_id is not null and p_destination_city_id <> p_city_id then
    select f.price into v_fixed
    from public.intercity_fares f
    where f.origin_city_id = p_city_id
      and f.destination_city_id = p_destination_city_id
      and f.vehicle_type = p_vehicle_type;

    if v_fixed is null then
      raise exception 'Sem preço para essa cidade';
    end if;
    return query select v_fixed, v_km;
    return;
  end if;

  select * into v_fare
  from public.fares f
  where f.city_id = p_city_id and f.vehicle_type = p_vehicle_type;

  if not found then
    raise exception 'Sem tarifa para essa cidade';
  end if;

  return query select
    greatest(v_fare.minimum, round(v_fare.base + v_fare.per_km * v_km + v_fare.per_min * (v_km / 30 * 60), 2)),
    v_km;
end;
$$;

revoke execute on function private.ride_quote(bigint, public.vehicle_type, extensions.geography, extensions.geography, bigint) from public, anon, authenticated;

create function private.point(p_lng double precision, p_lat double precision)
returns extensions.geography
language sql
immutable
set search_path = ''
as $$
  select extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
$$;

-- Preços de carro e moto para mostrar antes de pedir. Some da lista o tipo
-- que não tem tarifa (ex.: moto sem preço para outra cidade).
create function public.quote_ride(
  p_city_id bigint,
  p_origin_lng double precision,
  p_origin_lat double precision,
  p_destination_lng double precision,
  p_destination_lat double precision,
  p_destination_city_id bigint default null
)
returns table (vehicle_type public.vehicle_type, price numeric, distance_km numeric)
language plpgsql
stable
security definer set search_path = ''
as $$
declare
  v_type public.vehicle_type;
  v_price numeric;
  v_km numeric;
begin
  foreach v_type in array enum_range(null::public.vehicle_type) loop
    begin
      select q.price, q.distance_km into v_price, v_km
      from private.ride_quote(
        p_city_id, v_type,
        private.point(p_origin_lng, p_origin_lat),
        private.point(p_destination_lng, p_destination_lat),
        p_destination_city_id
      ) q;

      vehicle_type := v_type;
      price := v_price;
      distance_km := v_km;
      return next;
    exception when raise_exception then
      null;
    end;
  end loop;
end;
$$;

revoke execute on function public.quote_ride(bigint, double precision, double precision, double precision, double precision, bigint) from public, anon;
grant execute on function public.quote_ride(bigint, double precision, double precision, double precision, double precision, bigint) to authenticated;

-- O passageiro só cria corrida por aqui: o preço vem do banco e ninguém
-- tem duas corridas abertas ao mesmo tempo.
create function public.request_ride(
  p_city_id bigint,
  p_vehicle_type public.vehicle_type,
  p_payment_method public.payment_method,
  p_origin_lng double precision,
  p_origin_lat double precision,
  p_origin_address text,
  p_destination_lng double precision,
  p_destination_lat double precision,
  p_destination_address text,
  p_destination_city_id bigint default null
)
returns bigint
language plpgsql
security definer set search_path = ''
as $$
declare
  v_origin extensions.geography := private.point(p_origin_lng, p_origin_lat);
  v_destination extensions.geography := private.point(p_destination_lng, p_destination_lat);
  v_price numeric;
  v_km numeric;
  v_ride_id bigint;
begin
  if auth.uid() is null then
    raise exception 'Faça login para pedir corrida';
  end if;

  if not exists (select 1 from public.cities c where c.id = p_city_id and c.active) then
    raise exception 'O Simbora ainda não atende essa cidade';
  end if;

  if exists (
    select 1 from public.rides r
    where r.passenger_id = auth.uid()
      and r.status in ('requested', 'accepted', 'arrived', 'in_progress')
  ) then
    raise exception 'Você já tem uma corrida em andamento';
  end if;

  select q.price, q.distance_km into v_price, v_km
  from private.ride_quote(p_city_id, p_vehicle_type, v_origin, v_destination, p_destination_city_id) q;

  insert into public.rides (
    passenger_id, city_id, destination_city_id, vehicle_type, payment_method,
    origin, origin_address, destination, destination_address,
    distance_km, estimated_price
  )
  values (
    auth.uid(), p_city_id, p_destination_city_id, p_vehicle_type, p_payment_method,
    v_origin, p_origin_address, v_destination, p_destination_address,
    v_km, v_price
  )
  returning id into v_ride_id;

  return v_ride_id;
end;
$$;

revoke execute on function public.request_ride(bigint, public.vehicle_type, public.payment_method, double precision, double precision, text, double precision, double precision, text, bigint) from public, anon;
grant execute on function public.request_ride(bigint, public.vehicle_type, public.payment_method, double precision, double precision, text, double precision, double precision, text, bigint) to authenticated;

drop policy "passageiro pede corrida" on public.rides;
