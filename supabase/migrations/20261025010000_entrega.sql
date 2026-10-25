-- Etapa 14 (versão pequena): entrega como um tipo de corrida.
--
-- Quem pede escolhe onde pegar, onde entregar, o tamanho do pacote (P, M ou G)
-- e quem recebe. O preço é o da tabela do veículo com um desconto de entrega
-- (não leva passageiro), editável no painel. Pacote G só vai de carro. O
-- motorista só leva o pacote e finaliza digitando o código de 4 dígitos que
-- quem recebe tem. Quem pede paga direto ao motorista, como numa corrida.
-- Reaproveita despacho, chat, avaliação e histórico.

alter table public.rides
  add column package_size text check (package_size in ('P', 'M', 'G')),
  add column recipient_name text check (char_length(recipient_name) between 2 and 80),
  add column recipient_note text check (char_length(recipient_note) <= 200),
  add constraint rides_delivery_fields check (
    (kind = 'ride' and package_size is null and recipient_name is null)
    or (kind = 'delivery' and package_size is not null and recipient_name is not null)
  );

-- Os tamanhos de pacote (nome, faixa de peso, exemplo e quais veículos levam),
-- editáveis no painel. O app lê por `delivery_sizes()`.
create table public.delivery_sizes (
  size text primary key check (size in ('P', 'M', 'G')),
  name text not null check (char_length(name) between 2 and 30),
  weight text not null check (char_length(weight) between 2 and 40),
  example text not null check (char_length(example) between 2 and 160),
  allow_moto boolean not null default true,
  allow_car boolean not null default true,
  check (allow_moto or allow_car)
);

insert into public.delivery_sizes (size, name, weight, example, allow_moto, allow_car) values
  ('P', 'Pequeno', 'até 5 kg', 'Cabe numa sacola: documentos, remédio, um lanche.', true, true),
  ('M', 'Médio', 'de 5 a 10 kg', 'Do tamanho de uma caixa de sapatos ou de uma pizza grande.', true, true),
  ('G', 'Grande', 'mais de 10 kg', 'Caixa grande, compras do mercado, vários volumes.', false, true);

alter table public.delivery_sizes enable row level security;
revoke all on public.delivery_sizes from anon, authenticated;

create function public.delivery_sizes()
returns table (size text, name text, weight text, example text, allow_moto boolean, allow_car boolean)
language sql
stable
security definer set search_path = ''
as $$
  select s.size, s.name, s.weight, s.example, s.allow_moto, s.allow_car
  from public.delivery_sizes s
  order by s.size desc;
$$;

revoke execute on function public.delivery_sizes() from public, anon;
grant execute on function public.delivery_sizes() to authenticated;

-- O veículo leva esse tamanho de pacote?
create function private.size_allows(p_size text, p_vehicle_type public.vehicle_type)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select coalesce(
    (select case p_vehicle_type when 'moto' then s.allow_moto else s.allow_car end
     from public.delivery_sizes s where s.size = p_size),
    false);
$$;

revoke execute on function private.size_allows(text, public.vehicle_type) from public, anon, authenticated;

-- Desconto de entrega, em fração (0,20 = 20% mais barato). Editável no painel.
alter table public.pricing_settings
  add column delivery_discount numeric(4, 3) not null default 0.20 check (delivery_discount between 0 and 0.80);

create function private.delivery_discount()
returns numeric
language sql
stable
security definer set search_path = ''
as $$
  select s.delivery_discount from public.pricing_settings s where s.id = 1;
$$;

revoke execute on function private.delivery_discount() from public, anon, authenticated;

-- O código de 4 dígitos de cada entrega: só quem pediu enxerga (por função), o
-- motorista nunca. Sem limite de tentativas: o motorista pode digitar de novo.
create table private.delivery_codes (
  ride_id bigint primary key references public.rides (id) on delete cascade,
  code text not null
);

create function private.new_delivery_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select lpad((floor(random() * 10000))::int::text, 4, '0');
$$;

revoke execute on function private.new_delivery_code() from public, anon, authenticated;

-- Cotações de entrega ficam à parte das de corrida, para uma cotação com
-- desconto nunca servir para pedir corrida comum.
create table public.delivery_quotes (
  like public.price_quotes including defaults,
  package_size text not null check (package_size in ('P', 'M', 'G')),
  primary key (id)
);

create index delivery_quotes_passenger_idx on public.delivery_quotes (passenger_id, created_at desc);
alter table public.delivery_quotes enable row level security;
revoke all on public.delivery_quotes from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Cotação da entrega: um preço por veículo que leva o tamanho pedido
-- ---------------------------------------------------------------------------

create function public.quote_delivery(
  p_city_id bigint,
  p_origin_lng double precision,
  p_origin_lat double precision,
  p_destination_lng double precision,
  p_destination_lat double precision,
  p_package_size text
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
  v_base numeric;
  v_km numeric;
  v_factor numeric;
  v_price numeric;
  v_quote public.delivery_quotes;
begin
  if auth.uid() is null then
    raise exception 'Faça login para ver o preço';
  end if;
  if p_package_size is null or p_package_size not in ('P', 'M', 'G') then
    raise exception 'Escolha o tamanho do pacote';
  end if;

  delete from public.delivery_quotes q
  where q.passenger_id = auth.uid() and q.expires_at < now() - interval '1 hour';

  foreach v_type in array enum_range(null::public.vehicle_type) loop
    -- Só entram os veículos que levam esse tamanho (configurado no painel).
    if not private.size_allows(p_package_size, v_type) then
      continue;
    end if;

    begin
      select q.price, q.distance_km into v_base, v_km
      from private.ride_quote(p_city_id, v_type, v_origin, v_destination, null) q;

      v_factor := private.demand_factor(p_city_id, v_type);
      v_price := round(v_base * v_factor * (1 - private.delivery_discount()), 2);

      insert into public.delivery_quotes (
        passenger_id, city_id, destination_city_id, vehicle_type,
        origin, destination, price, factor, distance_km, package_size
      )
      values (
        auth.uid(), p_city_id, null, v_type,
        v_origin, v_destination, v_price, v_factor, v_km, p_package_size
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

revoke execute on function public.quote_delivery(bigint, double precision, double precision, double precision, double precision, text) from public, anon;
grant execute on function public.quote_delivery(bigint, double precision, double precision, double precision, double precision, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Pedir a entrega
-- ---------------------------------------------------------------------------

create function public.request_delivery(
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
  p_package_size text,
  p_recipient_name text,
  p_recipient_note text default null
)
returns bigint
language plpgsql
security definer set search_path = ''
as $$
declare
  v_origin extensions.geography := private.point(p_origin_lng, p_origin_lat);
  v_destination extensions.geography := private.point(p_destination_lng, p_destination_lat);
  v_name text := nullif(trim(coalesce(p_recipient_name, '')), '');
  v_note text := nullif(trim(coalesce(p_recipient_note, '')), '');
  v_quote public.delivery_quotes;
  v_price numeric;
  v_ride_id bigint;
begin
  if auth.uid() is null then
    raise exception 'Faça login para pedir a entrega';
  end if;

  if not exists (select 1 from public.cities c where c.id = p_city_id and c.active) then
    raise exception 'O Simbora Car ainda não atende essa cidade';
  end if;

  if p_package_size is null or p_package_size not in ('P', 'M', 'G') then
    raise exception 'Escolha o tamanho do pacote';
  end if;
  if not private.size_allows(p_package_size, p_vehicle_type) then
    raise exception 'Esse veículo não leva um pacote desse tamanho';
  end if;
  if v_name is null or char_length(v_name) < 2 then
    raise exception 'Diga o nome de quem vai receber';
  end if;
  if char_length(v_name) > 80 or char_length(coalesce(v_note, '')) > 200 then
    raise exception 'O nome ou o recado ficou muito grande';
  end if;

  if not (p_payment_method = any (private.payment_options(p_city_id, p_vehicle_type))) then
    raise exception 'Essa forma de pagamento não está disponível agora. Escolha outra.';
  end if;

  if exists (
    select 1 from public.rides r
    where r.passenger_id = auth.uid()
      and r.status in ('requested', 'accepted', 'arrived', 'in_progress')
  ) then
    raise exception 'Você já tem uma corrida em andamento';
  end if;

  select * into v_quote from public.delivery_quotes q where q.id = p_quote_id;

  if not found or v_quote.passenger_id <> auth.uid() or v_quote.expires_at < now() then
    raise exception 'Confira o preço de novo antes de chamar';
  end if;

  if v_quote.city_id <> p_city_id
     or v_quote.vehicle_type <> p_vehicle_type
     or v_quote.package_size <> p_package_size
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
    origin, origin_address, destination, destination_address,
    distance_km, estimated_price,
    kind, package_size, recipient_name, recipient_note
  )
  values (
    auth.uid(), p_city_id, null, p_vehicle_type, p_payment_method,
    v_origin, p_origin_address, v_destination, p_destination_address,
    v_quote.distance_km, v_price,
    'delivery', p_package_size, v_name, v_note
  )
  returning id into v_ride_id;

  insert into public.ride_pricing (ride_id, factor) values (v_ride_id, v_quote.factor);
  insert into private.delivery_codes (ride_id, code) values (v_ride_id, private.new_delivery_code());

  delete from public.delivery_quotes q where q.passenger_id = auth.uid();

  perform private.dispatch_ride(v_ride_id);

  return v_ride_id;
end;
$$;

revoke execute on function public.request_delivery(
  bigint, public.vehicle_type, public.payment_method,
  double precision, double precision, text,
  double precision, double precision, text, uuid, text, text, text
) from public, anon;
grant execute on function public.request_delivery(
  bigint, public.vehicle_type, public.payment_method,
  double precision, double precision, text,
  double precision, double precision, text, uuid, text, text, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- O código: só quem pediu a entrega lê (para mandar a quem recebe)
-- ---------------------------------------------------------------------------

create function public.my_delivery_code(p_ride_id bigint)
returns text
language sql
stable
security definer set search_path = ''
as $$
  select c.code
  from private.delivery_codes c
  join public.rides r on r.id = c.ride_id
  where c.ride_id = p_ride_id and r.passenger_id = (select auth.uid());
$$;

revoke execute on function public.my_delivery_code(bigint) from public, anon;
grant execute on function public.my_delivery_code(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- Finalizar: entrega só termina com o código de quem recebe
-- ---------------------------------------------------------------------------

create or replace function public.advance_ride(p_ride_id bigint)
returns public.ride_status
language plpgsql
security definer set search_path = ''
as $$
declare
  v_ride public.rides;
  v_status public.ride_status;
begin
  select * into v_ride
  from public.rides r
  where r.id = p_ride_id
    and r.driver_id = auth.uid()
    and r.status in ('accepted', 'arrived', 'in_progress')
  for update;

  if not found then
    raise exception 'Corrida não pode avançar';
  end if;

  if v_ride.kind = 'delivery' and v_ride.status = 'in_progress' then
    raise exception 'Para finalizar a entrega, digite o código de quem recebeu';
  end if;

  -- Viagem para outra cidade: precisa ter o adiantamento escolhido e, se for
  -- maior que 0%, recebido antes de iniciar.
  if v_ride.status = 'arrived' and private.is_intercity(v_ride) then
    if v_ride.advance_percent is null then
      raise exception 'Escolha o adiantamento antes de iniciar a viagem';
    end if;
    if v_ride.advance_percent > 0 and v_ride.advance_received_at is null then
      raise exception 'Confirme que recebeu o pagamento adiantado antes de iniciar a viagem';
    end if;
  end if;

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
  returning status into v_status;

  return v_status;
end;
$$;

-- Devolve true quando finalizou e false quando o código estava errado.
create function public.complete_delivery(p_ride_id bigint, p_code text)
returns boolean
language plpgsql
security definer set search_path = ''
as $$
declare
  v_ride public.rides;
  v_code private.delivery_codes;
begin
  select * into v_ride
  from public.rides r
  where r.id = p_ride_id
    and r.driver_id = auth.uid()
    and r.kind = 'delivery'
    and r.status = 'in_progress'
  for update;

  if not found then
    raise exception 'Essa entrega não pode ser finalizada agora';
  end if;

  select * into v_code from private.delivery_codes c where c.ride_id = p_ride_id;

  if regexp_replace(coalesce(p_code, ''), '[^0-9]', '', 'g') is distinct from v_code.code then
    return false;
  end if;

  update public.rides
  set status = 'completed', completed_at = now(), final_price = estimated_price
  where id = p_ride_id;

  return true;
end;
$$;

revoke execute on function public.complete_delivery(bigint, text) from public, anon;
grant execute on function public.complete_delivery(bigint, text) to authenticated;

-- ---------------------------------------------------------------------------
-- A view de corridas traz o tipo, o tamanho e quem recebe
-- ---------------------------------------------------------------------------

drop view public.ride_details;

create view public.ride_details
with (security_invoker = true)
as
select
  r.id,
  r.status,
  r.kind,
  r.package_size,
  r.recipient_name,
  r.recipient_note,
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

grant select on public.ride_details to authenticated;

-- ---------------------------------------------------------------------------
-- Painel: o desconto de entrega entra nas configurações de preço
-- ---------------------------------------------------------------------------

create or replace function public.staff_set_pricing_settings(p_patch jsonb)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  perform private.require_staff();

  update public.pricing_settings s
  set locked = coalesce((p_patch ->> 'locked')::boolean, s.locked),
      locked_factor = coalesce((p_patch ->> 'locked_factor')::numeric, s.locked_factor),
      step_size = coalesce((p_patch ->> 'step_size')::numeric, s.step_size),
      max_step = coalesce((p_patch ->> 'max_step')::smallint, s.max_step),
      window_minutes = coalesce((p_patch ->> 'window_minutes')::smallint, s.window_minutes),
      slow_seconds = coalesce((p_patch ->> 'slow_seconds')::smallint, s.slow_seconds),
      min_requests = coalesce((p_patch ->> 'min_requests')::smallint, s.min_requests),
      step_every_minutes = coalesce((p_patch ->> 'step_every_minutes')::smallint, s.step_every_minutes),
      share_per_step = coalesce((p_patch ->> 'share_per_step')::numeric, s.share_per_step),
      card_surcharge = coalesce((p_patch ->> 'card_surcharge')::numeric, s.card_surcharge),
      delivery_discount = coalesce((p_patch ->> 'delivery_discount')::numeric, s.delivery_discount),
      updated_at = now()
  where s.id = 1;
exception
  when check_violation then
    raise exception 'Um dos valores está fora do limite permitido';
end;
$$;

-- ---------------------------------------------------------------------------
-- Painel: editar os tamanhos de pacote e ver tudo na tela de preços
-- ---------------------------------------------------------------------------

create function public.staff_set_delivery_size(
  p_size text,
  p_name text,
  p_weight text,
  p_example text,
  p_allow_moto boolean,
  p_allow_car boolean
)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  perform private.require_staff();

  update public.delivery_sizes s
  set name = trim(p_name),
      weight = trim(p_weight),
      example = trim(p_example),
      allow_moto = p_allow_moto,
      allow_car = p_allow_car
  where s.size = p_size;

  if not found then
    raise exception 'Tamanho de pacote inexistente';
  end if;
exception
  when check_violation then
    raise exception 'Um dos textos está fora do tamanho permitido, e pelo menos um veículo precisa levar o pacote';
end;
$$;

revoke execute on function public.staff_set_delivery_size(text, text, text, text, boolean, boolean) from public, anon;
grant execute on function public.staff_set_delivery_size(text, text, text, text, boolean, boolean) to authenticated;

create or replace function public.staff_pricing_overview()
returns jsonb
language plpgsql
stable
security definer set search_path = ''
as $$
begin
  perform private.require_staff();

  return jsonb_build_object(
    'cities', (
      select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'state', c.state, 'active', c.active) order by c.name), '[]'::jsonb)
      from public.cities c
    ),
    'fares', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'city_id', f.city_id, 'city_name', c.name, 'vehicle_type', f.vehicle_type,
        'base', f.base, 'per_km', f.per_km, 'per_min', f.per_min, 'minimum', f.minimum,
        'effective_from', f.effective_from
      ) order by c.name, f.vehicle_type, f.effective_from desc), '[]'::jsonb)
      from public.fares f join public.cities c on c.id = f.city_id
    ),
    'intercity', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'origin_city_id', i.origin_city_id, 'origin_name', o.name,
        'destination_city_id', i.destination_city_id, 'destination_name', t.name,
        'vehicle_type', i.vehicle_type, 'price', i.price
      ) order by o.name, t.name, i.vehicle_type), '[]'::jsonb)
      from public.intercity_fares i
      join public.cities o on o.id = i.origin_city_id
      join public.cities t on t.id = i.destination_city_id
    ),
    'delivery_sizes', (
      select coalesce(jsonb_agg(to_jsonb(d) order by d.size), '[]'::jsonb)
      from public.delivery_sizes d
    ),
    'settings', (select to_jsonb(s) from public.pricing_settings s where s.id = 1)
  );
end;
$$;
