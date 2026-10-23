-- Etapa 7: preço dinâmico.
-- Fator = pedidos abertos ÷ motoristas livres da cidade nos últimos 5 minutos,
-- em faixas. Só vale dentro da cidade (viagem intermunicipal tem preço fixo).
-- O passageiro vê o preço final antes de chamar; a cotação vale 2 minutos e é
-- o único preço que o request_ride aceita.

-- ---------------------------------------------------------------------------
-- Configuração (a equipe edita; o painel vem na Etapa 10)
-- ---------------------------------------------------------------------------

-- Uma linha só. Com a trava ligada, o fator é sempre o valor travado.
create table public.pricing_settings (
  id smallint primary key default 1 check (id = 1),
  locked boolean not null default false,
  locked_factor numeric(4, 2) not null default 1.00 check (locked_factor between 0.50 and 3.00),
  updated_at timestamptz not null default now()
);

insert into public.pricing_settings default values;

-- Faixas da razão pedidos/motoristas: vale a primeira faixa cujo limite é
-- maior ou igual à razão; a faixa sem limite (null) pega o resto.
create table public.demand_bands (
  id smallint generated always as identity primary key,
  up_to numeric(5, 2) unique,
  factor numeric(4, 2) not null check (factor between 0.50 and 3.00)
);

insert into public.demand_bands (up_to, factor) values
  (0.50, 0.85),
  (1.00, 1.00),
  (1.50, 1.15),
  (2.00, 1.30),
  (null, 1.40);

-- Só a equipe (painel / SQL) mexe: o app nunca lê nem escreve aqui.
alter table public.pricing_settings enable row level security;
alter table public.demand_bands enable row level security;
revoke all on public.pricing_settings, public.demand_bands from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Conta do fator
-- ---------------------------------------------------------------------------

create function private.demand_factor(p_city_id bigint)
returns numeric
language plpgsql
stable
security definer set search_path = ''
as $$
declare
  v_settings public.pricing_settings;
  v_open int;
  v_free int;
  v_ratio numeric;
  v_factor numeric;
begin
  select * into v_settings from public.pricing_settings where id = 1;
  if v_settings.locked then
    return v_settings.locked_factor;
  end if;

  select count(*) into v_open
  from public.rides r
  where r.city_id = p_city_id
    and r.status = 'requested'
    and r.requested_at > now() - interval '5 minutes';

  select count(*) into v_free
  from public.drivers d
  where d.city_id = p_city_id
    and d.status = 'approved'
    and d.is_online
    and not exists (
      select 1 from public.rides a
      where a.driver_id = d.id and a.status in ('accepted', 'arrived', 'in_progress')
    );

  -- Ninguém livre: com pedido esperando é a maior faixa; sem pedido, a menor.
  if v_free = 0 then
    v_ratio := case when v_open > 0 then 1000 else 0 end;
  else
    v_ratio := v_open::numeric / v_free;
  end if;

  select b.factor into v_factor
  from public.demand_bands b
  where b.up_to is null or v_ratio <= b.up_to
  order by b.up_to nulls last
  limit 1;

  return coalesce(v_factor, 1.00);
end;
$$;

revoke execute on function private.demand_factor(bigint) from public, anon, authenticated;

-- Valor mínimo da tarifa em vigor: o fator nunca leva o preço abaixo dele.
create function private.fare_minimum(p_city_id bigint, p_vehicle_type public.vehicle_type)
returns numeric
language sql
stable
security definer set search_path = ''
as $$
  select f.minimum
  from public.fares f
  where f.city_id = p_city_id
    and f.vehicle_type = p_vehicle_type
    and f.effective_from <= current_date
  order by f.effective_from desc
  limit 1;
$$;

revoke execute on function private.fare_minimum(bigint, public.vehicle_type) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Cotações: o preço mostrado é o preço cobrado
-- ---------------------------------------------------------------------------

create table public.price_quotes (
  id uuid primary key default gen_random_uuid(),
  passenger_id uuid not null references public.profiles (id) on delete cascade,
  city_id bigint not null references public.cities (id),
  destination_city_id bigint references public.cities (id),
  vehicle_type public.vehicle_type not null,
  origin extensions.geography(point, 4326) not null,
  destination extensions.geography(point, 4326) not null,
  price numeric(10, 2) not null,
  factor numeric(4, 2) not null,
  distance_km numeric(8, 2) not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '2 minutes'
);

create index price_quotes_passenger_idx on public.price_quotes (passenger_id, created_at desc);

-- Só as funções abaixo (security definer) usam a tabela.
alter table public.price_quotes enable row level security;
revoke all on public.price_quotes from anon, authenticated;

-- Novo formato: devolve o id da cotação e o fator. O preço já vem com o fator.
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
  factor numeric,
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

  v_factor := case when v_intercity then 1.00 else private.demand_factor(p_city_id) end;

  foreach v_type in array enum_range(null::public.vehicle_type) loop
    begin
      select q.price, q.distance_km into v_base, v_km
      from private.ride_quote(p_city_id, v_type, v_origin, v_destination, p_destination_city_id) q;

      if v_intercity then
        v_price := v_base;
      else
        v_price := greatest(private.fare_minimum(p_city_id, v_type), round(v_base * v_factor, 2));
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
      factor := v_quote.factor;
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

-- ---------------------------------------------------------------------------
-- Pedir corrida: só com cotação válida
-- ---------------------------------------------------------------------------

drop function public.request_ride(
  bigint, public.vehicle_type, public.payment_method,
  double precision, double precision, text,
  double precision, double precision, text, bigint, text
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
    raise exception 'O preço mudou. Confira o novo valor e chame de novo.';
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
  double precision, double precision, text, uuid, bigint, text
) from public, anon;
grant execute on function public.request_ride(
  bigint, public.vehicle_type, public.payment_method,
  double precision, double precision, text,
  double precision, double precision, text, uuid, bigint, text
) to authenticated;
