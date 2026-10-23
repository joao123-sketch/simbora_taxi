-- Quem é passageiro e motorista na mesma conta não atende o próprio pedido,
-- nem conta como motorista disponível nas formas de pagamento que o próprio
-- passageiro vê.

-- As formas oferecidas ao passageiro ignoram a conta dele mesmo.
create or replace function private.payment_options(p_city_id bigint, p_vehicle_type public.vehicle_type)
returns public.payment_method[]
language sql
stable
security definer set search_path = ''
as $$
  select case
    when cardinality(f.methods) = 0 then array['cash', 'pix']::public.payment_method[]
    else f.methods
  end
  from (
    select coalesce(array_agg(distinct m order by m), array[]::public.payment_method[]) as methods
    from public.drivers d
    cross join lateral unnest(d.accepted_payments) as m
    where d.status = 'approved'
      and d.is_online
      and d.city_id = p_city_id
      and d.vehicle_type = p_vehicle_type
      and d.id <> (select auth.uid())
  ) as f;
$$;

-- O pedido aberto não aparece para o motorista que é o próprio passageiro.
drop policy "motorista online vê chamados abertos" on public.rides;
create policy "motorista online vê chamados abertos" on public.rides
  for select to authenticated using (
    status = 'requested'
    and passenger_id <> (select auth.uid())
    and private.driver_can_serve(vehicle_type, payment_method)
  );

create or replace function public.accept_ride(p_ride_id bigint)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  update public.rides r
  set driver_id = auth.uid(), status = 'accepted', accepted_at = now()
  from public.drivers d
  where r.id = p_ride_id
    and r.status = 'requested'
    and r.passenger_id <> auth.uid()
    and d.id = auth.uid()
    and d.status = 'approved'
    and d.is_online
    and d.vehicle_type = r.vehicle_type
    and r.payment_method = any (d.accepted_payments);

  if not found then
    raise exception 'Corrida indisponível';
  end if;
end;
$$;

create or replace function public.propose_extra(p_ride_id bigint, p_extra numeric)
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

  if v_ride.passenger_id = auth.uid() then
    raise exception 'Você não pode atender o seu próprio pedido';
  end if;

  if not private.driver_can_serve(v_ride.vehicle_type, v_ride.payment_method) then
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
