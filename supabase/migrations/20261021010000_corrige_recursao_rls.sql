-- As policies de rides consultavam drivers e as de drivers consultavam rides,
-- gerando recursão infinita. As checagens cruzadas passam para funções
-- security definer, que leem as tabelas sem reaplicar RLS.

create schema if not exists private;
grant usage on schema private to authenticated;

-- O usuário logado tem (ou teve) corrida com essa pessoa, em qualquer papel.
create function private.shares_ride_with(p_other uuid)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.rides r
    where (r.passenger_id = (select auth.uid()) and r.driver_id = p_other)
       or (r.driver_id = (select auth.uid()) and r.passenger_id = p_other)
  );
$$;

-- O usuário logado é passageiro de uma corrida ativa com esse motorista.
create function private.has_active_ride_with_driver(p_driver uuid)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.rides r
    where r.driver_id = p_driver
      and r.passenger_id = (select auth.uid())
      and r.status in ('accepted', 'arrived', 'in_progress')
  );
$$;

-- O usuário logado é motorista aprovado, online e com esse tipo de veículo.
create function private.is_online_driver_for(p_vehicle_type public.vehicle_type)
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
  );
$$;

create function private.is_approved_driver()
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.drivers d
    where d.id = (select auth.uid()) and d.status = 'approved'
  );
$$;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

drop policy "passageiro vê o perfil do seu motorista" on public.profiles;
drop policy "motorista vê o perfil do seu passageiro" on public.profiles;
create policy "participantes da corrida veem o perfil um do outro" on public.profiles
  for select to authenticated using (private.shares_ride_with(id));

drop policy "passageiro vê o carro do seu motorista" on public.drivers;
create policy "passageiro vê o carro do seu motorista" on public.drivers
  for select to authenticated using (private.shares_ride_with(id));

drop policy "motorista aprovado publica a localização" on public.driver_locations;
create policy "motorista aprovado publica a localização" on public.driver_locations
  for all to authenticated
  using (driver_id = (select auth.uid()))
  with check (driver_id = (select auth.uid()) and private.is_approved_driver());

drop policy "passageiro acompanha o motorista da corrida ativa" on public.driver_locations;
create policy "passageiro acompanha o motorista da corrida ativa" on public.driver_locations
  for select to authenticated using (private.has_active_ride_with_driver(driver_id));

drop policy "motorista online vê chamados abertos" on public.rides;
create policy "motorista online vê chamados abertos" on public.rides
  for select to authenticated using (
    status = 'requested' and private.is_online_driver_for(vehicle_type)
  );
