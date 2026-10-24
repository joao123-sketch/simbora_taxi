-- O motorista vê o passageiro se aproximando do ponto de encontro.
-- Só enquanto a corrida está aceita ou com o motorista no local (nunca durante
-- a viagem nem depois), só o motorista daquela corrida, e só uma posição recente.

create table public.passenger_locations (
  passenger_id uuid primary key references public.profiles (id) on delete cascade,
  position extensions.geography(point, 4326) not null,
  updated_at timestamptz not null default now()
);

-- Ninguém lê nem escreve direto: tudo passa pelas funções abaixo.
alter table public.passenger_locations enable row level security;
revoke all on public.passenger_locations from anon, authenticated;

-- O passageiro manda a própria posição. Sem corrida aceita ou com motorista no
-- local, a função apaga a posição guardada e não grava nada.
create function public.update_passenger_location(p_lng double precision, p_lat double precision)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  if not exists (
    select 1 from public.rides r
    where r.passenger_id = auth.uid()
      and r.status in ('accepted', 'arrived')
  ) then
    delete from public.passenger_locations where passenger_id = auth.uid();
    return;
  end if;

  insert into public.passenger_locations (passenger_id, position, updated_at)
  values (auth.uid(), private.point(p_lng, p_lat), now())
  on conflict (passenger_id) do update
    set position = excluded.position, updated_at = now();
end;
$$;

revoke execute on function public.update_passenger_location(double precision, double precision) from public, anon;
grant execute on function public.update_passenger_location(double precision, double precision) to authenticated;

-- O motorista da corrida lê a posição do passageiro dela.
create function public.get_passenger_position(p_ride_id bigint)
returns table (lat double precision, lng double precision, updated_at timestamptz)
language sql
stable
security definer set search_path = ''
as $$
  select
    extensions.st_y(l.position::extensions.geometry) as lat,
    extensions.st_x(l.position::extensions.geometry) as lng,
    l.updated_at
  from public.rides r
  join public.passenger_locations l on l.passenger_id = r.passenger_id
  where r.id = p_ride_id
    and r.driver_id = auth.uid()
    and r.status in ('accepted', 'arrived')
    and l.updated_at > now() - interval '5 minutes';
$$;

revoke execute on function public.get_passenger_position(bigint) from public, anon;
grant execute on function public.get_passenger_position(bigint) to authenticated;
