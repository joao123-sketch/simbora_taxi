-- Preço dinâmico, versão final: nunca desconta; o fator só sobe quando falta carro.
-- Falta de carro = pedidos que passaram de 60 s sem motorista aceitar (ou que o
-- passageiro cancelou depois de esperar isso), olhando os últimos 15 minutos e só
-- com pelo menos 3 pedidos. A cada 25% de pedidos lentos sobe um degrau de 10%
-- (teto: 3 degraus = 1,30×). O fator anda um degrau por vez, no máximo a cada
-- 5 minutos, separado para carro e moto. O acréscimo inteiro fica com o motorista.

-- ---------------------------------------------------------------------------
-- Configuração (a equipe edita; o painel vem na Etapa 10)
-- ---------------------------------------------------------------------------

alter table public.pricing_settings
  add column step_size numeric(3, 2) not null default 0.10 check (step_size between 0.01 and 0.50),
  add column max_step smallint not null default 3 check (max_step between 0 and 10),
  add column window_minutes smallint not null default 15 check (window_minutes between 1 and 120),
  add column slow_seconds smallint not null default 60 check (slow_seconds between 10 and 600),
  add column min_requests smallint not null default 3 check (min_requests >= 1),
  add column step_every_minutes smallint not null default 5 check (step_every_minutes >= 1),
  add column share_per_step numeric(3, 2) not null default 0.25 check (share_per_step between 0.05 and 1.00);

-- Liga sozinho: com pouco movimento o fator fica em 1,00×. Trava só se a equipe quiser.
update public.pricing_settings set locked = false, locked_factor = 1.00, updated_at = now() where id = 1;

-- As faixas antigas (com desconto) saem.
drop table public.demand_bands;

-- Degrau atual de cada cidade e veículo (carro e moto são contados separados)
-- e quando ele mudou.
create table public.city_pricing_state (
  city_id bigint not null references public.cities (id) on delete cascade,
  vehicle_type public.vehicle_type not null,
  step smallint not null default 0 check (step >= 0),
  changed_at timestamptz not null default now(),
  primary key (city_id, vehicle_type)
);

alter table public.city_pricing_state enable row level security;
revoke all on public.city_pricing_state from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Conta do fator
-- ---------------------------------------------------------------------------

drop function private.demand_factor(bigint);

create function private.demand_factor(p_city_id bigint, p_vehicle_type public.vehicle_type)
returns numeric
language plpgsql
volatile
security definer set search_path = ''
as $$
declare
  v_set public.pricing_settings;
  v_total int;
  v_slow int;
  v_target int;
  v_state public.city_pricing_state;
begin
  select * into v_set from public.pricing_settings where id = 1;
  if v_set.locked then
    return v_set.locked_factor;
  end if;

  select
    count(*),
    count(*) filter (
      where r.accepted_at is null
        and r.status in ('requested', 'cancelled')
        and coalesce(r.cancelled_at, now()) - r.requested_at > make_interval(secs => v_set.slow_seconds)
      or r.accepted_at - r.requested_at > make_interval(secs => v_set.slow_seconds)
    )
  into v_total, v_slow
  from public.rides r
  where r.city_id = p_city_id
    and r.vehicle_type = p_vehicle_type
    and r.requested_at > now() - make_interval(mins => v_set.window_minutes);

  if v_total < v_set.min_requests then
    v_target := 0;
  else
    v_target := least(v_set.max_step, floor(v_slow::numeric / v_total / v_set.share_per_step)::int);
  end if;

  insert into public.city_pricing_state (city_id, vehicle_type) values (p_city_id, p_vehicle_type) on conflict do nothing;
  select * into v_state from public.city_pricing_state s where s.city_id = p_city_id and s.vehicle_type = p_vehicle_type for update;

  -- Um degrau por vez, e só depois do intervalo mínimo.
  if v_state.step <> v_target
     and v_state.changed_at <= now() - make_interval(mins => v_set.step_every_minutes) then
    update public.city_pricing_state s
    set step = s.step + sign(v_target - s.step)::int, changed_at = now()
    where s.city_id = p_city_id and s.vehicle_type = p_vehicle_type
    returning * into v_state;
  end if;

  return 1.00 + least(v_state.step, v_set.max_step) * v_set.step_size;
end;
$$;

revoke execute on function private.demand_factor(bigint, public.vehicle_type) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- O fator é interno: passageiro e motorista só veem o preço final
-- ---------------------------------------------------------------------------

-- Só a equipe lê (para acompanhar quando e quanto o fator agiu).
create table public.ride_pricing (
  ride_id bigint primary key references public.rides (id) on delete cascade,
  factor numeric(4, 2) not null
);

alter table public.ride_pricing enable row level security;
revoke all on public.ride_pricing from anon, authenticated;

-- A cotação não devolve mais o fator ao app.
drop function public.quote_ride(bigint, double precision, double precision, double precision, double precision, bigint);

create function public.quote_ride(
  p_city_id bigint,
  p_origin_lng double precision,
  p_origin_lat double precision,
  p_destination_lng double precision,
  p_destination_lat double precision,
  p_destination_city_id bigint default null
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
  v_base numeric;
  v_km numeric;
  v_factor numeric;
  v_price numeric;
  v_quote public.price_quotes;
begin
  if auth.uid() is null then
    raise exception 'Faça login para ver o preço';
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
      else
        v_factor := private.demand_factor(p_city_id, v_type);
        v_price := round(v_base * v_factor, 2);
      end if;

      insert into public.price_quotes (
        passenger_id, city_id, destination_city_id, vehicle_type,
        origin, destination, price, factor, distance_km
      )
      values (
        auth.uid(), p_city_id, p_destination_city_id, v_type,
        v_origin, v_destination, v_price, v_factor, v_km
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

revoke execute on function public.quote_ride(bigint, double precision, double precision, double precision, double precision, bigint) from public, anon;
grant execute on function public.quote_ride(bigint, double precision, double precision, double precision, double precision, bigint) to authenticated;

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
  p_quote_id uuid,
  p_destination_city_id bigint default null,
  p_destination_place text default null
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
    distance_km, estimated_price
  )
  values (
    auth.uid(), p_city_id, p_destination_city_id, p_vehicle_type, p_payment_method,
    v_origin, p_origin_address, v_destination, p_destination_address, v_place,
    v_quote.distance_km, v_price
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
