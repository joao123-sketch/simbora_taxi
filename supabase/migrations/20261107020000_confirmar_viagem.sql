-- Confirmação da viagem agendada. Depois de fechada com um motorista, a viagem precisa de "Confirmar viagem":
-- o botão libera 12 horas antes; o prazo vai até 2 horas antes. Fechada com menos de 2 horas de antecedência,
-- já nasce confirmada. Sem confirmar, a viagem fica sem efeito e o horário do motorista é liberado.

alter table public.rides
  add column confirmed_at timestamptz,
  add column void_reason text;

-- ---------------------------------------------------------------------------
-- Escolher a proposta: viagem agendada com mais de 2 horas pela frente espera a confirmação
-- ---------------------------------------------------------------------------

create or replace function public.respond_proposal(p_proposal_id bigint, p_accept boolean)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_prop public.ride_proposals;
  v_ride_row public.rides;
begin
  select * into v_prop from public.ride_proposals p where p.id = p_proposal_id for update;

  if not found or not private.is_ride_passenger(v_prop.ride_id) then
    raise exception 'Proposta não encontrada';
  end if;

  if v_prop.status <> 'pending' then
    raise exception 'Essa proposta não está mais valendo';
  end if;

  if not p_accept then
    update public.ride_proposals set status = 'declined' where id = p_proposal_id;
    return;
  end if;

  select * into v_ride_row from public.rides r where r.id = v_prop.ride_id;

  -- Viagem agendada: o motorista não precisa estar online, só poder fazer a viagem.
  if v_ride_row.scheduled_for is not null then
    if not private.can_take_scheduled(v_ride_row, v_prop.driver_id) then
      update public.ride_proposals set status = 'withdrawn' where id = p_proposal_id;
      raise exception 'O motorista não está mais disponível';
    end if;
  elsif not exists (
    select 1 from public.drivers d
    where d.id = v_prop.driver_id and d.status = 'approved' and d.is_online
      and not exists (
        select 1 from public.rides a
        where a.driver_id = d.id and a.status in ('accepted', 'arrived', 'in_progress')
        and private.ride_is_live(a.scheduled_for)
      )
  ) then
    update public.ride_proposals set status = 'withdrawn' where id = p_proposal_id;
    raise exception 'O motorista não está mais disponível';
  end if;

  update public.rides
  set driver_id = v_prop.driver_id,
      status = 'accepted',
      accepted_at = now(),
      extra_amount = v_prop.extra_amount,
      estimated_price = estimated_price + v_prop.extra_amount,
      advance_percent = coalesce(v_prop.advance_percent, advance_percent),
      confirmed_at = case
        when scheduled_for is null or scheduled_for <= now() + interval '2 hours' then now()
      end
  where id = v_prop.ride_id and status = 'requested' and passenger_id = auth.uid();

  if not found then
    raise exception 'Esse pedido não está mais aberto';
  end if;

  update public.ride_proposals
  set status = case when id = p_proposal_id then 'accepted'::public.proposal_status else 'declined'::public.proposal_status end
  where ride_id = v_prop.ride_id and status = 'pending';

  update public.ride_offers
  set status = case when driver_id = v_prop.driver_id then 'accepted'::public.offer_status else 'missed'::public.offer_status end
  where ride_id = v_prop.ride_id and status = 'pending';
end;
$$;

-- O motorista desiste: a viagem volta para a lista e a confirmação zera.
create or replace function public.release_scheduled_ride(p_ride_id bigint)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_ride public.rides;
begin
  select * into v_ride from public.rides r
  where r.id = p_ride_id
    and r.driver_id = auth.uid()
    and r.status = 'accepted'
    and r.scheduled_for is not null
    and r.scheduled_for > now()
  for update;

  if not found then
    raise exception 'Não dá para desistir dessa viagem';
  end if;

  if v_ride.advance_received_at is not null then
    raise exception 'Você já recebeu adiantamento dessa viagem. Fale com o suporte para desistir.';
  end if;

  update public.rides
  set driver_id = null,
      status = 'requested',
      accepted_at = null,
      advance_percent = null,
      advance_received_at = null,
      confirmed_at = null,
      estimated_price = estimated_price - coalesce(extra_amount, 0),
      extra_amount = 0
  where id = p_ride_id;

  update public.ride_proposals set status = 'withdrawn'
  where ride_id = p_ride_id and status = 'accepted';

  insert into public.ride_driver_releases (ride_id, driver_id) values (p_ride_id, auth.uid());
end;
$$;

-- ---------------------------------------------------------------------------
-- Confirmar a viagem
-- ---------------------------------------------------------------------------

create function public.confirm_scheduled_ride(p_ride_id bigint)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_ride public.rides;
begin
  select * into v_ride from public.rides r
  where r.id = p_ride_id and r.passenger_id = auth.uid()
    and r.status = 'accepted' and r.scheduled_for is not null and r.confirmed_at is null
  for update;

  if not found then
    raise exception 'Viagem não encontrada';
  end if;

  if v_ride.scheduled_for > now() + interval '12 hours' then
    raise exception 'Ainda não dá para confirmar essa viagem';
  end if;
  if v_ride.scheduled_for <= now() + interval '2 hours' then
    raise exception 'O prazo para confirmar acabou';
  end if;

  update public.rides set confirmed_at = now() where id = p_ride_id;
end;
$$;

-- Viagem aceita, sem confirmação, a 2 horas ou menos da hora marcada: fica sem efeito.
-- O horário do motorista volta a ficar livre (o conflito só olha viagens aceitas).
create function public.void_unconfirmed_rides()
returns int
language plpgsql
security definer set search_path = ''
as $$
declare
  v_count int;
begin
  update public.rides
  set status = 'cancelled', cancelled_at = now(), void_reason = 'not_confirmed'
  where status = 'accepted'
    and scheduled_for is not null
    and confirmed_at is null
    and scheduled_for <= now() + interval '2 hours';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Pedido agendado aberto vence na hora marcada, e as viagens sem confirmação caem junto.
create or replace function public.expire_scheduled_rides()
returns int
language plpgsql
security definer set search_path = ''
as $$
declare
  v_count int;
begin
  update public.rides
  set status = 'cancelled', cancelled_at = now()
  where scheduled_for is not null
    and status = 'requested'
    and scheduled_for < now();

  get diagnostics v_count = row_count;
  perform public.void_unconfirmed_rides();
  return v_count;
end;
$$;

-- Rotina agendada, se o projeto permitir; sem ela a limpeza acontece quando alguém abre o app.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('void-unconfirmed-rides', '*/10 * * * *', 'select public.void_unconfirmed_rides()');
exception when others then
  null;
end;
$$;

revoke execute on function public.respond_proposal(bigint, boolean) from public, anon;
revoke execute on function public.release_scheduled_ride(bigint) from public, anon;
revoke execute on function public.confirm_scheduled_ride(bigint) from public, anon;
revoke execute on function public.void_unconfirmed_rides() from public, anon;
revoke execute on function public.expire_scheduled_rides() from public, anon;
grant execute on function public.respond_proposal(bigint, boolean) to authenticated;
grant execute on function public.release_scheduled_ride(bigint) to authenticated;
grant execute on function public.confirm_scheduled_ride(bigint) to authenticated;
grant execute on function public.void_unconfirmed_rides() to authenticated;
grant execute on function public.expire_scheduled_rides() to authenticated;

-- ---------------------------------------------------------------------------
-- A view de corridas traz a confirmação e o motivo de a viagem ficar sem efeito
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
  r.confirmed_at,
  r.void_reason,
  private.my_rating(r.id) as my_rating,
  coalesce(r.rider_name, p.full_name) as passenger_name,
  p.photo_path as passenger_photo_path,
  dp.full_name as driver_name,
  d.vehicle_model,
  d.vehicle_color,
  d.vehicle_plate
from public.rides r
left join public.profiles p on p.id = r.passenger_id
left join public.drivers d on d.id = r.driver_id
left join public.profiles dp on dp.id = r.driver_id;

grant select on public.ride_details to authenticated;
