-- Etapa 11: motorista favorito.
--
-- Cada motorista tem um código curto, que vira link e QR ("meu motorista"). Quem
-- entra por ele fica com esse motorista na lista de favoritos. Nos pedidos desse
-- passageiro o favorito chama primeiro; se ele estiver ocupado ou offline, o pedido
-- segue a fila normal. O preço continua sempre o do cálculo do app.

-- Sem letras e números que se confundem (0/O, 1/I/L).
create function private.new_share_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text := '';
begin
  for i in 1..8 loop
    v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
  end loop;
  return v_code;
end;
$$;

revoke execute on function private.new_share_code() from public, anon, authenticated;

alter table public.drivers add column share_code text unique;
update public.drivers set share_code = private.new_share_code() where share_code is null;
alter table public.drivers
  alter column share_code set not null,
  alter column share_code set default private.new_share_code();

create table public.favorite_drivers (
  passenger_id uuid not null references public.profiles (id) on delete cascade,
  driver_id uuid not null references public.drivers (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (passenger_id, driver_id),
  check (passenger_id <> driver_id)
);

create index favorite_drivers_driver_idx on public.favorite_drivers (driver_id);

-- Só leitura da própria lista; quem grava são as funções abaixo.
alter table public.favorite_drivers enable row level security;
revoke all on public.favorite_drivers from anon, authenticated;
grant select on public.favorite_drivers to authenticated;
create policy "passageiro vê os próprios favoritos" on public.favorite_drivers
  for select to authenticated using (passenger_id = (select auth.uid()));

-- O código do próprio motorista (só depois de aprovado).
create function public.my_driver_code()
returns text
language sql
stable
security definer set search_path = ''
as $$
  select d.share_code
  from public.drivers d
  where d.id = (select auth.uid()) and d.status = 'approved';
$$;

-- Favorita o motorista dono do código (digitado, lido do QR ou aberto pelo link).
create function public.favorite_by_code(p_code text)
returns table (
  driver_id uuid,
  full_name text,
  vehicle_type public.vehicle_type,
  vehicle_model text,
  vehicle_color text
)
language plpgsql
security definer set search_path = ''
as $$
declare
  v_driver public.drivers%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Entre no app primeiro.';
  end if;

  select * into v_driver
  from public.drivers d
  where d.share_code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'))
    and d.status = 'approved';

  if not found then
    raise exception 'Código de motorista não encontrado.';
  end if;
  if v_driver.id = (select auth.uid()) then
    raise exception 'Esse é o seu próprio código.';
  end if;

  insert into public.favorite_drivers (passenger_id, driver_id)
  values ((select auth.uid()), v_driver.id)
  on conflict do nothing;

  return query
  select v_driver.id, p.full_name, v_driver.vehicle_type, v_driver.vehicle_model, v_driver.vehicle_color
  from public.profiles p
  where p.id = v_driver.id;
end;
$$;

-- Favorita quem já levou o passageiro (sem precisar do código).
create function public.favorite_driver(p_driver_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.rides r
    where r.passenger_id = (select auth.uid()) and r.driver_id = p_driver_id and r.status = 'completed'
  ) then
    raise exception 'Você só pode favoritar um motorista que já te levou.';
  end if;

  insert into public.favorite_drivers (passenger_id, driver_id)
  values ((select auth.uid()), p_driver_id)
  on conflict do nothing;
end;
$$;

create function public.unfavorite_driver(p_driver_id uuid)
returns void
language sql
security definer set search_path = ''
as $$
  delete from public.favorite_drivers
  where passenger_id = (select auth.uid()) and driver_id = p_driver_id;
$$;

-- Os favoritos do passageiro, com o que ele precisa para reconhecer o motorista.
create function public.my_favorite_drivers()
returns table (
  driver_id uuid,
  full_name text,
  vehicle_type public.vehicle_type,
  vehicle_model text,
  vehicle_color text,
  is_online boolean,
  rides_together bigint
)
language sql
stable
security definer set search_path = ''
as $$
  select
    d.id,
    p.full_name,
    d.vehicle_type,
    d.vehicle_model,
    d.vehicle_color,
    d.is_online and d.status = 'approved',
    (
      select count(*) from public.rides r
      where r.passenger_id = f.passenger_id and r.driver_id = d.id and r.status = 'completed'
    )
  from public.favorite_drivers f
  join public.drivers d on d.id = f.driver_id
  join public.profiles p on p.id = d.id
  where f.passenger_id = (select auth.uid())
  order by f.created_at desc;
$$;

-- Quem mais levou o passageiro, para ele favoritar com um toque.
create function public.my_frequent_drivers()
returns table (
  driver_id uuid,
  full_name text,
  vehicle_type public.vehicle_type,
  vehicle_model text,
  vehicle_color text,
  rides_together bigint,
  is_favorite boolean
)
language sql
stable
security definer set search_path = ''
as $$
  select
    d.id,
    p.full_name,
    d.vehicle_type,
    d.vehicle_model,
    d.vehicle_color,
    count(*),
    exists (
      select 1 from public.favorite_drivers f
      where f.passenger_id = (select auth.uid()) and f.driver_id = d.id
    )
  from public.rides r
  join public.drivers d on d.id = r.driver_id
  join public.profiles p on p.id = d.id
  where r.passenger_id = (select auth.uid()) and r.status = 'completed'
  group by d.id, p.full_name, d.vehicle_type, d.vehicle_model, d.vehicle_color
  order by count(*) desc, max(r.completed_at) desc
  limit 5;
$$;

revoke execute on function public.my_driver_code() from public, anon;
revoke execute on function public.favorite_by_code(text) from public, anon;
revoke execute on function public.favorite_driver(uuid) from public, anon;
grant execute on function public.favorite_driver(uuid) to authenticated;
revoke execute on function public.unfavorite_driver(uuid) from public, anon;
revoke execute on function public.my_favorite_drivers() from public, anon;
revoke execute on function public.my_frequent_drivers() from public, anon;
grant execute on function public.my_driver_code() to authenticated;
grant execute on function public.favorite_by_code(text) to authenticated;
grant execute on function public.unfavorite_driver(uuid) to authenticated;
grant execute on function public.my_favorite_drivers() to authenticated;
grant execute on function public.my_frequent_drivers() to authenticated;

-- Despacho: o favorito do passageiro entra primeiro na fila (e vê o pedido na hora);
-- os demais seguem do mais perto ao mais longe, como antes.
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
      and d.status = 'approved'
      and d.is_online
      and r.payment_method = any (d.accepted_payments)
      and d.id <> r.passenger_id
      and not exists (
        select 1 from public.rides a
        where a.driver_id = d.id and a.status in ('accepted', 'arrived', 'in_progress')
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
