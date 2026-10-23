-- Proposta de acréscimo: em viagem para outra cidade com lugar combinado, o
-- motorista pode aceitar pelo valor ou propor um acréscimo. O passageiro vê a
-- proposta e aceita ou recusa; só quando aceita a corrida fecha com aquele
-- motorista e o valor sobe.

create type public.proposal_status as enum ('pending', 'accepted', 'declined', 'withdrawn');

-- Quanto foi somado ao valor por uma proposta aceita (o estimated_price já
-- vem com o acréscimo).
alter table public.rides add column extra_amount numeric(10, 2) not null default 0;

create table public.ride_proposals (
  id bigint generated always as identity primary key,
  ride_id bigint not null references public.rides (id) on delete cascade,
  driver_id uuid not null references public.drivers (id),
  extra_amount numeric(10, 2) not null check (extra_amount > 0 and extra_amount <= 500),
  status public.proposal_status not null default 'pending',
  created_at timestamptz not null default now(),
  unique (ride_id, driver_id)
);

create index ride_proposals_ride_idx on public.ride_proposals (ride_id) where status = 'pending';

alter table public.ride_proposals enable row level security;

create function private.is_ride_passenger(p_ride_id bigint)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.rides r
    where r.id = p_ride_id and r.passenger_id = (select auth.uid())
  );
$$;

revoke execute on function private.is_ride_passenger(bigint) from public, anon;
grant execute on function private.is_ride_passenger(bigint) to authenticated;

create policy "motorista vê as próprias propostas" on public.ride_proposals
  for select to authenticated using (driver_id = (select auth.uid()));
create policy "passageiro vê as propostas da própria corrida" on public.ride_proposals
  for select to authenticated using (private.is_ride_passenger(ride_id));

-- O passageiro e o motorista acompanham as propostas em tempo real.
alter publication supabase_realtime add table public.ride_proposals;

-- A view ganha o acréscimo (e continua sem telefone).
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

-- Motorista propõe um acréscimo (ou ajusta a proposta que ainda está aberta).
create function public.propose_extra(p_ride_id bigint, p_extra numeric)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_ride public.rides;
  v_extra numeric := round(p_extra, 2);
begin
  select * into v_ride
  from public.rides r
  where r.id = p_ride_id and r.status = 'requested' and r.destination_place is not null;

  if not found then
    raise exception 'Esse pedido não está mais aberto';
  end if;

  if not private.is_online_driver_for(v_ride.vehicle_type) then
    raise exception 'Você não pode atender esse pedido';
  end if;

  if v_extra is null or v_extra <= 0 or v_extra > 500 then
    raise exception 'O acréscimo vai de R$ 0,01 a R$ 500,00';
  end if;

  insert into public.ride_proposals as rp (ride_id, driver_id, extra_amount)
  values (p_ride_id, auth.uid(), v_extra)
  on conflict (ride_id, driver_id) do update
    set extra_amount = excluded.extra_amount, status = 'pending', created_at = now()
    where rp.status in ('pending', 'withdrawn');

  if not found then
    raise exception 'O passageiro já recusou a sua proposta';
  end if;
end;
$$;

create function public.withdraw_proposal(p_ride_id bigint)
returns void
language sql
security definer set search_path = ''
as $$
  update public.ride_proposals
  set status = 'withdrawn'
  where ride_id = p_ride_id and driver_id = auth.uid() and status = 'pending';
$$;

-- Propostas abertas da corrida do passageiro, com o que ele precisa para decidir
-- (nome do motorista e do carro, sem telefone).
create function public.get_ride_proposals(p_ride_id bigint)
returns table (
  proposal_id bigint,
  extra_amount numeric,
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
  select p.id, p.extra_amount, pr.full_name, d.vehicle_model, d.vehicle_color, d.vehicle_plate, p.created_at
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

-- Passageiro aceita ou recusa uma proposta. Aceitar fecha a corrida com aquele
-- motorista, soma o acréscimo ao valor e recusa as outras propostas.
create function public.respond_proposal(p_proposal_id bigint, p_accept boolean)
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
  ) then
    update public.ride_proposals set status = 'withdrawn' where id = p_proposal_id;
    raise exception 'O motorista não está mais disponível';
  end if;

  update public.rides
  set driver_id = v_prop.driver_id,
      status = 'accepted',
      accepted_at = now(),
      extra_amount = v_prop.extra_amount,
      estimated_price = estimated_price + v_prop.extra_amount
  where id = v_prop.ride_id and status = 'requested' and passenger_id = auth.uid();

  if not found then
    raise exception 'Esse pedido não está mais aberto';
  end if;

  update public.ride_proposals
  set status = case when id = p_proposal_id then 'accepted'::public.proposal_status else 'declined'::public.proposal_status end
  where ride_id = v_prop.ride_id and status = 'pending';
end;
$$;

revoke execute on function public.propose_extra(bigint, numeric) from public, anon;
revoke execute on function public.withdraw_proposal(bigint) from public, anon;
revoke execute on function public.get_ride_proposals(bigint) from public, anon;
revoke execute on function public.respond_proposal(bigint, boolean) from public, anon;
grant execute on function public.propose_extra(bigint, numeric) to authenticated;
grant execute on function public.withdraw_proposal(bigint) to authenticated;
grant execute on function public.get_ride_proposals(bigint) to authenticated;
grant execute on function public.respond_proposal(bigint, boolean) to authenticated;
