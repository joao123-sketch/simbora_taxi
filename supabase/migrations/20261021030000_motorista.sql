-- Lado do motorista: detalhes da corrida com nomes e coordenadas prontas,
-- e envio da localização enquanto está online.

-- O RLS das tabelas de origem continua valendo (security_invoker): o
-- motorista só vê o nome e o telefone do passageiro depois de aceitar, e
-- o passageiro só vê o motorista da própria corrida.
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
  extensions.st_y(r.destination::extensions.geometry) as destination_lat,
  extensions.st_x(r.destination::extensions.geometry) as destination_lng,
  r.distance_km,
  r.estimated_price,
  r.final_price,
  r.requested_at,
  p.full_name as passenger_name,
  p.phone as passenger_phone,
  dp.full_name as driver_name,
  dp.phone as driver_phone,
  d.vehicle_model,
  d.vehicle_color,
  d.vehicle_plate
from public.rides r
left join public.profiles p on p.id = r.passenger_id
left join public.drivers d on d.id = r.driver_id
left join public.profiles dp on dp.id = r.driver_id;

create function public.update_driver_location(
  p_lng double precision,
  p_lat double precision,
  p_heading real default null
)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not private.is_approved_driver() then
    raise exception 'Motorista não aprovado';
  end if;

  insert into public.driver_locations (driver_id, position, heading, updated_at)
  values (auth.uid(), private.point(p_lng, p_lat), p_heading, now())
  on conflict (driver_id) do update
  set position = excluded.position, heading = excluded.heading, updated_at = excluded.updated_at;
end;
$$;

revoke execute on function public.update_driver_location(double precision, double precision, real) from public, anon;
grant execute on function public.update_driver_location(double precision, double precision, real) to authenticated;

-- Motorista não fica offline no meio de uma corrida, para não sumir do mapa
-- do passageiro.
create or replace function public.set_driver_online(p_online boolean)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not p_online and exists (
    select 1 from public.rides r
    where r.driver_id = auth.uid() and r.status in ('accepted', 'arrived', 'in_progress')
  ) then
    raise exception 'Termine a corrida antes de ficar offline';
  end if;

  update public.drivers
  set is_online = p_online
  where id = auth.uid() and status = 'approved';

  if not found then
    raise exception 'Motorista não aprovado';
  end if;
end;
$$;
