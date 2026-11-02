-- Fase 3: preços.
-- Sem valor mínimo, tarifas novas dentro da cidade, adicional noturno com teto
-- (só na corrida dentro da cidade), preço único por par de cidades nos dois
-- sentidos e funções do painel para rotas e cidades.

-- ---------------------------------------------------------------------------
-- Configuração do noturno e do teto (a equipe edita no painel)
-- ---------------------------------------------------------------------------

alter table public.pricing_settings
  add column night_surcharge numeric(4, 2) not null default 0.20 check (night_surcharge between 0 and 1),
  add column night_from smallint not null default 22 check (night_from between 0 and 23),
  add column night_until smallint not null default 6 check (night_until between 0 and 23),
  add column max_factor numeric(4, 2) not null default 1.50 check (max_factor between 1 and 3);

-- O noturno vale das 22h às 5h59 no horário de Fortaleza. Se a janela cruza a
-- meia-noite (início maior que o fim), vale a partir do início ou antes do fim.
create function private.night_applies(p_at timestamptz)
returns boolean
language plpgsql
stable
security definer set search_path = ''
as $$
declare
  v_set public.pricing_settings;
  v_hour int := extract(hour from p_at at time zone 'America/Fortaleza')::int;
begin
  select * into v_set from public.pricing_settings where id = 1;
  if v_set.night_from > v_set.night_until then
    return v_hour >= v_set.night_from or v_hour < v_set.night_until;
  end if;
  return v_hour >= v_set.night_from and v_hour < v_set.night_until;
end;
$$;

revoke execute on function private.night_applies(timestamptz) from public, anon, authenticated;

-- Fator final da corrida dentro da cidade: o dinâmico, mais o noturno, nunca
-- acima do teto.
create function private.pricing_factor(
  p_city_id bigint,
  p_vehicle_type public.vehicle_type,
  p_at timestamptz default now()
)
returns numeric
language plpgsql
volatile
security definer set search_path = ''
as $$
declare
  v_set public.pricing_settings;
  v_factor numeric := private.demand_factor(p_city_id, p_vehicle_type);
begin
  select * into v_set from public.pricing_settings where id = 1;
  if private.night_applies(p_at) then
    v_factor := v_factor * (1 + v_set.night_surcharge);
  end if;
  return round(least(v_factor, v_set.max_factor), 2);
end;
$$;

revoke execute on function private.pricing_factor(bigint, public.vehicle_type, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Sem valor mínimo
-- ---------------------------------------------------------------------------

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
    round(v_fare.base + v_fare.per_km * v_km + v_fare.per_min * (v_km / 30 * 60), 2),
    v_km;
end;
$$;

-- A tela de cotação passa a usar o fator final (dinâmico + noturno + teto).
create or replace function public.quote_ride(
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
        v_factor := private.pricing_factor(p_city_id, v_type);
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

-- ---------------------------------------------------------------------------
-- Tarifas novas dentro da cidade (valem a partir de 02/11/2026)
-- ---------------------------------------------------------------------------

drop function private.fare_minimum(bigint, public.vehicle_type);
alter table public.fares drop column minimum;

insert into public.fares (city_id, vehicle_type, effective_from, base, per_km, per_min)
select c.id, v.vehicle_type::public.vehicle_type, date '2026-11-02', v.base, v.per_km, v.per_min
from public.cities c
cross join (values
  ('car', 8.00, 2.20, 0.30),
  ('moto', 5.00, 1.40, 0.20)
) as v (vehicle_type, base, per_km, per_min)
where c.name = 'Guaraciaba do Norte' and c.state = 'CE'
on conflict (city_id, vehicle_type, effective_from) do update
  set base = excluded.base, per_km = excluded.per_km, per_min = excluded.per_min;

-- ---------------------------------------------------------------------------
-- Painel: tarifa sem mínimo
-- ---------------------------------------------------------------------------

drop function public.staff_add_fare(bigint, public.vehicle_type, numeric, numeric, numeric, numeric, date);

create function public.staff_add_fare(
  p_city_id bigint,
  p_vehicle_type public.vehicle_type,
  p_base numeric,
  p_per_km numeric,
  p_per_min numeric,
  p_effective_from date
)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  perform private.require_staff();

  if p_base is null or p_per_km is null or p_per_min is null
     or p_base < 0 or p_per_km < 0 or p_per_min < 0
     or p_base > 500 or p_per_km > 500 or p_per_min > 500 then
    raise exception 'Confira os valores da tarifa (de 0 a 500)';
  end if;

  if p_effective_from is null then
    raise exception 'Diga a partir de que dia a tarifa vale';
  end if;

  insert into public.fares (city_id, vehicle_type, base, per_km, per_min, effective_from)
  values (p_city_id, p_vehicle_type, round(p_base, 2), round(p_per_km, 2), round(p_per_min, 2), p_effective_from)
  on conflict (city_id, vehicle_type, effective_from) do update
    set base = excluded.base, per_km = excluded.per_km, per_min = excluded.per_min;
end;
$$;

revoke execute on function public.staff_add_fare(bigint, public.vehicle_type, numeric, numeric, numeric, date) from public, anon;
grant execute on function public.staff_add_fare(bigint, public.vehicle_type, numeric, numeric, numeric, date) to authenticated;

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
        'base', f.base, 'per_km', f.per_km, 'per_min', f.per_min,
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

-- ---------------------------------------------------------------------------
-- Preço único por par de cidades, igual nos dois sentidos
-- ---------------------------------------------------------------------------

-- Espelha os preços que já existem e grava a tabela B de Guaraciaba.
insert into public.intercity_fares (origin_city_id, destination_city_id, vehicle_type, price)
select f.destination_city_id, f.origin_city_id, f.vehicle_type, f.price
from public.intercity_fares f
on conflict do nothing;

insert into public.intercity_fares (origin_city_id, destination_city_id, vehicle_type, price)
select a.id, b.id, v.vehicle_type::public.vehicle_type, v.price
from (values
  ('Ubajara', 'car', 90.00), ('Ubajara', 'moto', 55.00),
  ('Tianguá', 'car', 115.00), ('Tianguá', 'moto', 70.00)
) as v (other, vehicle_type, price)
join public.cities a on a.name = 'Guaraciaba do Norte' and a.state = 'CE'
join public.cities b on b.name = v.other and b.state = 'CE'
on conflict (origin_city_id, destination_city_id, vehicle_type) do update set price = excluded.price;

insert into public.intercity_fares (origin_city_id, destination_city_id, vehicle_type, price)
select b.id, a.id, v.vehicle_type::public.vehicle_type, v.price
from (values
  ('Ubajara', 'car', 90.00), ('Ubajara', 'moto', 55.00),
  ('Tianguá', 'car', 115.00), ('Tianguá', 'moto', 70.00)
) as v (other, vehicle_type, price)
join public.cities a on a.name = 'Guaraciaba do Norte' and a.state = 'CE'
join public.cities b on b.name = v.other and b.state = 'CE'
on conflict (origin_city_id, destination_city_id, vehicle_type) do update set price = excluded.price;

create or replace function public.staff_set_intercity_price(
  p_origin_city_id bigint,
  p_destination_city_id bigint,
  p_vehicle_type public.vehicle_type,
  p_price numeric
)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  perform private.require_staff();

  if p_price is null or p_price <= 0 or p_price > 5000 then
    raise exception 'O preço vai de R$ 0,01 a R$ 5.000,00';
  end if;
  if p_origin_city_id = p_destination_city_id then
    raise exception 'Escolha duas cidades diferentes';
  end if;

  -- Um preço só por par: grava a ida e a volta.
  insert into public.intercity_fares (origin_city_id, destination_city_id, vehicle_type, price)
  values (p_origin_city_id, p_destination_city_id, p_vehicle_type, round(p_price, 2)),
         (p_destination_city_id, p_origin_city_id, p_vehicle_type, round(p_price, 2))
  on conflict (origin_city_id, destination_city_id, vehicle_type) do update
    set price = excluded.price;
end;
$$;

create function public.staff_delete_intercity_pair(p_city_a bigint, p_city_b bigint)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  perform private.require_staff();

  delete from public.intercity_fares f
  where (f.origin_city_id = p_city_a and f.destination_city_id = p_city_b)
     or (f.origin_city_id = p_city_b and f.destination_city_id = p_city_a);
end;
$$;

revoke execute on function public.staff_delete_intercity_pair(bigint, bigint) from public, anon;
grant execute on function public.staff_delete_intercity_pair(bigint, bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- Painel: cidades
-- ---------------------------------------------------------------------------

create function public.staff_add_city(
  p_name text,
  p_state text,
  p_lat double precision,
  p_lng double precision
)
returns bigint
language plpgsql
security definer set search_path = ''
as $$
declare
  v_name text := trim(coalesce(p_name, ''));
  v_state text := upper(trim(coalesce(p_state, '')));
  v_id bigint;
begin
  perform private.require_staff();

  if length(v_name) < 2 or length(v_name) > 60 then
    raise exception 'O nome da cidade tem de 2 a 60 letras';
  end if;
  if v_state !~ '^[A-Z]{2}$' then
    raise exception 'O estado são 2 letras, como CE';
  end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'Confira a latitude e a longitude da cidade';
  end if;

  insert into public.cities (name, state, active, center)
  values (v_name, v_state, false, private.point(p_lng, p_lat))
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'Essa cidade já existe';
end;
$$;

revoke execute on function public.staff_add_city(text, text, double precision, double precision) from public, anon;
grant execute on function public.staff_add_city(text, text, double precision, double precision) to authenticated;

create function public.staff_set_city_active(p_city_id bigint, p_active boolean)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  perform private.require_staff();

  if not exists (select 1 from public.cities c where c.id = p_city_id) then
    raise exception 'Cidade não encontrada';
  end if;

  if p_active and not exists (
    select 1 from public.fares f where f.city_id = p_city_id and f.effective_from <= current_date
  ) then
    raise exception 'Cadastre uma tarifa para essa cidade antes de ativar';
  end if;

  update public.cities set active = p_active where id = p_city_id;
end;
$$;

revoke execute on function public.staff_set_city_active(bigint, boolean) from public, anon;
grant execute on function public.staff_set_city_active(bigint, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Painel: noturno e teto nas configurações de preço
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
      night_surcharge = coalesce((p_patch ->> 'night_surcharge')::numeric, s.night_surcharge),
      night_from = coalesce((p_patch ->> 'night_from')::smallint, s.night_from),
      night_until = coalesce((p_patch ->> 'night_until')::smallint, s.night_until),
      max_factor = coalesce((p_patch ->> 'max_factor')::numeric, s.max_factor),
      updated_at = now()
  where s.id = 1;
exception
  when check_violation then
    raise exception 'Um dos valores está fora do limite permitido';
end;
$$;
