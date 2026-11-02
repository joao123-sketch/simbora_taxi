-- Bloqueio de passageiro: o motorista escolhe "Não atender este passageiro" e aquele passageiro
-- nunca mais chega a ele (pedidos de agora, agendados e futuros). O passageiro não é avisado.

create table public.driver_blocked_passengers (
  driver_id uuid not null references public.drivers (id) on delete cascade,
  passenger_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (driver_id, passenger_id)
);

-- O app só mexe nessa tabela pelas funções abaixo.
alter table public.driver_blocked_passengers enable row level security;
revoke all on public.driver_blocked_passengers from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Bloquear, desbloquear e listar
-- ---------------------------------------------------------------------------

create function public.block_passenger(p_ride_id bigint)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_ride public.rides;
  r record;
begin
  if v_me is null then
    raise exception 'Faça login para continuar';
  end if;

  select * into v_ride from public.rides where id = p_ride_id;
  if not found
     or not (private.can_see_offer(p_ride_id)
             or private.can_take_scheduled(v_ride, v_me)
             or coalesce(v_ride.driver_id = v_me, false)) then
    raise exception 'Pedido indisponível';
  end if;

  -- Os pedidos abertos desse passageiro somem para o motorista e a onda segue para o próximo,
  -- como numa recusa (decline_ride). Isso vem antes de gravar o bloqueio.
  for r in
    select o.ride_id
    from public.ride_offers o
    join public.rides rr on rr.id = o.ride_id
    where o.driver_id = v_me and o.status = 'pending'
      and rr.passenger_id = v_ride.passenger_id and rr.status = 'requested'
  loop
    update public.ride_offers
    set status = 'declined'
    where ride_id = r.ride_id and driver_id = v_me and status = 'pending';

    update public.ride_offers
    set visible_from = now()
    where id = (
      select o.id from public.ride_offers o
      where o.ride_id = r.ride_id and o.status = 'pending' and o.visible_from > now()
      order by o.rank
      limit 1
    );

    update public.ride_proposals
    set status = 'withdrawn'
    where ride_id = r.ride_id and driver_id = v_me and status = 'pending';
  end loop;

  insert into public.driver_blocked_passengers (driver_id, passenger_id)
  values (v_me, v_ride.passenger_id)
  on conflict do nothing;
end;
$$;

create function public.unblock_passenger(p_passenger_id uuid)
returns void
language sql
security definer set search_path = ''
as $$
  delete from public.driver_blocked_passengers
  where driver_id = (select auth.uid()) and passenger_id = p_passenger_id;
$$;

create function public.my_blocked_passengers()
returns table (passenger_id uuid, full_name text, photo_path text, blocked_at timestamptz)
language sql
stable
security definer set search_path = ''
as $$
  select b.passenger_id, p.full_name, p.photo_path, b.created_at
  from public.driver_blocked_passengers b
  join public.profiles p on p.id = b.passenger_id
  where b.driver_id = (select auth.uid())
  order by b.created_at desc;
$$;

revoke execute on function public.block_passenger(bigint) from public, anon;
revoke execute on function public.unblock_passenger(uuid) from public, anon;
revoke execute on function public.my_blocked_passengers() from public, anon;
grant execute on function public.block_passenger(bigint) to authenticated;
grant execute on function public.unblock_passenger(uuid) to authenticated;
grant execute on function public.my_blocked_passengers() to authenticated;

-- ---------------------------------------------------------------------------
-- O bloqueado também aparece na lista de bloqueados com foto
-- ---------------------------------------------------------------------------

create or replace function private.driver_can_see_photo(p_passenger uuid)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.rides r
    where r.passenger_id = p_passenger
      and (
        (r.status = 'requested'
          and (private.can_see_offer(r.id) or private.can_take_scheduled(r, (select auth.uid()))))
        or (r.driver_id = (select auth.uid()) and r.status in ('accepted', 'arrived', 'in_progress'))
      )
  )
  or exists (
    select 1 from public.driver_blocked_passengers b
    where b.driver_id = (select auth.uid()) and b.passenger_id = p_passenger
  );
$$;

-- ---------------------------------------------------------------------------
-- O bloqueio vale no despacho, na visão dos pedidos e nas viagens agendadas
-- ---------------------------------------------------------------------------

create or replace function private.dispatch_ride(p_ride_id bigint)
returns int
language plpgsql
security definer set search_path = ''
as $$
declare
  v_wave interval := make_interval(secs => private.wave_seconds());
  v_base_rank int;
  v_first_visible timestamptz;
  v_count int;
begin
  select coalesce(max(o.rank), 0),
         case when count(*) = 0 then now() else greatest(now(), max(o.visible_from) + v_wave) end
  into v_base_rank, v_first_visible
  from public.ride_offers o
  where o.ride_id = p_ride_id;

  with candidates as (
    select
      d.id as driver_id,
      d.created_at as joined_at,
      (f.driver_id is not null) as is_favorite,
      case when l.updated_at > now() - interval '15 minutes'
           then extensions.st_distance(l.position, r.origin)
      end as dist
    from public.rides r
    join public.drivers d on d.city_id = r.city_id and d.vehicle_type = r.vehicle_type
    left join public.driver_locations l on l.driver_id = d.id
    left join public.favorite_drivers f on f.passenger_id = r.passenger_id and f.driver_id = d.id
    where r.id = p_ride_id
      and r.status = 'requested'
      and r.scheduled_for is null
      and d.status = 'approved'
      and d.is_online
      and private.fee_ok(d.id)
      and r.payment_method = any (d.accepted_payments)
      and d.id <> r.passenger_id
      and not exists (
        select 1 from public.driver_blocked_passengers b
        where b.driver_id = d.id and b.passenger_id = r.passenger_id
      )
      and not exists (
        select 1 from public.rides a
        where a.driver_id = d.id and a.status in ('accepted', 'arrived', 'in_progress')
          and private.ride_is_live(a.scheduled_for)
      )
      and not exists (
        select 1 from public.ride_offers o where o.ride_id = r.id and o.driver_id = d.id
      )
  ),
  ranked as (
    select c.driver_id,
           row_number() over (order by c.is_favorite desc, c.dist nulls last, c.joined_at, c.driver_id) as rk
    from candidates c
  )
  insert into public.ride_offers (ride_id, driver_id, rank, visible_from)
  select p_ride_id, k.driver_id, v_base_rank + k.rk::int, v_first_visible + (k.rk - 1) * v_wave
  from ranked k;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function private.can_see_offer(p_ride_id bigint)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.ride_offers o
    join public.rides r on r.id = o.ride_id
    join public.drivers d on d.id = o.driver_id
    where o.ride_id = p_ride_id
      and o.driver_id = (select auth.uid())
      and o.status = 'pending'
      and o.visible_from <= now()
      and r.status = 'requested'
      and r.passenger_id <> d.id
      and d.status = 'approved'
      and d.is_online
      and private.fee_ok(d.id)
      and d.vehicle_type = r.vehicle_type
      and r.payment_method = any (d.accepted_payments)
      and not exists (
        select 1 from public.driver_blocked_passengers b
        where b.driver_id = d.id and b.passenger_id = r.passenger_id
      )
      and not exists (
        select 1 from public.rides a
        where a.driver_id = d.id and a.status in ('accepted', 'arrived', 'in_progress')
          and private.ride_is_live(a.scheduled_for)
      )
  );
$$;

create or replace function private.can_take_scheduled(p_ride public.rides, p_driver uuid)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select p_ride.scheduled_for is not null
    and p_ride.status = 'requested'
    and p_ride.scheduled_for > now()
    and p_ride.passenger_id <> p_driver
    and exists (
      select 1 from public.drivers d
      where d.id = p_driver
        and d.status = 'approved'
        and d.city_id = p_ride.city_id
        and d.vehicle_type = p_ride.vehicle_type
        and p_ride.payment_method = any (d.accepted_payments)
    )
    and not exists (
      select 1 from public.driver_blocked_passengers b
      where b.driver_id = p_driver and b.passenger_id = p_ride.passenger_id
    )
    and private.fee_ok(p_driver)
    and not private.scheduled_conflict(p_driver, p_ride.scheduled_for);
$$;

create or replace function public.open_scheduled_rides()
returns table (
  ride_id bigint,
  scheduled_for timestamptz,
  vehicle_type public.vehicle_type,
  payment_method public.payment_method,
  origin_address text,
  origin_lat double precision,
  origin_lng double precision,
  destination_address text,
  destination_lat double precision,
  destination_lng double precision,
  destination_city_name text,
  destination_place text,
  estimated_price numeric,
  distance_km numeric,
  round_trip boolean,
  wait_minutes int,
  passenger_name text,
  passenger_photo_path text,
  conflict boolean
)
language plpgsql
volatile
security definer set search_path = ''
as $$
begin
  perform public.expire_scheduled_rides();

  return query
  select
    r.id,
    r.scheduled_for,
    r.vehicle_type,
    r.payment_method,
    r.origin_address,
    extensions.st_y(r.origin::extensions.geometry),
    extensions.st_x(r.origin::extensions.geometry),
    r.destination_address,
    extensions.st_y(r.destination::extensions.geometry),
    extensions.st_x(r.destination::extensions.geometry),
    c.name,
    r.destination_place,
    r.estimated_price,
    r.distance_km,
    r.round_trip,
    r.wait_minutes,
    coalesce(r.rider_name, p.full_name, ''),
    p.photo_path,
    private.scheduled_conflict(d.id, r.scheduled_for)
  from public.rides r
  join public.drivers d on d.id = (select auth.uid())
  join public.cities c on c.id = r.destination_city_id
  join public.profiles p on p.id = r.passenger_id
  where r.status = 'requested'
    and r.scheduled_for is not null
    and r.scheduled_for > now()
    and d.status = 'approved'
    and d.city_id = r.city_id
    and d.vehicle_type = r.vehicle_type
    and r.payment_method = any (d.accepted_payments)
    and r.passenger_id <> d.id
    and private.fee_ok(d.id)
    and not exists (
      select 1 from public.driver_blocked_passengers b
      where b.driver_id = d.id and b.passenger_id = r.passenger_id
    )
  order by r.scheduled_for;
end;
$$;
