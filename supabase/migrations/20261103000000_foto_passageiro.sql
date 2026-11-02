-- Foto do passageiro: selfie obrigatória, guardada num bucket privado. O motorista vê
-- a foto e o nome completo do passageiro antes de aceitar. Em corrida para outra
-- pessoa, o motorista vê a foto de quem pediu (o titular da conta) e só o nome de
-- quem vai andar.

-- ---------------------------------------------------------------------------
-- Coluna e permissão de leitura
-- ---------------------------------------------------------------------------

alter table public.profiles add column photo_path text;

-- O acesso a profiles é por coluna (o telefone fica escondido): libera só o caminho da foto.
grant select (photo_path) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Quem pode ver a foto de um passageiro: o motorista que tem um pedido visível desse
-- passageiro (agora ou agendado) ou a corrida em andamento com ele.
-- ---------------------------------------------------------------------------

create function private.driver_can_see_photo(p_passenger uuid)
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
  );
$$;

revoke execute on function private.driver_can_see_photo(uuid) from public, anon;
grant execute on function private.driver_can_see_photo(uuid) to authenticated;

-- O motorista lê o perfil (nome e foto) do passageiro de um pedido visível; hoje só lê depois de aceitar.
create policy "motorista vê o passageiro do pedido" on public.profiles
  for select to authenticated using (private.driver_can_see_photo(id));

-- ---------------------------------------------------------------------------
-- Bucket privado das fotos: uma pasta por passageiro, {user_id}/avatar.jpg
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('passenger-photos', 'passenger-photos', false, 1048576, array['image/jpeg'])
on conflict (id) do nothing;

create policy "passageiro envia a própria foto" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'passenger-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "passageiro troca a própria foto" on storage.objects
  for update to authenticated
  using (bucket_id = 'passenger-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "passageiro apaga a própria foto" on storage.objects
  for delete to authenticated
  using (bucket_id = 'passenger-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "ver foto de passageiro" on storage.objects
  for select to authenticated
  using (
    case when bucket_id = 'passenger-photos' then
      (storage.foldername(name))[1] = (select auth.uid())::text
      or private.driver_can_see_photo(((storage.foldername(name))[1])::uuid)
      or public.staff_me()
    else false end
  );

-- ---------------------------------------------------------------------------
-- Ninguém pede corrida sem foto (vale mesmo que alguém pule a tela do app)
-- ---------------------------------------------------------------------------

create function private.require_photo()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles p where p.id = new.passenger_id and p.photo_path is not null
  ) then
    raise exception 'Tire a sua foto antes de pedir uma corrida';
  end if;
  return new;
end;
$$;

create trigger rides_require_photo
  before insert on public.rides
  for each row execute function private.require_photo();

-- ---------------------------------------------------------------------------
-- A view de corridas traz a foto de quem pediu
-- ---------------------------------------------------------------------------

drop view public.ride_details;

create view public.ride_details
with (security_invoker = true)
as
select
  r.id,
  r.status,
  r.scheduled_for,
  r.kind,
  r.package_size,
  r.recipient_name,
  r.recipient_note,
  r.rider_name,
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
  r.advance_percent,
  r.advance_received_at,
  r.round_trip,
  r.wait_minutes,
  r.final_price,
  r.requested_at,
  r.completed_at,
  r.cancelled_at,
  private.my_rating(r.id) as my_rating,
  coalesce(r.rider_name, p.full_name) as passenger_name,
  p.photo_path as passenger_photo_path,
  dp.full_name as driver_name,
  d.vehicle_model,
  d.vehicle_color,
  d.vehicle_plate
from public.rides r
left join public.profiles p on p.id = r.passenger_id
left join public.drivers d on d.id = r.driver_id
left join public.profiles dp on dp.id = r.driver_id;

grant select on public.ride_details to authenticated;

-- ---------------------------------------------------------------------------
-- Viagens agendadas: nome completo (ou o de quem vai andar) e a foto
-- ---------------------------------------------------------------------------

drop function public.open_scheduled_rides();

create function public.open_scheduled_rides()
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
  order by r.scheduled_for;
end;
$$;

revoke execute on function public.open_scheduled_rides() from public, anon;
grant execute on function public.open_scheduled_rides() to authenticated;
