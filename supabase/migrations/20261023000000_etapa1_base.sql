-- Etapa 1: tarifas novas com vigência, fim da comissão, telefones fora do
-- alcance dos usuários e destino só dentro da cidade.

-- ---------------------------------------------------------------------------
-- Tarifas com data de vigência (permitem o reajuste anual sem apagar o histórico)
-- ---------------------------------------------------------------------------

alter table public.fares add column effective_from date not null default date '2026-01-01';
alter table public.fares drop constraint fares_pkey;
alter table public.fares add primary key (city_id, vehicle_type, effective_from);
alter table public.fares alter column effective_from drop default;

insert into public.fares (city_id, vehicle_type, effective_from, base, per_km, per_min, minimum)
select c.id, v.vehicle_type::public.vehicle_type, date '2026-10-23', v.base, v.per_km, v.per_min, v.minimum
from public.cities c
cross join (values
  ('car', 12.00, 2.00, 0.30, 10.00),
  ('moto', 7.00, 1.20, 0.20, 6.00)
) as v (vehicle_type, base, per_km, per_min, minimum)
where c.name = 'Guaraciaba do Norte' and c.state = 'CE'
on conflict (city_id, vehicle_type, effective_from) do nothing;

-- A tarifa em vigor é a mais recente que já começou.
create or replace function private.ride_quote(
  p_city_id bigint,
  p_vehicle_type public.vehicle_type,
  p_origin extensions.geography,
  p_destination extensions.geography,
  p_destination_city_id bigint
)
returns table (price numeric, distance_km numeric)
language plpgsql
stable
security definer set search_path = ''
as $$
declare
  v_km numeric;
  v_fixed numeric;
  v_fare public.fares;
begin
  v_km := round((extensions.st_distance(p_origin, p_destination) / 1000 * 1.3)::numeric, 2);

  if p_destination_city_id is not null and p_destination_city_id <> p_city_id then
    select f.price into v_fixed
    from public.intercity_fares f
    where f.origin_city_id = p_city_id
      and f.destination_city_id = p_destination_city_id
      and f.vehicle_type = p_vehicle_type;

    if v_fixed is null then
      raise exception 'Sem preço para essa cidade';
    end if;
    return query select v_fixed, v_km;
    return;
  end if;

  select * into v_fare
  from public.fares f
  where f.city_id = p_city_id
    and f.vehicle_type = p_vehicle_type
    and f.effective_from <= current_date
  order by f.effective_from desc
  limit 1;

  if not found then
    raise exception 'Sem tarifa para essa cidade';
  end if;

  return query select
    greatest(v_fare.minimum, round(v_fare.base + v_fare.per_km * v_km + v_fare.per_min * (v_km / 30 * 60), 2)),
    v_km;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fim da comissão: o Simbora Car cobra mensalidade fixa do motorista
-- ---------------------------------------------------------------------------

drop function if exists public.generate_weekly_invoices(date, numeric, numeric);
drop table if exists public.invoices;
drop table if exists public.commission_charges;
drop type if exists public.invoice_status;

-- ---------------------------------------------------------------------------
-- Telefone não é exposto: nem na view, nem por leitura direta do perfil
-- ---------------------------------------------------------------------------

drop view public.ride_details;

create view public.ride_details
with (security_invoker = true)
as
select
  r.id,
  r.status,
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
  extensions.st_y(r.destination::extensions.geometry) as destination_lat,
  extensions.st_x(r.destination::extensions.geometry) as destination_lng,
  r.distance_km,
  r.estimated_price,
  r.final_price,
  r.requested_at,
  p.full_name as passenger_name,
  dp.full_name as driver_name,
  d.vehicle_model,
  d.vehicle_color,
  d.vehicle_plate
from public.rides r
left join public.profiles p on p.id = r.passenger_id
left join public.drivers d on d.id = r.driver_id
left join public.profiles dp on dp.id = r.driver_id;

-- O RLS deixa o passageiro ler o perfil do motorista da corrida (e o contrário);
-- o RLS não filtra colunas, então o telefone sai por permissão de coluna.
-- O telefone continua gravado para a equipe, no painel do Supabase.
revoke select on public.profiles from anon, authenticated;
grant select (id, full_name, created_at) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Destino só dentro da cidade (sítios e distritos ficam de fora)
-- ---------------------------------------------------------------------------

-- Enquanto não temos o perímetro urbano de verdade, vale um raio em volta do
-- centro. Ajustável por cidade.
alter table public.cities add column service_radius_km numeric(5, 2) not null default 4.00;

create or replace view public.cities_map
with (security_invoker = true)
as
select
  id,
  name,
  state,
  active,
  extensions.st_y(center::extensions.geometry) as lat,
  extensions.st_x(center::extensions.geometry) as lng,
  service_radius_km
from public.cities;

create function private.assert_destination_in_city(
  p_city_id bigint,
  p_destination extensions.geography,
  p_destination_city_id bigint
)
returns void
language plpgsql
stable
security definer set search_path = ''
as $$
declare
  v_center extensions.geography;
  v_radius numeric;
begin
  -- Viagem para outra cidade tem preço e ponto combinados à parte.
  if p_destination_city_id is not null and p_destination_city_id <> p_city_id then
    return;
  end if;

  select c.center, c.service_radius_km into v_center, v_radius
  from public.cities c
  where c.id = p_city_id;

  if v_center is not null and extensions.st_distance(p_destination, v_center) > v_radius * 1000 then
    raise exception 'Esse destino fica fora da cidade. O Simbora Car leva só até a área urbana: sítios e distritos não são atendidos.';
  end if;
end;
$$;

revoke execute on function private.assert_destination_in_city(bigint, extensions.geography, bigint) from public, anon, authenticated;

create or replace function public.quote_ride(
  p_city_id bigint,
  p_origin_lng double precision,
  p_origin_lat double precision,
  p_destination_lng double precision,
  p_destination_lat double precision,
  p_destination_city_id bigint default null
)
returns table (vehicle_type public.vehicle_type, price numeric, distance_km numeric)
language plpgsql
stable
security definer set search_path = ''
as $$
declare
  v_type public.vehicle_type;
  v_price numeric;
  v_km numeric;
begin
  perform private.assert_destination_in_city(
    p_city_id, private.point(p_destination_lng, p_destination_lat), p_destination_city_id
  );

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
      distance_km := v_km;
      return next;
    exception when raise_exception then
      null;
    end;
  end loop;
end;
$$;

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
  p_destination_city_id bigint default null
)
returns bigint
language plpgsql
security definer set search_path = ''
as $$
declare
  v_origin extensions.geography := private.point(p_origin_lng, p_origin_lat);
  v_destination extensions.geography := private.point(p_destination_lng, p_destination_lat);
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

  perform private.assert_destination_in_city(p_city_id, v_destination, p_destination_city_id);

  if exists (
    select 1 from public.rides r
    where r.passenger_id = auth.uid()
      and r.status in ('requested', 'accepted', 'arrived', 'in_progress')
  ) then
    raise exception 'Você já tem uma corrida em andamento';
  end if;

  select q.price, q.distance_km into v_price, v_km
  from private.ride_quote(p_city_id, p_vehicle_type, v_origin, v_destination, p_destination_city_id) q;

  insert into public.rides (
    passenger_id, city_id, destination_city_id, vehicle_type, payment_method,
    origin, origin_address, destination, destination_address,
    distance_km, estimated_price
  )
  values (
    auth.uid(), p_city_id, p_destination_city_id, p_vehicle_type, p_payment_method,
    v_origin, p_origin_address, v_destination, p_destination_address,
    v_km, v_price
  )
  returning id into v_ride_id;

  return v_ride_id;
end;
$$;
