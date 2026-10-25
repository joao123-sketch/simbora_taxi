-- Viagens agendadas entre cidades.
--
-- Quem vai para outra cidade pode marcar dia e horário (de 1 hora a 7 dias para a
-- frente). O pedido fica numa lista de viagens agendadas, que os motoristas da
-- cidade e do veículo veem mesmo offline. O motorista aceita (já escolhendo o
-- adiantamento) ou propõe um acréscimo, e a viagem fica agendada para os dois.
--
-- Uma viagem agendada para daqui a mais de 1 hora NÃO conta como "corrida em
-- andamento": o motorista segue livre para outras corridas e o passageiro para
-- outros pedidos. Dentro de 1 hora da hora marcada ela passa a ser uma corrida
-- normal (cheguei, iniciar, finalizar). O motorista pode desistir antes disso
-- (a viagem volta para a lista) e o passageiro pode cancelar.

alter table public.rides add column scheduled_for timestamptz;

alter table public.rides
  add constraint rides_scheduled_intercity check (
    scheduled_for is null
    or (destination_city_id is not null and destination_city_id <> city_id)
  );

create index rides_scheduled_idx on public.rides (scheduled_for)
  where scheduled_for is not null and status in ('requested', 'accepted');

-- A corrida vale como "em andamento" quando não é agendada ou está a menos de 1 hora da hora marcada.
create function private.ride_is_live(p_scheduled timestamptz)
returns boolean
language sql
stable
as $$
  select p_scheduled is null or p_scheduled <= now() + interval '1 hour';
$$;

revoke execute on function private.ride_is_live(timestamptz) from public, anon, authenticated;

-- O motorista já tem outra viagem agendada a menos de 2 horas dessa?
create function private.scheduled_conflict(p_driver uuid, p_when timestamptz)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.rides r
    where r.driver_id = p_driver
      and r.status = 'accepted'
      and r.scheduled_for is not null
      and abs(extract(epoch from (r.scheduled_for - p_when))) < 7200
  );
$$;

revoke execute on function private.scheduled_conflict(uuid, timestamptz) from public, anon, authenticated;

-- Esse motorista pode pegar essa viagem agendada? Aprovado, da cidade e do veículo
-- pedido, aceita a forma de pagamento, mensalidade em dia e sem outra viagem na mesma hora.
create function private.can_take_scheduled(p_ride public.rides, p_driver uuid)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select p_ride.scheduled_for is not null
    and p_ride.status = 'requested'
    and p_ride.scheduled_for > now()
    and p_ride.passenger_id <> p_driver
    and exists (
      select 1 from public.drivers d
      where d.id = p_driver
        and d.status = 'approved'
        and d.city_id = p_ride.city_id
        and d.vehicle_type = p_ride.vehicle_type
        and p_ride.payment_method = any (d.accepted_payments)
    )
    and private.fee_ok(p_driver)
    and not private.scheduled_conflict(p_driver, p_ride.scheduled_for);
$$;

revoke execute on function private.can_take_scheduled(public.rides, uuid) from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- Funções que já existiam, ajustadas para a viagem agendada
-- ---------------------------------------------------------------------------

create or replace function private.dispatch_ride(p_ride_id bigint)
returns int
language plpgsql
security definer set search_path = ''
as $$
declare
  v_wave interval := make_interval(secs => private.wave_seconds());
  v_base_rank int;
  v_first_visible timestamptz;
  v_count int;
begin
  select coalesce(max(o.rank), 0),
         case when count(*) = 0 then now() else greatest(now(), max(o.visible_from) + v_wave) end
  into v_base_rank, v_first_visible
  from public.ride_offers o
  where o.ride_id = p_ride_id;

  with candidates as (
    select
      d.id as driver_id,
      d.created_at as joined_at,
      (f.driver_id is not null) as is_favorite,
      case when l.updated_at > now() - interval '15 minutes'
           then extensions.st_distance(l.position, r.origin)
      end as dist
    from public.rides r
    join public.drivers d on d.city_id = r.city_id and d.vehicle_type = r.vehicle_type
    left join public.driver_locations l on l.driver_id = d.id
    left join public.favorite_drivers f on f.passenger_id = r.passenger_id and f.driver_id = d.id
    where r.id = p_ride_id
      and r.status = 'requested'
      and r.scheduled_for is null
      and d.status = 'approved'
      and d.is_online
      and private.fee_ok(d.id)
      and r.payment_method = any (d.accepted_payments)
      and d.id <> r.passenger_id
      and not exists (
        select 1 from public.rides a
        where a.driver_id = d.id and a.status in ('accepted', 'arrived', 'in_progress')
          and private.ride_is_live(a.scheduled_for)
      )
      and not exists (
        select 1 from public.ride_offers o where o.ride_id = r.id and o.driver_id = d.id
      )
  ),
  ranked as (
    select c.driver_id,
           row_number() over (order by c.is_favorite desc, c.dist nulls last, c.joined_at, c.driver_id) as rk
    from candidates c
  )
  insert into public.ride_offers (ride_id, driver_id, rank, visible_from)
  select p_ride_id, k.driver_id, v_base_rank + k.rk::int, v_first_visible + (k.rk - 1) * v_wave
  from ranked k;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function private.can_see_offer(p_ride_id bigint)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.ride_offers o
    join public.rides r on r.id = o.ride_id
    join public.drivers d on d.id = o.driver_id
    where o.ride_id = p_ride_id
      and o.driver_id = (select auth.uid())
      and o.status = 'pending'
      and o.visible_from <= now()
      and r.status = 'requested'
      and r.passenger_id <> d.id
      and d.status = 'approved'
      and d.is_online
      and private.fee_ok(d.id)
      and d.vehicle_type = r.vehicle_type
      and r.payment_method = any (d.accepted_payments)
      and not exists (
        select 1 from public.rides a
        where a.driver_id = d.id and a.status in ('accepted', 'arrived', 'in_progress')
          and private.ride_is_live(a.scheduled_for)
      )
  );
$$;

create or replace function public.set_driver_online(p_online boolean)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not p_online and exists (
    select 1 from public.rides r
    where r.driver_id = auth.uid() and r.status in ('accepted', 'arrived', 'in_progress')
      and private.ride_is_live(r.scheduled_for)
  ) then
    raise exception 'Termine a corrida antes de ficar offline';
  end if;

  if p_online and not private.fee_ok(auth.uid()) then
    raise exception 'A sua mensalidade está em atraso. Regularize para voltar a receber pedidos.';
  end if;

  update public.drivers
  set is_online = p_online
  where id = auth.uid() and status = 'approved';

  if not found then
    raise exception 'Motorista não aprovado';
  end if;

  if p_online then
    insert into public.driver_online_sessions (driver_id)
    values (auth.uid())
    on conflict (driver_id) where ended_at is null do nothing;
  else
    update public.driver_online_sessions
    set ended_at = now()
    where driver_id = auth.uid() and ended_at is null;
  end if;
end;
$$;

create or replace function public.claim_open_requests()
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select ride.id
    from public.rides ride
    join public.drivers d on d.id = auth.uid()
    where ride.status = 'requested'
      and ride.scheduled_for is null
      and ride.city_id = d.city_id
      and ride.vehicle_type = d.vehicle_type
      and ride.passenger_id <> d.id
      and d.status = 'approved'
      and d.is_online
  loop
    perform private.dispatch_ride(r.id);
  end loop;
end;
$$;

create or replace function private.demand_factor(p_city_id bigint, p_vehicle_type public.vehicle_type)
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
    and r.scheduled_for is null
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

drop function public.request_ride(
  bigint, public.vehicle_type, public.payment_method,
  double precision, double precision, text,
  double precision, double precision, text, uuid, bigint, text, boolean, int
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
  p_wait_minutes int default 0,
  p_scheduled_for timestamptz default null
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

  -- Agendar: só viagem para outra cidade, de 1 hora a 7 dias para a frente.
  if p_scheduled_for is not null then
    if not v_intercity then
      raise exception 'Só dá para agendar viagem para outra cidade';
    end if;
    if p_scheduled_for < now() + interval '1 hour' then
      raise exception 'Agende para daqui a pelo menos 1 hora';
    end if;
    if p_scheduled_for > now() + interval '7 days' then
      raise exception 'Dá para agendar até 7 dias à frente';
    end if;
    if (select count(*) from public.rides s
        where s.passenger_id = auth.uid() and s.scheduled_for is not null
          and s.status in ('requested', 'accepted') and s.scheduled_for > now()) >= 5 then
      raise exception 'Você já tem 5 viagens agendadas. Cancele alguma para agendar outra.';
    end if;
  end if;

  if exists (
    select 1 from public.rides r
    where r.passenger_id = auth.uid()
      and r.status in ('requested', 'accepted', 'arrived', 'in_progress')
      and private.ride_is_live(r.scheduled_for)
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
    distance_km, estimated_price, round_trip, wait_minutes, scheduled_for
  )
  values (
    auth.uid(), p_city_id, p_destination_city_id, p_vehicle_type, p_payment_method,
    v_origin, p_origin_address, v_destination, p_destination_address, v_place,
    v_quote.distance_km, v_price, coalesce(p_round_trip, false), v_wait, p_scheduled_for
  )
  returning id into v_ride_id;

  insert into public.ride_pricing (ride_id, factor) values (v_ride_id, v_quote.factor);

  -- A cotação foi usada: não serve para um segundo pedido.
  delete from public.price_quotes q where q.passenger_id = auth.uid();

  -- Quem recebe o pedido, e quando, é decidido aqui (despacho em ondas). Viagem
  -- agendada não entra em onda: os motoristas veem na lista de viagens agendadas.
  if p_scheduled_for is null then
    perform private.dispatch_ride(v_ride_id);
  end if;

  return v_ride_id;
end;
$$;

revoke execute on function public.request_ride(
  bigint, public.vehicle_type, public.payment_method,
  double precision, double precision, text,
  double precision, double precision, text, uuid, bigint, text, boolean, int, timestamptz
) from public, anon;
grant execute on function public.request_ride(
  bigint, public.vehicle_type, public.payment_method,
  double precision, double precision, text,
  double precision, double precision, text, uuid, bigint, text, boolean, int, timestamptz
) to authenticated;

create or replace function public.request_delivery(
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
      and private.ride_is_live(r.scheduled_for)
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

  if not private.ride_is_live(v_ride.scheduled_for) then
    raise exception 'Ainda não é a hora da viagem agendada';
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

create or replace function public.propose_extra(p_ride_id bigint, p_extra numeric, p_advance_percent int default null)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_ride public.rides;
  v_extra numeric := round(p_extra, 2);
begin
  if p_advance_percent is not null and p_advance_percent not in (0, 50, 100) then
    raise exception 'Escolha 0%%, 50%% ou 100%%';
  end if;

  select * into v_ride
  from public.rides r
  where r.id = p_ride_id and r.status = 'requested'
    and (r.destination_place is not null or r.round_trip or r.scheduled_for is not null);

  if not found then
    raise exception 'Esse pedido não está mais aberto';
  end if;

  if v_ride.passenger_id = auth.uid() then
    raise exception 'Você não pode atender o seu próprio pedido';
  end if;

  -- Só propõe quem já está vendo o pedido (a vez dele na fila já chegou).
  if not (private.can_see_offer(p_ride_id) or private.can_take_scheduled(v_ride, auth.uid())) then
    raise exception 'Você não pode atender esse pedido';
  end if;

  if v_extra is null or v_extra <= 0 or v_extra > 500 then
    raise exception 'O acréscimo vai de R$ 0,01 a R$ 500,00';
  end if;

  insert into public.ride_proposals as rp (ride_id, driver_id, extra_amount, advance_percent)
  values (p_ride_id, auth.uid(), v_extra, p_advance_percent)
  on conflict (ride_id, driver_id) do update
    set extra_amount = excluded.extra_amount,
        advance_percent = excluded.advance_percent,
        status = 'pending',
        created_at = now()
    where rp.status in ('pending', 'withdrawn');

  if not found then
    raise exception 'O passageiro já recusou a sua proposta';
  end if;
end;
$$;

create or replace function public.respond_proposal(p_proposal_id bigint, p_accept boolean)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_prop public.ride_proposals;
  v_ride_row public.rides;
begin
  select * into v_prop from public.ride_proposals p where p.id = p_proposal_id for update;

  if not found or not private.is_ride_passenger(v_prop.ride_id) then
    raise exception 'Proposta não encontrada';
  end if;

  if v_prop.status <> 'pending' then
    raise exception 'Essa proposta não está mais valendo';
  end if;

  if not p_accept then
    update public.ride_proposals set status = 'declined' where id = p_proposal_id;
    return;
  end if;

  select * into v_ride_row from public.rides r where r.id = v_prop.ride_id;

  -- Viagem agendada: o motorista não precisa estar online, só poder fazer a viagem.
  if v_ride_row.scheduled_for is not null then
    if not private.can_take_scheduled(v_ride_row, v_prop.driver_id) then
      update public.ride_proposals set status = 'withdrawn' where id = p_proposal_id;
      raise exception 'O motorista não está mais disponível';
    end if;
  elsif not exists (
    select 1 from public.drivers d
    where d.id = v_prop.driver_id and d.status = 'approved' and d.is_online
      and not exists (
        select 1 from public.rides a
        where a.driver_id = d.id and a.status in ('accepted', 'arrived', 'in_progress')
        and private.ride_is_live(a.scheduled_for)
      )
  ) then
    update public.ride_proposals set status = 'withdrawn' where id = p_proposal_id;
    raise exception 'O motorista não está mais disponível';
  end if;

  update public.rides
  set driver_id = v_prop.driver_id,
      status = 'accepted',
      accepted_at = now(),
      extra_amount = v_prop.extra_amount,
      estimated_price = estimated_price + v_prop.extra_amount,
      advance_percent = coalesce(v_prop.advance_percent, advance_percent)
  where id = v_prop.ride_id and status = 'requested' and passenger_id = auth.uid();

  if not found then
    raise exception 'Esse pedido não está mais aberto';
  end if;

  update public.ride_proposals
  set status = case when id = p_proposal_id then 'accepted'::public.proposal_status else 'declined'::public.proposal_status end
  where ride_id = v_prop.ride_id and status = 'pending';

  update public.ride_offers
  set status = case when driver_id = v_prop.driver_id then 'accepted'::public.offer_status else 'missed'::public.offer_status end
  where ride_id = v_prop.ride_id and status = 'pending';
end;
$$;

create or replace function private.has_active_ride_with_driver(p_driver uuid)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.rides r
    where r.driver_id = p_driver
      and r.passenger_id = (select auth.uid())
      and r.status in ('accepted', 'arrived', 'in_progress')
      and private.ride_is_live(r.scheduled_for)
  );
$$;

create or replace function public.update_passenger_location(p_lng double precision, p_lat double precision)
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
      and private.ride_is_live(r.scheduled_for)
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

create or replace function public.get_passenger_position(p_ride_id bigint)
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
    and private.ride_is_live(r.scheduled_for)
    and l.updated_at > now() - interval '5 minutes';
$$;


-- ---------------------------------------------------------------------------
-- A view de corridas traz o horário
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
-- Lista, aceite, desistência e vencimento das viagens agendadas
-- ---------------------------------------------------------------------------

-- Quem desistiu de uma viagem agendada (só para a equipe consultar depois).
create table public.ride_driver_releases (
  id bigint generated always as identity primary key,
  ride_id bigint not null references public.rides (id) on delete cascade,
  driver_id uuid not null references public.drivers (id) on delete cascade,
  released_at timestamptz not null default now()
);

alter table public.ride_driver_releases enable row level security;
revoke all on public.ride_driver_releases from anon, authenticated;

-- Pedido agendado que ninguém aceitou até 15 minutos depois da hora marcada vence.
create function public.expire_scheduled_rides()
returns int
language plpgsql
security definer set search_path = ''
as $$
declare
  v_count int;
begin
  update public.rides
  set status = 'cancelled', cancelled_at = now()
  where scheduled_for is not null
    and status = 'requested'
    and scheduled_for < now() - interval '15 minutes';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- As viagens agendadas que o motorista logado pode pegar, da mais próxima à mais
-- longe. Aparecem mesmo com o motorista offline.
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
  passenger_first_name text,
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
    split_part(coalesce(p.full_name, ''), ' ', 1),
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

-- Aceitar pelo valor, já com o adiantamento (0%, 50% ou 100%).
create function public.accept_scheduled_ride(p_ride_id bigint, p_advance_percent int)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_ride public.rides;
begin
  if p_advance_percent is null or p_advance_percent not in (0, 50, 100) then
    raise exception 'Escolha 0%%, 50%% ou 100%%';
  end if;

  select * into v_ride from public.rides r
  where r.id = p_ride_id and r.status = 'requested' and r.scheduled_for is not null
  for update;

  if not found or not private.can_take_scheduled(v_ride, auth.uid()) then
    raise exception 'Viagem indisponível';
  end if;

  update public.rides
  set driver_id = auth.uid(),
      status = 'accepted',
      accepted_at = now(),
      advance_percent = p_advance_percent
  where id = p_ride_id and status = 'requested';

  -- As outras propostas deixam de valer; a deste motorista (se houver) é retirada.
  update public.ride_proposals
  set status = case when driver_id = auth.uid() then 'withdrawn'::public.proposal_status
                    else 'declined'::public.proposal_status end
  where ride_id = p_ride_id and status = 'pending';
end;
$$;

-- O motorista desiste: a viagem volta para a lista, no valor original.
create function public.release_scheduled_ride(p_ride_id bigint)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_ride public.rides;
begin
  select * into v_ride from public.rides r
  where r.id = p_ride_id
    and r.driver_id = auth.uid()
    and r.status = 'accepted'
    and r.scheduled_for is not null
    and r.scheduled_for > now()
  for update;

  if not found then
    raise exception 'Não dá para desistir dessa viagem';
  end if;

  if v_ride.advance_received_at is not null then
    raise exception 'Você já recebeu adiantamento dessa viagem. Fale com o suporte para desistir.';
  end if;

  update public.rides
  set driver_id = null,
      status = 'requested',
      accepted_at = null,
      advance_percent = null,
      advance_received_at = null,
      estimated_price = estimated_price - coalesce(extra_amount, 0),
      extra_amount = 0
  where id = p_ride_id;

  update public.ride_proposals set status = 'withdrawn'
  where ride_id = p_ride_id and status = 'accepted';

  insert into public.ride_driver_releases (ride_id, driver_id) values (p_ride_id, auth.uid());
end;
$$;

revoke execute on function public.expire_scheduled_rides() from public, anon;
revoke execute on function public.open_scheduled_rides() from public, anon;
revoke execute on function public.accept_scheduled_ride(bigint, int) from public, anon;
revoke execute on function public.release_scheduled_ride(bigint) from public, anon;
grant execute on function public.expire_scheduled_rides() to authenticated;
grant execute on function public.open_scheduled_rides() to authenticated;
grant execute on function public.accept_scheduled_ride(bigint, int) to authenticated;
grant execute on function public.release_scheduled_ride(bigint) to authenticated;
