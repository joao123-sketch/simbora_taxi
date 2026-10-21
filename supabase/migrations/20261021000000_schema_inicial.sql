-- Schema inicial do Simbora.
-- A equipe administra pelo painel do Supabase (service_role ignora RLS),
-- então as policies abaixo só cobrem passageiros e motoristas.

create extension if not exists postgis with schema extensions;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------

create type public.vehicle_type as enum ('car', 'moto');
create type public.driver_status as enum ('pending', 'approved', 'suspended', 'blocked');
create type public.ride_status as enum ('requested', 'accepted', 'arrived', 'in_progress', 'completed', 'cancelled');
create type public.payment_method as enum ('cash', 'pix');
create type public.invoice_status as enum ('open', 'paid');

-- ---------------------------------------------------------------------------
-- Cidades e tarifas
-- ---------------------------------------------------------------------------

create table public.cities (
  id bigint generated always as identity primary key,
  name text not null,
  state char(2) not null,
  active boolean not null default false,
  unique (name, state)
);

create table public.fares (
  city_id bigint not null references public.cities (id),
  vehicle_type public.vehicle_type not null,
  base numeric(10, 2) not null,
  per_km numeric(10, 2) not null,
  per_min numeric(10, 2) not null,
  minimum numeric(10, 2) not null,
  primary key (city_id, vehicle_type)
);

-- Corridas entre cidades têm preço fechado.
create table public.intercity_fares (
  origin_city_id bigint not null references public.cities (id),
  destination_city_id bigint not null references public.cities (id),
  vehicle_type public.vehicle_type not null,
  price numeric(10, 2) not null,
  primary key (origin_city_id, destination_city_id, vehicle_type),
  check (origin_city_id <> destination_city_id)
);

-- ---------------------------------------------------------------------------
-- Pessoas
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  created_at timestamptz not null default now()
);

-- Cria o perfil assim que alguém se cadastra pelo SMS.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, phone, full_name)
  values (new.id, new.phone, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Motorista: nasce 'pending' e só a equipe aprova, depois da reunião presencial.
create table public.drivers (
  id uuid primary key references public.profiles (id) on delete cascade,
  city_id bigint not null references public.cities (id),
  status public.driver_status not null default 'pending',
  vehicle_type public.vehicle_type not null,
  vehicle_model text not null,
  vehicle_color text not null,
  vehicle_plate text not null unique,
  vehicle_year int not null check (vehicle_year >= 2010),
  pix_key text,
  is_online boolean not null default false,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.driver_locations (
  driver_id uuid primary key references public.drivers (id) on delete cascade,
  position extensions.geography(point, 4326) not null,
  heading real,
  updated_at timestamptz not null default now()
);

create index driver_locations_position_idx on public.driver_locations using gist (position);

-- ---------------------------------------------------------------------------
-- Corridas
-- ---------------------------------------------------------------------------

create table public.rides (
  id bigint generated always as identity primary key,
  passenger_id uuid not null references public.profiles (id),
  driver_id uuid references public.drivers (id),
  city_id bigint not null references public.cities (id),
  destination_city_id bigint references public.cities (id),
  vehicle_type public.vehicle_type not null,
  status public.ride_status not null default 'requested',
  payment_method public.payment_method not null,
  origin extensions.geography(point, 4326) not null,
  origin_address text not null,
  destination extensions.geography(point, 4326) not null,
  destination_address text not null,
  distance_km numeric(8, 2),
  estimated_price numeric(10, 2) not null,
  final_price numeric(10, 2),
  passenger_rating smallint check (passenger_rating between 1 and 5),
  driver_rating smallint check (driver_rating between 1 and 5),
  requested_at timestamptz not null default now(),
  accepted_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz
);

create index rides_open_idx on public.rides (city_id, vehicle_type) where status = 'requested';
create index rides_driver_completed_idx on public.rides (driver_id, completed_at) where status = 'completed';

-- ---------------------------------------------------------------------------
-- Comissão: 8% por corrida, teto de R$ 300 acumulado no mês
-- ---------------------------------------------------------------------------

-- Uma linha por motorista, semana e mês. Semana que vira o mês gera duas
-- linhas, cada uma com as corridas do seu mês.
create table public.commission_charges (
  driver_id uuid not null references public.drivers (id),
  week_start date not null,
  month date not null,
  gross numeric(10, 2) not null,
  amount numeric(10, 2) not null,
  primary key (driver_id, week_start, month)
);

create table public.invoices (
  id bigint generated always as identity primary key,
  driver_id uuid not null references public.drivers (id),
  week_start date not null,
  amount numeric(10, 2) not null,
  status public.invoice_status not null default 'open',
  paid_at timestamptz,
  unique (driver_id, week_start)
);

-- Rodar toda segunda para a semana anterior (ver pg_cron no README).
create function public.generate_weekly_invoices(
  p_week_start date,
  p_rate numeric default 0.08,
  p_monthly_cap numeric default 300
)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  r record;
  v_already numeric;
begin
  for r in
    select
      driver_id,
      date_trunc('month', completed_at at time zone 'America/Fortaleza')::date as month,
      sum(final_price) as gross
    from public.rides
    where status = 'completed'
      and (completed_at at time zone 'America/Fortaleza')::date >= p_week_start
      and (completed_at at time zone 'America/Fortaleza')::date < p_week_start + 7
    group by 1, 2
  loop
    select coalesce(sum(amount), 0) into v_already
    from public.commission_charges
    where driver_id = r.driver_id and month = r.month and week_start <> p_week_start;

    insert into public.commission_charges (driver_id, week_start, month, gross, amount)
    values (
      r.driver_id, p_week_start, r.month, r.gross,
      least(round(r.gross * p_rate, 2), greatest(p_monthly_cap - v_already, 0))
    )
    on conflict (driver_id, week_start, month)
    do update set gross = excluded.gross, amount = excluded.amount;
  end loop;

  insert into public.invoices (driver_id, week_start, amount)
  select driver_id, week_start, sum(amount)
  from public.commission_charges
  where week_start = p_week_start
  group by driver_id, week_start
  on conflict (driver_id, week_start)
  do update set amount = excluded.amount
  where public.invoices.status = 'open';
end;
$$;

revoke execute on function public.generate_weekly_invoices(date, numeric, numeric) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Ações da corrida (o app nunca atualiza rides direto)
-- ---------------------------------------------------------------------------

create function public.set_driver_online(p_online boolean)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  update public.drivers
  set is_online = p_online
  where id = auth.uid() and status = 'approved';

  if not found then
    raise exception 'Motorista não aprovado';
  end if;
end;
$$;

create function public.accept_ride(p_ride_id bigint)
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
    and d.vehicle_type = r.vehicle_type;

  if not found then
    raise exception 'Corrida indisponível';
  end if;
end;
$$;

-- Avança a corrida: accepted -> arrived -> in_progress -> completed.
create function public.advance_ride(p_ride_id bigint)
returns public.ride_status
language plpgsql
security definer set search_path = ''
as $$
declare
  v_status public.ride_status;
begin
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
    and driver_id = auth.uid()
    and status in ('accepted', 'arrived', 'in_progress')
  returning status into v_status;

  if v_status is null then
    raise exception 'Corrida não pode avançar';
  end if;
  return v_status;
end;
$$;

create function public.cancel_ride(p_ride_id bigint)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  update public.rides
  set status = 'cancelled', cancelled_at = now()
  where id = p_ride_id
    and (passenger_id = auth.uid() or driver_id = auth.uid())
    and status in ('requested', 'accepted', 'arrived');

  if not found then
    raise exception 'Corrida não pode ser cancelada';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.cities enable row level security;
alter table public.fares enable row level security;
alter table public.intercity_fares enable row level security;
alter table public.profiles enable row level security;
alter table public.drivers enable row level security;
alter table public.driver_locations enable row level security;
alter table public.rides enable row level security;
alter table public.commission_charges enable row level security;
alter table public.invoices enable row level security;

create policy "cidades visíveis" on public.cities
  for select to authenticated using (true);
create policy "tarifas visíveis" on public.fares
  for select to authenticated using (true);
create policy "tarifas intermunicipais visíveis" on public.intercity_fares
  for select to authenticated using (true);

create policy "ver o próprio perfil" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "editar o próprio perfil" on public.profiles
  for update to authenticated using (id = (select auth.uid()));
create policy "passageiro vê o perfil do seu motorista" on public.profiles
  for select to authenticated using (
    exists (
      select 1 from public.rides r
      where r.driver_id = profiles.id and r.passenger_id = (select auth.uid())
    )
  );
create policy "motorista vê o perfil do seu passageiro" on public.profiles
  for select to authenticated using (
    exists (
      select 1 from public.rides r
      where r.passenger_id = profiles.id and r.driver_id = (select auth.uid())
    )
  );

create policy "motorista se cadastra como pendente" on public.drivers
  for insert to authenticated with check (
    id = (select auth.uid()) and status = 'pending' and not is_online and approved_at is null
  );
create policy "motorista vê o próprio cadastro" on public.drivers
  for select to authenticated using (id = (select auth.uid()));
create policy "passageiro vê o carro do seu motorista" on public.drivers
  for select to authenticated using (
    exists (
      select 1 from public.rides r
      where r.driver_id = drivers.id and r.passenger_id = (select auth.uid())
    )
  );

create policy "motorista aprovado publica a localização" on public.driver_locations
  for all to authenticated
  using (driver_id = (select auth.uid()))
  with check (
    driver_id = (select auth.uid())
    and exists (select 1 from public.drivers d where d.id = driver_id and d.status = 'approved')
  );
create policy "passageiro acompanha o motorista da corrida ativa" on public.driver_locations
  for select to authenticated using (
    exists (
      select 1 from public.rides r
      where r.driver_id = driver_locations.driver_id
        and r.passenger_id = (select auth.uid())
        and r.status in ('accepted', 'arrived', 'in_progress')
    )
  );

create policy "passageiro pede corrida" on public.rides
  for insert to authenticated with check (
    passenger_id = (select auth.uid()) and status = 'requested' and driver_id is null
  );
create policy "participantes veem a corrida" on public.rides
  for select to authenticated using (
    passenger_id = (select auth.uid()) or driver_id = (select auth.uid())
  );
create policy "motorista online vê chamados abertos" on public.rides
  for select to authenticated using (
    status = 'requested'
    and exists (
      select 1 from public.drivers d
      where d.id = (select auth.uid())
        and d.status = 'approved'
        and d.is_online
        and d.vehicle_type = rides.vehicle_type
    )
  );

create policy "motorista vê as próprias faturas" on public.invoices
  for select to authenticated using (driver_id = (select auth.uid()));
create policy "motorista vê as próprias cobranças" on public.commission_charges
  for select to authenticated using (driver_id = (select auth.uid()));

-- Realtime: passageiro acompanha o carro, motorista recebe chamados.
alter publication supabase_realtime add table public.rides, public.driver_locations;
