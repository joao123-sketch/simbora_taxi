-- Etapa 2: o motorista escolhe como recebe (Pix, dinheiro, maquininha), o
-- passageiro escolhe entre as formas oferecidas, o pedido só chega a quem
-- aceita a forma escolhida e o cartão custa 5% a mais.

-- ---------------------------------------------------------------------------
-- Formas que cada motorista aceita
-- ---------------------------------------------------------------------------

-- Quem ainda não tem maquininha fica sem cartão e marca quando tiver.
alter table public.drivers
  add column accepted_payments public.payment_method[] not null
  default array['cash', 'pix']::public.payment_method[];

alter table public.drivers
  add constraint drivers_accepts_something check (cardinality(accepted_payments) >= 1);

create function public.set_accepted_payments(p_methods public.payment_method[])
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_methods public.payment_method[];
begin
  select coalesce(array_agg(distinct m order by m), array[]::public.payment_method[])
  into v_methods
  from unnest(p_methods) as m;

  if cardinality(v_methods) = 0 then
    raise exception 'Marque pelo menos uma forma de receber';
  end if;

  update public.drivers set accepted_payments = v_methods where id = auth.uid();

  if not found then
    raise exception 'Cadastro de motorista não encontrado';
  end if;
end;
$$;

revoke execute on function public.set_accepted_payments(public.payment_method[]) from public, anon;
grant execute on function public.set_accepted_payments(public.payment_method[]) to authenticated;

-- ---------------------------------------------------------------------------
-- O que o passageiro pode escolher
-- ---------------------------------------------------------------------------

create function private.card_surcharge()
returns numeric
language sql
immutable
as $$
  select 0.05::numeric;
$$;

-- Formas aceitas por pelo menos um motorista online do tipo de veículo. Sem
-- nenhum motorista online, oferece dinheiro e Pix para o pedido poder esperar.
create function private.payment_options(p_city_id bigint, p_vehicle_type public.vehicle_type)
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
  ) as f;
$$;

revoke execute on function private.payment_options(bigint, public.vehicle_type) from public, anon, authenticated;

create function public.payment_options(p_city_id bigint, p_vehicle_type public.vehicle_type)
returns public.payment_method[]
language sql
stable
security definer set search_path = ''
as $$
  select private.payment_options(p_city_id, p_vehicle_type);
$$;

revoke execute on function public.payment_options(bigint, public.vehicle_type) from public, anon;
grant execute on function public.payment_options(bigint, public.vehicle_type) to authenticated;

-- ---------------------------------------------------------------------------
-- O pedido só chega a quem aceita a forma de pagamento escolhida
-- ---------------------------------------------------------------------------

create function private.driver_can_serve(
  p_vehicle_type public.vehicle_type,
  p_payment_method public.payment_method
)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.drivers d
    where d.id = (select auth.uid())
      and d.status = 'approved'
      and d.is_online
      and d.vehicle_type = p_vehicle_type
      and p_payment_method = any (d.accepted_payments)
  );
$$;

revoke execute on function private.driver_can_serve(public.vehicle_type, public.payment_method) from public, anon;
grant execute on function private.driver_can_serve(public.vehicle_type, public.payment_method) to authenticated;

drop policy "motorista online vê chamados abertos" on public.rides;
create policy "motorista online vê chamados abertos" on public.rides
  for select to authenticated using (
    status = 'requested' and private.driver_can_serve(vehicle_type, payment_method)
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

drop function private.is_online_driver_for(public.vehicle_type);

-- ---------------------------------------------------------------------------
-- Preço: cartão com 5% a mais, calculado aqui e nunca pelo app
-- ---------------------------------------------------------------------------

drop function public.quote_ride(bigint, double precision, double precision, double precision, double precision, bigint);

create function public.quote_ride(
  p_city_id bigint,
  p_origin_lng double precision,
  p_origin_lat double precision,
  p_destination_lng double precision,
  p_destination_lat double precision,
  p_destination_city_id bigint default null
)
returns table (vehicle_type public.vehicle_type, price numeric, card_price numeric, distance_km numeric)
language plpgsql
stable
security definer set search_path = ''
as $$
declare
  v_type public.vehicle_type;
  v_price numeric;
  v_km numeric;
begin
  foreach v_type in array enum_range(null::public.vehicle_type) loop
    begin
      select q.price, q.distance_km into v_price, v_km
      from private.ride_quote(
        p_city_id, v_type,
        private.point(p_origin_lng, p_origin_lat),
        private.point(p_destination_lng, p_destination_lat),
        p_destination_city_id
      ) q;

      vehicle_type := v_type;
      price := v_price;
      card_price := round(v_price * (1 + private.card_surcharge()), 2);
      distance_km := v_km;
      return next;
    exception when raise_exception then
      null;
    end;
  end loop;
end;
$$;

revoke execute on function public.quote_ride(bigint, double precision, double precision, double precision, double precision, bigint) from public, anon;
grant execute on function public.quote_ride(bigint, double precision, double precision, double precision, double precision, bigint) to authenticated;

create or replace function public.request_ride(
  p_city_id bigint,
  p_vehicle_type public.vehicle_type,
  p_payment_method public.payment_method,
  p_origin_lng double precision,
  p_origin_lat double precision,
  p_origin_address text,
  p_destination_lng double precision,
  p_destination_lat double precision,
  p_destination_address text,
  p_destination_city_id bigint default null,
  p_destination_place text default null
)
returns bigint
language plpgsql
security definer set search_path = ''
as $$
declare
  v_origin extensions.geography := private.point(p_origin_lng, p_origin_lat);
  v_destination extensions.geography := private.point(p_destination_lng, p_destination_lat);
  v_intercity boolean := p_destination_city_id is not null and p_destination_city_id <> p_city_id;
  v_place text := nullif(trim(coalesce(p_destination_place, '')), '');
  v_price numeric;
  v_km numeric;
  v_ride_id bigint;
begin
  if auth.uid() is null then
    raise exception 'Faça login para pedir corrida';
  end if;

  if not exists (select 1 from public.cities c where c.id = p_city_id and c.active) then
    raise exception 'O Simbora Car ainda não atende essa cidade';
  end if;

  -- Só vale a forma que algum motorista online aceita (ou dinheiro e Pix, se não há ninguém online).
  if not (p_payment_method = any (private.payment_options(p_city_id, p_vehicle_type))) then
    raise exception 'Essa forma de pagamento não está disponível agora. Escolha outra.';
  end if;

  -- Lugar combinado só existe em viagem para outra cidade, e precisa dizer onde.
  if v_place is not null then
    if not v_intercity then
      raise exception 'Lugar combinado só vale em viagem para outra cidade';
    end if;
    if length(v_place) < 3 then
      raise exception 'Diga onde o motorista deve deixar você';
    end if;
  end if;

  if exists (
    select 1 from public.rides r
    where r.passenger_id = auth.uid()
      and r.status in ('requested', 'accepted', 'arrived', 'in_progress')
  ) then
    raise exception 'Você já tem uma corrida em andamento';
  end if;

  select q.price, q.distance_km into v_price, v_km
  from private.ride_quote(p_city_id, p_vehicle_type, v_origin, v_destination, p_destination_city_id) q;

  if p_payment_method = 'card' then
    v_price := round(v_price * (1 + private.card_surcharge()), 2);
  end if;

  insert into public.rides (
    passenger_id, city_id, destination_city_id, vehicle_type, payment_method,
    origin, origin_address, destination, destination_address, destination_place,
    distance_km, estimated_price
  )
  values (
    auth.uid(), p_city_id, p_destination_city_id, p_vehicle_type, p_payment_method,
    v_origin, p_origin_address, v_destination, p_destination_address, v_place,
    v_km, v_price
  )
  returning id into v_ride_id;

  return v_ride_id;
end;
$$;
