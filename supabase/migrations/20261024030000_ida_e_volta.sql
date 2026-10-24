-- Etapa 12: ida e volta nas viagens para outra cidade.
-- O passageiro escolhe ida e volta e quanto tempo o motorista espera. O app
-- sugere o preço: a ida dobrada mais a espera pelo valor por minuto da tarifa.
-- O motorista confere e pode propor um acréscimo (mesmo fluxo da proposta), e
-- o passageiro aceita ou recusa.

alter table public.rides
  add column round_trip boolean not null default false,
  add column wait_minutes int not null default 0 check (wait_minutes between 0 and 480);

alter table public.price_quotes
  add column round_trip boolean not null default false,
  add column wait_minutes int not null default 0;

-- Valor por minuto da tarifa em vigor (a espera da ida e volta usa ele).
create function private.fare_per_min(p_city_id bigint, p_vehicle_type public.vehicle_type)
returns numeric
language sql
stable
security definer set search_path = ''
as $$
  select f.per_min
  from public.fares f
  where f.city_id = p_city_id
    and f.vehicle_type = p_vehicle_type
    and f.effective_from <= current_date
  order by f.effective_from desc
  limit 1;
$$;

revoke execute on function private.fare_per_min(bigint, public.vehicle_type) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Cotação com ida e volta
-- ---------------------------------------------------------------------------

drop function public.quote_ride(bigint, double precision, double precision, double precision, double precision, bigint);

create function public.quote_ride(
  p_city_id bigint,
  p_origin_lng double precision,
  p_origin_lat double precision,
  p_destination_lng double precision,
  p_destination_lat double precision,
  p_destination_city_id bigint default null,
  p_round_trip boolean default false,
  p_wait_minutes int default 0
)
returns table (
  vehicle_type public.vehicle_type,
  quote_id uuid,
  price numeric,
  card_price numeric,
  distance_km numeric,
  expires_at timestamptz
)
language plpgsql
volatile
security definer set search_path = ''
as $$
declare
  v_type public.vehicle_type;
  v_origin extensions.geography := private.point(p_origin_lng, p_origin_lat);
  v_destination extensions.geography := private.point(p_destination_lng, p_destination_lat);
  v_intercity boolean := p_destination_city_id is not null and p_destination_city_id <> p_city_id;
  v_wait int := coalesce(p_wait_minutes, 0);
  v_base numeric;
  v_km numeric;
  v_factor numeric;
  v_price numeric;
  v_quote public.price_quotes;
begin
  if auth.uid() is null then
    raise exception 'Faça login para ver o preço';
  end if;

  -- Ida e volta só existe em viagem para outra cidade (e a espera é limitada).
  if p_round_trip and not v_intercity then
    raise exception 'Ida e volta só vale em viagem para outra cidade';
  end if;
  if v_wait < 0 or v_wait > 480 then
    raise exception 'A espera vai de 0 a 8 horas';
  end if;
  if not p_round_trip then
    v_wait := 0;
  end if;

  -- Cotação velha não serve para nada: limpa as do próprio passageiro.
  delete from public.price_quotes q
  where q.passenger_id = auth.uid() and q.expires_at < now() - interval '1 hour';

  foreach v_type in array enum_range(null::public.vehicle_type) loop
    begin
      select q.price, q.distance_km into v_base, v_km
      from private.ride_quote(p_city_id, v_type, v_origin, v_destination, p_destination_city_id) q;

      if v_intercity then
        v_factor := 1.00;
        v_price := v_base;
        if p_round_trip then
          -- A ida dobrada (ida e volta) mais a espera pelo valor por minuto.
          v_price := v_base * 2 + round(coalesce(private.fare_per_min(p_city_id, v_type), 0) * v_wait, 2);
        end if;
      else
        v_factor := private.demand_factor(p_city_id, v_type);
        v_price := round(v_base * v_factor, 2);
      end if;

      insert into public.price_quotes (
        passenger_id, city_id, destination_city_id, vehicle_type,
        origin, destination, price, factor, distance_km, round_trip, wait_minutes
      )
      values (
        auth.uid(), p_city_id, p_destination_city_id, v_type,
        v_origin, v_destination, v_price, v_factor, v_km, p_round_trip, v_wait
      )
      returning * into v_quote;

      vehicle_type := v_type;
      quote_id := v_quote.id;
      price := v_quote.price;
      card_price := round(v_quote.price * (1 + private.card_surcharge()), 2);
      distance_km := v_quote.distance_km;
      expires_at := v_quote.expires_at;
      return next;
    exception when raise_exception then
      null;
    end;
  end loop;
end;
$$;

revoke execute on function public.quote_ride(bigint, double precision, double precision, double precision, double precision, bigint, boolean, int) from public, anon;
grant execute on function public.quote_ride(bigint, double precision, double precision, double precision, double precision, bigint, boolean, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Pedir corrida com ida e volta
-- ---------------------------------------------------------------------------

drop function public.request_ride(
  bigint, public.vehicle_type, public.payment_method,
  double precision, double precision, text,
  double precision, double precision, text, uuid, bigint, text
);

create function public.request_ride(
  p_city_id bigint,
  p_vehicle_type public.vehicle_type,
  p_payment_method public.payment_method,
  p_origin_lng double precision,
  p_origin_lat double precision,
  p_origin_address text,
  p_destination_lng double precision,
  p_destination_lat double precision,
  p_destination_address text,
  p_quote_id uuid,
  p_destination_city_id bigint default null,
  p_destination_place text default null,
  p_round_trip boolean default false,
  p_wait_minutes int default 0
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
  v_wait int := case when p_round_trip then coalesce(p_wait_minutes, 0) else 0 end;
  v_quote public.price_quotes;
  v_price numeric;
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

  if p_round_trip and not v_intercity then
    raise exception 'Ida e volta só vale em viagem para outra cidade';
  end if;

  if exists (
    select 1 from public.rides r
    where r.passenger_id = auth.uid()
      and r.status in ('requested', 'accepted', 'arrived', 'in_progress')
  ) then
    raise exception 'Você já tem uma corrida em andamento';
  end if;

  -- O preço é o da cotação que o passageiro viu, e ela precisa ser dele,
  -- do mesmo trajeto e estar dentro dos 2 minutos.
  select * into v_quote from public.price_quotes q where q.id = p_quote_id;

  if not found or v_quote.passenger_id <> auth.uid() then
    raise exception 'Confira o preço de novo antes de chamar';
  end if;

  if v_quote.expires_at < now() then
    raise exception 'Confira o preço de novo antes de chamar';
  end if;

  if v_quote.city_id <> p_city_id
     or v_quote.vehicle_type <> p_vehicle_type
     or v_quote.destination_city_id is distinct from p_destination_city_id
     or v_quote.round_trip <> coalesce(p_round_trip, false)
     or v_quote.wait_minutes <> v_wait
     or extensions.st_distance(v_quote.origin, v_origin) > 1
     or extensions.st_distance(v_quote.destination, v_destination) > 1 then
    raise exception 'Confira o preço de novo antes de chamar';
  end if;

  v_price := v_quote.price;
  if p_payment_method = 'card' then
    v_price := round(v_price * (1 + private.card_surcharge()), 2);
  end if;

  insert into public.rides (
    passenger_id, city_id, destination_city_id, vehicle_type, payment_method,
    origin, origin_address, destination, destination_address, destination_place,
    distance_km, estimated_price, round_trip, wait_minutes
  )
  values (
    auth.uid(), p_city_id, p_destination_city_id, p_vehicle_type, p_payment_method,
    v_origin, p_origin_address, v_destination, p_destination_address, v_place,
    v_quote.distance_km, v_price, coalesce(p_round_trip, false), v_wait
  )
  returning id into v_ride_id;

  insert into public.ride_pricing (ride_id, factor) values (v_ride_id, v_quote.factor);

  -- A cotação foi usada: não serve para um segundo pedido.
  delete from public.price_quotes q where q.passenger_id = auth.uid();

  -- Quem recebe o pedido, e quando, é decidido aqui (despacho em ondas).
  perform private.dispatch_ride(v_ride_id);

  return v_ride_id;
end;
$$;

revoke execute on function public.request_ride(
  bigint, public.vehicle_type, public.payment_method,
  double precision, double precision, text,
  double precision, double precision, text, uuid, bigint, text, boolean, int
) from public, anon;
grant execute on function public.request_ride(
  bigint, public.vehicle_type, public.payment_method,
  double precision, double precision, text,
  double precision, double precision, text, uuid, bigint, text, boolean, int
) to authenticated;

-- ---------------------------------------------------------------------------
-- Proposta de preço: também vale na ida e volta
-- ---------------------------------------------------------------------------

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
  where r.id = p_ride_id and r.status = 'requested'
    and (r.destination_place is not null or r.round_trip);

  if not found then
    raise exception 'Esse pedido não está mais aberto';
  end if;

  if v_ride.passenger_id = auth.uid() then
    raise exception 'Você não pode atender o seu próprio pedido';
  end if;

  -- Só propõe quem já está vendo o pedido (a vez dele na fila já chegou).
  if not private.can_see_offer(p_ride_id) then
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

-- ---------------------------------------------------------------------------
-- A view de corridas traz a ida e volta
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
  p.full_name as passenger_name,
  dp.full_name as driver_name,
  d.vehicle_model,
  d.vehicle_color,
  d.vehicle_plate
from public.rides r
left join public.profiles p on p.id = r.passenger_id
left join public.drivers d on d.id = r.driver_id
left join public.profiles dp on dp.id = r.driver_id;
