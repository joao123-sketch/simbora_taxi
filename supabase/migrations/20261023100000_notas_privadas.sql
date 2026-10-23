-- Notas escondidas: quem recebe uma nota não consegue ler a que o outro deu.
-- Antes elas ficavam em colunas de `rides`, que passageiro e motorista da corrida
-- podem ler. Agora ficam numa tabela sem nenhuma permissão para o app, e cada um
-- só vê a nota que ele mesmo deu (pelo histórico).

create table public.ride_ratings (
  ride_id bigint primary key references public.rides (id) on delete cascade,
  passenger_to_driver smallint check (passenger_to_driver between 1 and 5),
  driver_to_passenger smallint check (driver_to_passenger between 1 and 5),
  updated_at timestamptz not null default now()
);

alter table public.ride_ratings enable row level security;
revoke all on public.ride_ratings from anon, authenticated;

insert into public.ride_ratings (ride_id, passenger_to_driver, driver_to_passenger)
select r.id, r.driver_rating, r.passenger_rating
from public.rides r
where r.driver_rating is not null or r.passenger_rating is not null;

drop view public.driver_stats;
drop view public.ride_details;

alter table public.rides drop column driver_rating;
alter table public.rides drop column passenger_rating;

-- A nota que o usuário logado deu nesta corrida (passageiro avalia o motorista e vice-versa).
create function private.my_rating(p_ride_id bigint)
returns smallint
language sql
stable
security definer set search_path = ''
as $$
  select case
    when r.passenger_id = (select auth.uid()) then x.passenger_to_driver
    when r.driver_id = (select auth.uid()) then x.driver_to_passenger
  end
  from public.rides r
  left join public.ride_ratings x on x.ride_id = r.id
  where r.id = p_ride_id;
$$;

revoke execute on function private.my_rating(bigint) from public, anon;
grant execute on function private.my_rating(bigint) to authenticated;

create or replace function public.rate_ride(p_ride_id bigint, p_stars int)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_ride public.rides;
begin
  if p_stars is null or p_stars < 1 or p_stars > 5 then
    raise exception 'A nota vai de 1 a 5 estrelas';
  end if;

  select * into v_ride from public.rides r where r.id = p_ride_id and r.status = 'completed';
  if not found then
    raise exception 'Só dá para avaliar uma corrida concluída';
  end if;

  if v_ride.passenger_id = auth.uid() then
    insert into public.ride_ratings as x (ride_id, passenger_to_driver)
    values (p_ride_id, p_stars)
    on conflict (ride_id) do update
      set passenger_to_driver = excluded.passenger_to_driver, updated_at = now()
      where x.passenger_to_driver is null;
  elsif v_ride.driver_id = auth.uid() then
    insert into public.ride_ratings as x (ride_id, driver_to_passenger)
    values (p_ride_id, p_stars)
    on conflict (ride_id) do update
      set driver_to_passenger = excluded.driver_to_passenger, updated_at = now()
      where x.driver_to_passenger is null;
  else
    raise exception 'Corrida não encontrada';
  end if;

  if not found then
    raise exception 'Você já avaliou essa corrida';
  end if;
end;
$$;

create view public.driver_stats
with (security_invoker = true)
as
with base as (
  select
    d.id as driver_id,
    d.vehicle_plate,
    (select count(*) from public.rides r where r.driver_id = d.id and r.status = 'completed') as completed_rides,
    (select count(*) from public.rides r
       where r.driver_id = d.id and r.status = 'cancelled' and r.cancelled_by = d.id) as cancelled_by_driver,
    (select count(x.passenger_to_driver) from public.rides r
       join public.ride_ratings x on x.ride_id = r.id where r.driver_id = d.id) as rating_count,
    (select avg(x.passenger_to_driver) from public.rides r
       join public.ride_ratings x on x.ride_id = r.id where r.driver_id = d.id) as rating_avg,
    (select count(*) from public.ride_offers o where o.driver_id = d.id and o.status = 'accepted') as offers_accepted,
    (select count(*) from public.ride_offers o where o.driver_id = d.id and o.status = 'declined') as offers_declined
  from public.drivers d
)
select
  b.driver_id,
  b.vehicle_plate,
  b.completed_rides,
  b.rating_count,
  round(b.rating_avg, 2) as rating_avg,
  round(private.adjusted_rating(b.rating_count::int, b.rating_avg), 2) as adjusted_rating,
  round(b.offers_accepted::numeric / nullif(b.offers_accepted + b.offers_declined, 0), 3) as accept_rate,
  round(b.cancelled_by_driver::numeric / nullif(b.completed_rides + b.cancelled_by_driver, 0), 3) as cancel_rate,
  (b.completed_rides < 20) as is_new,
  private.driver_score(
    b.completed_rides::int, b.rating_count::int, b.rating_avg,
    b.offers_accepted::int, b.offers_declined::int, b.cancelled_by_driver::int
  ) as score
from base b
order by b.completed_rides desc;

revoke all on public.driver_stats from anon, authenticated;

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
  r.extra_amount,
  r.final_price,
  r.requested_at,
  r.completed_at,
  r.cancelled_at,
  private.my_rating(r.id) as my_rating,
  p.full_name as passenger_name,
  dp.full_name as driver_name,
  d.vehicle_model,
  d.vehicle_color,
  d.vehicle_plate
from public.rides r
left join public.profiles p on p.id = r.passenger_id
left join public.drivers d on d.id = r.driver_id
left join public.profiles dp on dp.id = r.driver_id;
