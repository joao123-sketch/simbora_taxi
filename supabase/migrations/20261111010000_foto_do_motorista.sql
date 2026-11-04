-- O passageiro vê a foto do motorista: do motorista que fez proposta para o pedido dele (antes de escolher) e
-- do motorista da corrida em andamento. A foto é a mesma da conta (profiles.photo_path, bucket passenger-photos).
-- O nome e o caminho da foto do motorista da corrida já chegam pela regra de perfil entre quem divide uma corrida.

create function private.passenger_can_see_driver_photo(p_driver uuid)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.rides r
    where r.passenger_id = (select auth.uid())
      and (
        (r.driver_id = p_driver and r.status in ('accepted', 'arrived', 'in_progress'))
        or (
          r.status = 'requested'
          and exists (
            select 1 from public.ride_proposals p
            where p.ride_id = r.id and p.driver_id = p_driver and p.status = 'pending'
          )
        )
      )
  );
$$;

revoke execute on function private.passenger_can_see_driver_photo(uuid) from public, anon;
grant execute on function private.passenger_can_see_driver_photo(uuid) to authenticated;

-- A mesma regra de leitura de fotos, com mais um caminho: o passageiro vê a foto do motorista.
drop policy "ver foto de passageiro" on storage.objects;

create policy "ver foto de passageiro" on storage.objects
  for select to authenticated
  using (
    case when bucket_id = 'passenger-photos' then
      (storage.foldername(name))[1] = (select auth.uid())::text
      or private.driver_can_see_photo(((storage.foldername(name))[1])::uuid)
      or private.passenger_can_see_driver_photo(((storage.foldername(name))[1])::uuid)
      or public.staff_me()
    else false end
  );

-- A lista de propostas ganha o caminho da foto de quem propôs.
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
  proposed_at timestamptz,
  driver_photo_path text
)
language sql
stable
security definer set search_path = ''
as $$
  select p.id, p.extra_amount, p.advance_percent, pr.full_name, d.vehicle_model, d.vehicle_color, d.vehicle_plate, p.created_at, pr.photo_path
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
