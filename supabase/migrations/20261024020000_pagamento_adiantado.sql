-- Etapa 12: pagamento adiantado nas viagens para outra cidade.
-- O passageiro paga direto ao motorista (Pix ou dinheiro). O motorista escolhe
-- quanto quer adiantado (50%, 70% ou 100% do valor) e, quando receber, marca
-- "recebi". Só então a viagem pode começar.

alter table public.rides
  add column advance_percent smallint check (advance_percent in (50, 70, 100)),
  add column advance_received_at timestamptz;

-- Viagem entre cidades = destino em outra cidade.
create function private.is_intercity(p_ride public.rides)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_ride.destination_city_id is not null and p_ride.destination_city_id <> p_ride.city_id;
$$;

revoke execute on function private.is_intercity(public.rides) from public, anon, authenticated;

-- O motorista diz quanto quer adiantado.
create function public.set_advance_percent(p_ride_id bigint, p_percent int)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if p_percent is null or p_percent not in (50, 70, 100) then
    raise exception 'Escolha 50%%, 70%% ou 100%%';
  end if;

  update public.rides r
  set advance_percent = p_percent
  where r.id = p_ride_id
    and r.driver_id = auth.uid()
    and r.status in ('accepted', 'arrived')
    and private.is_intercity(r)
    and r.advance_received_at is null;

  if not found then
    raise exception 'Não dá para escolher o adiantamento agora';
  end if;
end;
$$;

revoke execute on function public.set_advance_percent(bigint, int) from public, anon;
grant execute on function public.set_advance_percent(bigint, int) to authenticated;

-- O motorista marca que recebeu o adiantamento.
create function public.confirm_advance_received(p_ride_id bigint)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  update public.rides r
  set advance_received_at = now()
  where r.id = p_ride_id
    and r.driver_id = auth.uid()
    and r.status in ('accepted', 'arrived')
    and private.is_intercity(r)
    and r.advance_percent is not null
    and r.advance_received_at is null;

  if not found then
    raise exception 'Escolha quanto pediu adiantado antes de confirmar o recebimento';
  end if;
end;
$$;

revoke execute on function public.confirm_advance_received(bigint) from public, anon;
grant execute on function public.confirm_advance_received(bigint) to authenticated;

-- Iniciar a viagem entre cidades só depois do "recebi".
create or replace function public.advance_ride(p_ride_id bigint)
returns public.ride_status
language plpgsql
security definer set search_path = ''
as $$
declare
  v_ride public.rides;
  v_status public.ride_status;
begin
  select * into v_ride
  from public.rides r
  where r.id = p_ride_id
    and r.driver_id = auth.uid()
    and r.status in ('accepted', 'arrived', 'in_progress')
  for update;

  if not found then
    raise exception 'Corrida não pode avançar';
  end if;

  if v_ride.status = 'arrived' and private.is_intercity(v_ride) and v_ride.advance_received_at is null then
    raise exception 'Confirme que recebeu o pagamento adiantado antes de iniciar a viagem';
  end if;

  update public.rides
  set
    status = case status
      when 'accepted' then 'arrived'::public.ride_status
      when 'arrived' then 'in_progress'::public.ride_status
      when 'in_progress' then 'completed'::public.ride_status
    end,
    started_at = case when status = 'arrived' then now() else started_at end,
    completed_at = case when status = 'in_progress' then now() else completed_at end,
    final_price = case when status = 'in_progress' then estimated_price else final_price end
  where id = p_ride_id
  returning status into v_status;

  return v_status;
end;
$$;

-- A view de corridas passa a trazer o adiantamento (passageiro e motorista veem).
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
  r.extra_amount,
  r.advance_percent,
  r.advance_received_at,
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
