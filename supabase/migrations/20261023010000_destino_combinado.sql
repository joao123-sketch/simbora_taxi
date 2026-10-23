-- Destino livre dentro da cidade (de e para sítios e distritos tudo bem).
-- Em viagem para outra cidade, o passageiro pode pedir um ponto de entrega
-- combinado com o motorista, que vê o pedido e decide se aceita.

-- ---------------------------------------------------------------------------
-- Sai o limite de raio da Etapa 1
-- ---------------------------------------------------------------------------

create or replace function public.quote_ride(
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

drop function public.request_ride(
  bigint, public.vehicle_type, public.payment_method,
  double precision, double precision, text,
  double precision, double precision, text, bigint
);
drop function private.assert_destination_in_city(bigint, extensions.geography, bigint);

drop view public.cities_map;
alter table public.cities drop column service_radius_km;

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

-- ---------------------------------------------------------------------------
-- Lugar de entrega combinado (só em viagem para outra cidade)
-- ---------------------------------------------------------------------------

-- Onde o passageiro quer ser deixado, escrito por ele. Só existe em viagem para
-- outra cidade; nulo quer dizer o centro, com o preço fechado.
alter table public.rides add column destination_place text;

drop view public.ride_details;

create view public.ride_details
with (security_invoker = true)
as
select
  r.id,
  r.status,
  r.vehicle_type,
  r.payment_method,
  r.passenger_id,
  r.driver_id,
  r.city_id,
  r.destination_city_id,
  r.origin_address,
  extensions.st_y(r.origin::extensions.geometry) as origin_lat,
  extensions.st_x(r.origin::extensions.geometry) as origin_lng,
  r.destination_address,
  r.destination_place,
  extensions.st_y(r.destination::extensions.geometry) as destination_lat,
  extensions.st_x(r.destination::extensions.geometry) as destination_lng,
  r.distance_km,
  r.estimated_price,
  r.final_price,
  r.requested_at,
  p.full_name as passenger_name,
  dp.full_name as driver_name,
  d.vehicle_model,
  d.vehicle_color,
  d.vehicle_plate
from public.rides r
left join public.profiles p on p.id = r.passenger_id
left join public.drivers d on d.id = r.driver_id
left join public.profiles dp on dp.id = r.driver_id;

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
  p_destination_city_id bigint default null,
  p_destination_place text default null
)
returns bigint
language plpgsql
security definer set search_path = ''
as $$
declare
  v_origin extensions.geography := private.point(p_origin_lng, p_origin_lat);
  v_destination extensions.geography := private.point(p_destination_lng, p_destination_lat);
  v_intercity boolean := p_destination_city_id is not null and p_destination_city_id <> p_city_id;
  v_place text := nullif(trim(coalesce(p_destination_place, '')), '');
  v_price numeric;
  v_km numeric;
  v_ride_id bigint;
begin
  if auth.uid() is null then
    raise exception 'Faça login para pedir corrida';
  end if;

  if not exists (select 1 from public.cities c where c.id = p_city_id and c.active) then
    raise exception 'O Simbora Car ainda não atende essa cidade';
  end if;

  -- Lugar combinado só existe em viagem para outra cidade, e precisa dizer onde.
  if v_place is not null then
    if not v_intercity then
      raise exception 'Lugar combinado só vale em viagem para outra cidade';
    end if;
    if length(v_place) < 3 then
      raise exception 'Diga onde o motorista deve deixar você';
    end if;
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
    origin, origin_address, destination, destination_address, destination_place,
    distance_km, estimated_price
  )
  values (
    auth.uid(), p_city_id, p_destination_city_id, p_vehicle_type, p_payment_method,
    v_origin, p_origin_address, v_destination, p_destination_address, v_place,
    v_km, v_price
  )
  returning id into v_ride_id;

  return v_ride_id;
end;
$$;

revoke execute on function public.request_ride(
  bigint, public.vehicle_type, public.payment_method,
  double precision, double precision, text,
  double precision, double precision, text, bigint, text
) from public, anon;
grant execute on function public.request_ride(
  bigint, public.vehicle_type, public.payment_method,
  double precision, double precision, text,
  double precision, double precision, text, bigint, text
) to authenticated;
