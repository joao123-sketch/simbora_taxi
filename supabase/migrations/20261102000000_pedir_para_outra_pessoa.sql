-- Pedir viagem para outra pessoa: o passageiro (quem tem a conta) escolhe o
-- ponto de embarque e diz o nome de quem vai andar. O motorista vê esse nome
-- no lugar do nome de quem pediu. Quem pediu continua sendo o dono da corrida
-- (acompanha, cancela, avalia e paga como sempre).

alter table public.rides
  add column rider_name text check (char_length(rider_name) between 2 and 80);

-- Igual ao request_ride, mais o nome de quem vai andar. Chama o request_ride e
-- grava o nome na mesma transação, então o pedido nunca chega ao motorista sem o nome.
create function public.request_ride_for_other(
  p_rider_name text,
  p_city_id bigint,
  p_vehicle_type public.vehicle_type,
  p_payment_method public.payment_method,
  p_origin_lng double precision,
  p_origin_lat double precision,
  p_origin_address text,
  p_destination_lng double precision,
  p_destination_lat double precision,
  p_destination_address text,
  p_quote_id uuid,
  p_destination_city_id bigint default null,
  p_destination_place text default null,
  p_round_trip boolean default false,
  p_wait_minutes int default 0,
  p_scheduled_for timestamptz default null
)
returns bigint
language plpgsql
security definer set search_path = ''
as $$
declare
  v_name text := nullif(trim(coalesce(p_rider_name, '')), '');
  v_ride_id bigint;
begin
  if auth.uid() is null then
    raise exception 'Entre no app para pedir uma corrida';
  end if;
  if v_name is null or char_length(v_name) < 2 then
    raise exception 'Diga o nome de quem vai andar';
  end if;

  v_ride_id := public.request_ride(
    p_city_id, p_vehicle_type, p_payment_method,
    p_origin_lng, p_origin_lat, p_origin_address,
    p_destination_lng, p_destination_lat, p_destination_address,
    p_quote_id, p_destination_city_id, p_destination_place,
    p_round_trip, p_wait_minutes, p_scheduled_for
  );

  update public.rides set rider_name = left(v_name, 80) where id = v_ride_id and passenger_id = auth.uid();
  return v_ride_id;
end;
$$;

revoke execute on function public.request_ride_for_other(
  text, bigint, public.vehicle_type, public.payment_method,
  double precision, double precision, text,
  double precision, double precision, text, uuid, bigint, text, boolean, int, timestamptz
) from public, anon;
grant execute on function public.request_ride_for_other(
  text, bigint, public.vehicle_type, public.payment_method,
  double precision, double precision, text,
  double precision, double precision, text, uuid, bigint, text, boolean, int, timestamptz
) to authenticated;

-- ---------------------------------------------------------------------------
-- A view de corridas mostra o nome de quem vai andar
-- ---------------------------------------------------------------------------

drop view public.ride_details;

create view public.ride_details
with (security_invoker = true)
as
select
  r.id,
  r.status,
  r.scheduled_for,
  r.kind,
  r.package_size,
  r.recipient_name,
  r.recipient_note,
  r.rider_name,
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
  r.extra_amount,
  r.advance_percent,
  r.advance_received_at,
  r.round_trip,
  r.wait_minutes,
  r.final_price,
  r.requested_at,
  r.completed_at,
  r.cancelled_at,
  private.my_rating(r.id) as my_rating,
  coalesce(r.rider_name, p.full_name) as passenger_name,
  dp.full_name as driver_name,
  d.vehicle_model,
  d.vehicle_color,
  d.vehicle_plate
from public.rides r
left join public.profiles p on p.id = r.passenger_id
left join public.drivers d on d.id = r.driver_id
left join public.profiles dp on dp.id = r.driver_id;

grant select on public.ride_details to authenticated;

-- ---------------------------------------------------------------------------
-- A lista de viagens agendadas do motorista mostra o nome de quem vai andar
-- ---------------------------------------------------------------------------

create or replace function public.open_scheduled_rides()
returns table (
  ride_id bigint,
  scheduled_for timestamptz,
  vehicle_type public.vehicle_type,
  payment_method public.payment_method,
  origin_address text,
  origin_lat double precision,
  origin_lng double precision,
  destination_address text,
  destination_lat double precision,
  destination_lng double precision,
  destination_city_name text,
  destination_place text,
  estimated_price numeric,
  distance_km numeric,
  round_trip boolean,
  wait_minutes int,
  passenger_first_name text,
  conflict boolean
)
language plpgsql
volatile
security definer set search_path = ''
as $$
begin
  perform public.expire_scheduled_rides();

  return query
  select
    r.id,
    r.scheduled_for,
    r.vehicle_type,
    r.payment_method,
    r.origin_address,
    extensions.st_y(r.origin::extensions.geometry),
    extensions.st_x(r.origin::extensions.geometry),
    r.destination_address,
    extensions.st_y(r.destination::extensions.geometry),
    extensions.st_x(r.destination::extensions.geometry),
    c.name,
    r.destination_place,
    r.estimated_price,
    r.distance_km,
    r.round_trip,
    r.wait_minutes,
    split_part(coalesce(r.rider_name, p.full_name, ''), ' ', 1),
    private.scheduled_conflict(d.id, r.scheduled_for)
  from public.rides r
  join public.drivers d on d.id = (select auth.uid())
  join public.cities c on c.id = r.destination_city_id
  join public.profiles p on p.id = r.passenger_id
  where r.status = 'requested'
    and r.scheduled_for is not null
    and r.scheduled_for > now()
    and d.status = 'approved'
    and d.city_id = r.city_id
    and d.vehicle_type = r.vehicle_type
    and r.payment_method = any (d.accepted_payments)
    and r.passenger_id <> d.id
    and private.fee_ok(d.id)
  order by r.scheduled_for;
end;
$$;
