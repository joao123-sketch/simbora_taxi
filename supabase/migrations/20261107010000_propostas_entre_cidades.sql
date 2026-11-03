-- Propostas na viagem entre cidades: qualquer pedido para outra cidade aceita proposta de valor maior
-- (até o teto do painel). Hoje: aceitar o valor calculado fecha na hora. Agendada: o aceite vira mais uma
-- opção para o passageiro escolher (proposta sem acréscimo), nada fecha sozinho.

-- A proposta de "aceitar o valor calculado" tem acréscimo zero.
do $$
declare
  v_name text;
begin
  select c.conname into v_name
  from pg_constraint c
  where c.conrelid = 'public.ride_proposals'::regclass
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) like '%extra_amount%';
  if v_name is not null then
    execute format('alter table public.ride_proposals drop constraint %I', v_name);
  end if;
end;
$$;

alter table public.ride_proposals
  add constraint ride_proposals_extra_amount_check check (extra_amount >= 0 and extra_amount <= 500);

-- ---------------------------------------------------------------------------
-- Propor outro valor, com teto
-- ---------------------------------------------------------------------------

create or replace function public.propose_extra(p_ride_id bigint, p_extra numeric, p_advance_percent int default null)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_ride public.rides;
  v_extra numeric := round(p_extra, 2);
  v_cap numeric := public.proposal_cap();
  v_max numeric;
begin
  if p_advance_percent is not null and p_advance_percent not in (0, 50, 100) then
    raise exception 'Escolha 0%%, 50%% ou 100%%';
  end if;

  select * into v_ride
  from public.rides r
  where r.id = p_ride_id and r.status = 'requested' and private.is_intercity(r);

  if not found then
    raise exception 'Esse pedido não está mais aberto';
  end if;

  if v_ride.passenger_id = auth.uid() then
    raise exception 'Você não pode atender o seu próprio pedido';
  end if;

  -- Só propõe quem já está vendo o pedido (a vez dele na fila já chegou).
  if not (private.can_see_offer(p_ride_id) or private.can_take_scheduled(v_ride, auth.uid())) then
    raise exception 'Você não pode atender esse pedido';
  end if;

  v_max := round(v_ride.estimated_price * v_cap, 2);
  if v_extra is null or v_extra <= 0 then
    raise exception 'Proponha um valor acima do calculado';
  end if;
  if v_extra > v_max or v_extra > 500 then
    raise exception 'O valor passa do limite (% por cento acima do calculado)', round(v_cap * 100);
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

-- ---------------------------------------------------------------------------
-- Hoje: o primeiro que aceita o valor leva, e as propostas pendentes caem
-- ---------------------------------------------------------------------------

create or replace function public.accept_ride(p_ride_id bigint, p_advance_percent int default null)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_ride public.rides;
begin
  if p_advance_percent is not null and p_advance_percent not in (0, 50, 100) then
    raise exception 'Escolha 0%%, 50%% ou 100%%';
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

  -- As propostas de outro valor deixam de valer; a deste motorista (se houver) é retirada.
  update public.ride_proposals
  set status = case when driver_id = auth.uid() then 'withdrawn'::public.proposal_status
                    else 'declined'::public.proposal_status end
  where ride_id = p_ride_id and status = 'pending';
end;
$$;

-- ---------------------------------------------------------------------------
-- Agendada: aceitar o valor vira opção para o passageiro escolher
-- ---------------------------------------------------------------------------

create or replace function public.accept_scheduled_ride(p_ride_id bigint, p_advance_percent int)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_ride public.rides;
begin
  if p_advance_percent is null or p_advance_percent not in (0, 50, 100) then
    raise exception 'Escolha 0%%, 50%% ou 100%%';
  end if;

  select * into v_ride from public.rides r
  where r.id = p_ride_id and r.status = 'requested' and r.scheduled_for is not null
  for update;

  if not found or not private.can_take_scheduled(v_ride, auth.uid()) then
    raise exception 'Viagem indisponível';
  end if;

  insert into public.ride_proposals as rp (ride_id, driver_id, extra_amount, advance_percent)
  values (p_ride_id, auth.uid(), 0, p_advance_percent)
  on conflict (ride_id, driver_id) do update
    set extra_amount = 0,
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
revoke execute on function public.accept_ride(bigint, int) from public, anon;
revoke execute on function public.accept_scheduled_ride(bigint, int) from public, anon;
grant execute on function public.propose_extra(bigint, numeric, int) to authenticated;
grant execute on function public.accept_ride(bigint, int) to authenticated;
grant execute on function public.accept_scheduled_ride(bigint, int) to authenticated;
