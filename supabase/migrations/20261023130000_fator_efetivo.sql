-- O fator mostrado ao passageiro é o que realmente mudou o preço: quando o
-- desconto bate no valor mínimo da tarifa, o preço fica igual e o fator volta a 1.

create or replace function public.quote_ride(
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
  v_applied numeric;
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
        v_applied := 1.00;
      else
        v_price := greatest(private.fare_minimum(p_city_id, v_type), round(v_base * v_factor, 2));
        v_applied := round(v_price / v_base, 2);
      end if;

      insert into public.price_quotes (
        passenger_id, city_id, destination_city_id, vehicle_type,
        origin, destination, price, factor, distance_km
      )
      values (
        auth.uid(), p_city_id, p_destination_city_id, v_type,
        v_origin, v_destination, v_price, v_applied, v_km
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
