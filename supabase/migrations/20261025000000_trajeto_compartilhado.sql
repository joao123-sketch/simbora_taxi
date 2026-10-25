-- Etapa 8: trajeto compartilhado e convite do motorista.
--
-- O passageiro (ou o motorista, pelo SOS) gera um link com código único e manda
-- por WhatsApp. A página web abre sem instalar o app, sem login, e mostra o
-- primeiro nome do motorista, o veículo, a placa, o status e a posição ao vivo.
-- O link vence quando a corrida termina ou é cancelada: depois disso só diz que
-- a corrida acabou. A página lê tudo por funções, nunca pelas tabelas.

-- Corrida de passageiro ou entrega (a entrega vem na migration seguinte). Fica
-- aqui porque a página do trajeto já precisa saber o tipo.
create type public.ride_kind as enum ('ride', 'delivery');
alter table public.rides add column kind public.ride_kind not null default 'ride';

create table public.ride_shares (
  code text primary key,
  ride_id bigint not null unique references public.rides (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.ride_shares enable row level security;
revoke all on public.ride_shares from anon, authenticated;

-- Quem faz parte da corrida gera (ou recupera) o link dela. Um código por corrida.
create function public.create_ride_share(p_ride_id bigint)
returns text
language plpgsql
security definer set search_path = ''
as $$
declare
  v_code text;
begin
  if (select auth.uid()) is null then
    raise exception 'Entre no app primeiro.';
  end if;

  if not exists (
    select 1 from public.rides r
    where r.id = p_ride_id
      and (r.passenger_id = (select auth.uid()) or r.driver_id = (select auth.uid()))
      and r.status in ('requested', 'accepted', 'arrived', 'in_progress')
  ) then
    raise exception 'Só dá para compartilhar uma corrida em andamento';
  end if;

  select s.code into v_code from public.ride_shares s where s.ride_id = p_ride_id;

  if v_code is null then
    v_code := left(private.new_share_code() || private.new_share_code(), 12);
    insert into public.ride_shares (code, ride_id, created_by)
    values (v_code, p_ride_id, (select auth.uid()))
    on conflict (ride_id) do nothing;
    select s.code into v_code from public.ride_shares s where s.ride_id = p_ride_id;
  end if;

  return v_code;
end;
$$;

-- O que a página do trajeto mostra. Código que não existe: nenhuma linha.
-- Corrida terminada ou cancelada: só o status (o link venceu).
create function public.shared_ride(p_code text)
returns table (
  status public.ride_status,
  kind public.ride_kind,
  vehicle_type public.vehicle_type,
  vehicle_model text,
  vehicle_color text,
  vehicle_plate text,
  driver_first_name text,
  origin_address text,
  destination_address text,
  origin_lat double precision,
  origin_lng double precision,
  destination_lat double precision,
  destination_lng double precision,
  driver_lat double precision,
  driver_lng double precision,
  position_updated_at timestamptz
)
language plpgsql
stable
security definer set search_path = ''
as $$
declare
  v_ride public.rides;
begin
  select r.* into v_ride
  from public.ride_shares s
  join public.rides r on r.id = s.ride_id
  where s.code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));

  if not found then
    return;
  end if;

  if v_ride.status in ('completed', 'cancelled') then
    return query select v_ride.status, v_ride.kind, null::public.vehicle_type, null::text, null::text, null::text,
      null::text, null::text, null::text, null::double precision, null::double precision,
      null::double precision, null::double precision, null::double precision, null::double precision,
      null::timestamptz;
    return;
  end if;

  return query
  select
    v_ride.status,
    v_ride.kind,
    v_ride.vehicle_type,
    d.vehicle_model,
    d.vehicle_color,
    d.vehicle_plate,
    split_part(coalesce(p.full_name, ''), ' ', 1),
    v_ride.origin_address,
    v_ride.destination_address,
    extensions.st_y(v_ride.origin::extensions.geometry),
    extensions.st_x(v_ride.origin::extensions.geometry),
    extensions.st_y(v_ride.destination::extensions.geometry),
    extensions.st_x(v_ride.destination::extensions.geometry),
    case when v_ride.status in ('accepted', 'arrived', 'in_progress')
         then extensions.st_y(l.position::extensions.geometry) end,
    case when v_ride.status in ('accepted', 'arrived', 'in_progress')
         then extensions.st_x(l.position::extensions.geometry) end,
    case when v_ride.status in ('accepted', 'arrived', 'in_progress') then l.updated_at end
  from (select 1) one
  left join public.drivers d on d.id = v_ride.driver_id
  left join public.profiles p on p.id = v_ride.driver_id
  left join public.driver_locations l on l.driver_id = v_ride.driver_id;
end;
$$;

-- Convite do motorista: a página aberta pelo QR ou pelo link dele.
create function public.driver_invite(p_code text)
returns table (
  first_name text,
  vehicle_type public.vehicle_type,
  vehicle_model text,
  vehicle_color text
)
language sql
stable
security definer set search_path = ''
as $$
  select
    split_part(coalesce(p.full_name, ''), ' ', 1),
    d.vehicle_type,
    d.vehicle_model,
    d.vehicle_color
  from public.drivers d
  join public.profiles p on p.id = d.id
  where d.share_code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'))
    and d.status = 'approved';
$$;

revoke execute on function public.create_ride_share(bigint) from public, anon;
grant execute on function public.create_ride_share(bigint) to authenticated;
revoke execute on function public.shared_ride(text) from public;
grant execute on function public.shared_ride(text) to anon, authenticated;
revoke execute on function public.driver_invite(text) from public;
grant execute on function public.driver_invite(text) to anon, authenticated;
