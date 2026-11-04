-- Proposta com valor menor: o motorista pode pedir menos que o valor calculado (desconto), além de mais.
-- O teto do painel (proposal_cap, 30% por padrão) vale para os dois lados. Valor igual ao calculado não é
-- proposta: é o botão Aceitar. O banco guarda a diferença em extra_amount (negativa quando é desconto).

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
  add constraint ride_proposals_extra_amount_check check (extra_amount >= -500 and extra_amount <= 500);

create or replace function public.propose_extra(p_ride_id bigint, p_extra numeric, p_advance_percent int default null)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_ride public.rides;
  v_extra numeric := round(p_extra, 2);
  v_cap numeric := coalesce(public.proposal_cap(), 0.30);
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
  if v_extra is null or v_extra = 0 then
    raise exception 'Proponha um valor diferente do calculado';
  end if;
  if abs(v_extra) > v_max or abs(v_extra) > 500 then
    raise exception 'O valor passa do limite (% por cento a mais ou a menos que o calculado)', round(v_cap * 100);
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
