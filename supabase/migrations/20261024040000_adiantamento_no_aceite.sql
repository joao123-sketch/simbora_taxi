-- O motorista escolhe o adiantamento (50%, 70% ou 100%) já na hora de aceitar
-- ou de propor, e não só depois de chegar. O passageiro vê o adiantamento
-- junto com a proposta e decide com tudo na tela. Depois do aceite o motorista
-- ainda pode mudar a porcentagem até marcar "recebi" (set_advance_percent).

alter table public.ride_proposals
  add column advance_percent smallint check (advance_percent in (50, 70, 100));

-- ---------------------------------------------------------------------------
-- Aceitar pelo valor, já com o adiantamento
-- ---------------------------------------------------------------------------

drop function public.accept_ride(bigint);

create function public.accept_ride(p_ride_id bigint, p_advance_percent int default null)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_ride public.rides;
begin
  if p_advance_percent is not null and p_advance_percent not in (50, 70, 100) then
    raise exception 'Escolha 50%%, 70%% ou 100%%';
  end if;

  if not private.can_see_offer(p_ride_id) then
    raise exception 'Corrida indisponível';
  end if;

  select * into v_ride from public.rides r where r.id = p_ride_id and r.status = 'requested' for update;
  if not found then
    raise exception 'Corrida indisponível';
  end if;

  -- Adiantamento só existe em viagem para outra cidade.
  if p_advance_percent is not null and not private.is_intercity(v_ride) then
    raise exception 'Adiantamento só vale em viagem para outra cidade';
  end if;

  update public.rides r
  set driver_id = auth.uid(),
      status = 'accepted',
      accepted_at = now(),
      advance_percent = coalesce(p_advance_percent, r.advance_percent)
  where r.id = p_ride_id and r.status = 'requested';

  update public.ride_offers
  set status = case when driver_id = auth.uid() then 'accepted'::public.offer_status else 'missed'::public.offer_status end
  where ride_id = p_ride_id and status = 'pending';
end;
$$;

revoke execute on function public.accept_ride(bigint, int) from public, anon;
grant execute on function public.accept_ride(bigint, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Propor acréscimo, já com o adiantamento
-- ---------------------------------------------------------------------------

drop function public.propose_extra(bigint, numeric);

create function public.propose_extra(p_ride_id bigint, p_extra numeric, p_advance_percent int default null)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_ride public.rides;
  v_extra numeric := round(p_extra, 2);
begin
  if p_advance_percent is not null and p_advance_percent not in (50, 70, 100) then
    raise exception 'Escolha 50%%, 70%% ou 100%%';
  end if;

  select * into v_ride
  from public.rides r
  where r.id = p_ride_id and r.status = 'requested'
    and (r.destination_place is not null or r.round_trip);

  if not found then
    raise exception 'Esse pedido não está mais aberto';
  end if;

  if v_ride.passenger_id = auth.uid() then
    raise exception 'Você não pode atender o seu próprio pedido';
  end if;

  -- Só propõe quem já está vendo o pedido (a vez dele na fila já chegou).
  if not private.can_see_offer(p_ride_id) then
    raise exception 'Você não pode atender esse pedido';
  end if;

  if v_extra is null or v_extra <= 0 or v_extra > 500 then
    raise exception 'O acréscimo vai de R$ 0,01 a R$ 500,00';
  end if;

  insert into public.ride_proposals as rp (ride_id, driver_id, extra_amount, advance_percent)
  values (p_ride_id, auth.uid(), v_extra, p_advance_percent)
  on conflict (ride_id, driver_id) do update
    set extra_amount = excluded.extra_amount,
        advance_percent = excluded.advance_percent,
        status = 'pending',
        created_at = now()
    where rp.status in ('pending', 'withdrawn');

  if not found then
    raise exception 'O passageiro já recusou a sua proposta';
  end if;
end;
$$;

revoke execute on function public.propose_extra(bigint, numeric, int) from public, anon;
grant execute on function public.propose_extra(bigint, numeric, int) to authenticated;

-- ---------------------------------------------------------------------------
-- O passageiro vê o adiantamento junto com a proposta
-- ---------------------------------------------------------------------------

drop function public.get_ride_proposals(bigint);

create function public.get_ride_proposals(p_ride_id bigint)
returns table (
  proposal_id bigint,
  extra_amount numeric,
  advance_percent smallint,
  driver_name text,
  vehicle_model text,
  vehicle_color text,
  vehicle_plate text,
  proposed_at timestamptz
)
language sql
stable
security definer set search_path = ''
as $$
  select p.id, p.extra_amount, p.advance_percent, pr.full_name, d.vehicle_model, d.vehicle_color, d.vehicle_plate, p.created_at
  from public.ride_proposals p
  join public.rides r on r.id = p.ride_id
  join public.drivers d on d.id = p.driver_id
  join public.profiles pr on pr.id = p.driver_id
  where p.ride_id = p_ride_id
    and p.status = 'pending'
    and r.status = 'requested'
    and r.passenger_id = (select auth.uid())
  order by p.created_at;
$$;

revoke execute on function public.get_ride_proposals(bigint) from public, anon;
grant execute on function public.get_ride_proposals(bigint) to authenticated;

-- Aceitar a proposta leva o adiantamento junto para a corrida.
create or replace function public.respond_proposal(p_proposal_id bigint, p_accept boolean)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_prop public.ride_proposals;
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

  if not exists (
    select 1 from public.drivers d
    where d.id = v_prop.driver_id and d.status = 'approved' and d.is_online
      and not exists (
        select 1 from public.rides a
        where a.driver_id = d.id and a.status in ('accepted', 'arrived', 'in_progress')
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
      advance_percent = coalesce(v_prop.advance_percent, advance_percent)
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
