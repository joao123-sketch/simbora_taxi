-- Etapa 5: despacho em ondas, avaliações, notas por motorista e histórico.
--
-- Cada pedido vira uma fila de ofertas, do motorista mais próximo ao mais
-- longe. Todos recebem o pedido, mas cada um passa a vê-lo alguns segundos
-- depois do anterior; quem recusa libera o próximo na hora. Não precisa de
-- agendador no servidor: a visibilidade é decidida pela hora marcada na oferta.

create type public.offer_status as enum ('pending', 'accepted', 'declined', 'missed');

create table public.ride_offers (
  id bigint generated always as identity primary key,
  ride_id bigint not null references public.rides (id) on delete cascade,
  driver_id uuid not null references public.drivers (id) on delete cascade,
  rank int not null,
  visible_from timestamptz not null,
  status public.offer_status not null default 'pending',
  created_at timestamptz not null default now(),
  unique (ride_id, driver_id)
);

create index ride_offers_driver_idx on public.ride_offers (driver_id, status);

-- O app nunca lê as ofertas direto: vê os pedidos pelas regras de `rides`.
alter table public.ride_offers enable row level security;
revoke all on public.ride_offers from anon, authenticated;

-- Quem cancelou, para a taxa de cancelamento do motorista.
alter table public.rides add column cancelled_by uuid references public.profiles (id);

-- Segundos entre um motorista e o próximo da fila.
create function private.wave_seconds()
returns int
language sql
immutable
as $$
  select 15;
$$;

-- Monta a fila de um pedido: motoristas online, livres, do veículo pedido e que
-- aceitam a forma de pagamento, do mais perto ao mais longe. Quem está sem
-- localização recente vai para o fim. Pode ser chamada de novo: só entram na
-- fila os motoristas que ainda não receberam o pedido, atrás dos que já estão.
create function private.dispatch_ride(p_ride_id bigint)
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
      case when l.updated_at > now() - interval '15 minutes'
           then extensions.st_distance(l.position, r.origin)
      end as dist
    from public.rides r
    join public.drivers d on d.city_id = r.city_id and d.vehicle_type = r.vehicle_type
    left join public.driver_locations l on l.driver_id = d.id
    where r.id = p_ride_id
      and r.status = 'requested'
      and d.status = 'approved'
      and d.is_online
      and r.payment_method = any (d.accepted_payments)
      and d.id <> r.passenger_id
      and not exists (
        select 1 from public.rides a
        where a.driver_id = d.id and a.status in ('accepted', 'arrived', 'in_progress')
      )
      and not exists (
        select 1 from public.ride_offers o where o.ride_id = r.id and o.driver_id = d.id
      )
  ),
  ranked as (
    select c.driver_id, row_number() over (order by c.dist nulls last, c.joined_at, c.driver_id) as rk
    from candidates c
  )
  insert into public.ride_offers (ride_id, driver_id, rank, visible_from)
  select p_ride_id, k.driver_id, v_base_rank + k.rk::int, v_first_visible + (k.rk - 1) * v_wave
  from ranked k;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- O motorista logado está vendo este pedido agora: a vez dele na fila chegou,
-- ele ainda aceita a forma de pagamento, não está em outra corrida e o pedido
-- continua aberto.
create function private.can_see_offer(p_ride_id bigint)
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
      and d.vehicle_type = r.vehicle_type
      and r.payment_method = any (d.accepted_payments)
      and not exists (
        select 1 from public.rides a
        where a.driver_id = d.id and a.status in ('accepted', 'arrived', 'in_progress')
      )
  );
$$;

revoke execute on function private.wave_seconds() from public, anon, authenticated;
revoke execute on function private.dispatch_ride(bigint) from public, anon, authenticated;
revoke execute on function private.can_see_offer(bigint) from public, anon;
grant execute on function private.can_see_offer(bigint) to authenticated;

-- O pedido aberto só aparece para o motorista a quem chegou a vez.
drop policy "motorista online vê chamados abertos" on public.rides;
create policy "motorista online vê chamados abertos" on public.rides
  for select to authenticated using (
    status = 'requested' and private.can_see_offer(id)
  );

-- Quem entrou depois (ficou online, passou a aceitar a forma de pagamento) pega
-- os pedidos que ainda estão abertos, no fim da fila. O app chama isto a cada consulta.
create function public.claim_open_requests()
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

-- Aceitar: só quem está vendo o pedido, e as outras ofertas deixam de valer.
create or replace function public.accept_ride(p_ride_id bigint)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not private.can_see_offer(p_ride_id) then
    raise exception 'Corrida indisponível';
  end if;

  update public.rides r
  set driver_id = auth.uid(), status = 'accepted', accepted_at = now()
  where r.id = p_ride_id and r.status = 'requested';

  if not found then
    raise exception 'Corrida indisponível';
  end if;

  update public.ride_offers
  set status = case when driver_id = auth.uid() then 'accepted'::public.offer_status else 'missed'::public.offer_status end
  where ride_id = p_ride_id and status = 'pending';
end;
$$;

-- Recusar: some do app do motorista e o próximo da fila não precisa esperar.
create function public.decline_ride(p_ride_id bigint)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not private.can_see_offer(p_ride_id) then
    raise exception 'Esse pedido não está mais disponível';
  end if;

  update public.ride_offers
  set status = 'declined'
  where ride_id = p_ride_id and driver_id = auth.uid() and status = 'pending';

  update public.ride_offers
  set visible_from = now()
  where id = (
    select o.id from public.ride_offers o
    where o.ride_id = p_ride_id and o.status = 'pending' and o.visible_from > now()
    order by o.rank
    limit 1
  );

  -- Se ele tinha proposto um acréscimo, a proposta cai junto.
  update public.ride_proposals
  set status = 'withdrawn'
  where ride_id = p_ride_id and driver_id = auth.uid() and status = 'pending';
end;
$$;

revoke execute on function public.claim_open_requests() from public, anon;
revoke execute on function public.decline_ride(bigint) from public, anon;
grant execute on function public.claim_open_requests() to authenticated;
grant execute on function public.decline_ride(bigint) to authenticated;

-- Cancelar guarda quem cancelou.
create or replace function public.cancel_ride(p_ride_id bigint)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  update public.rides
  set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid()
  where id = p_ride_id
    and (passenger_id = auth.uid() or driver_id = auth.uid())
    and status in ('requested', 'accepted', 'arrived');

  if not found then
    raise exception 'Corrida não pode ser cancelada';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Pedido, proposta e aceite de proposta passam a respeitar a fila
-- ---------------------------------------------------------------------------

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

  select q.price, q.distance_km into v_price, v_km
  from private.ride_quote(p_city_id, p_vehicle_type, v_origin, v_destination, p_destination_city_id) q;

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
    v_km, v_price
  )
  returning id into v_ride_id;

  -- Quem recebe o pedido, e quando, é decidido aqui (despacho em ondas).
  perform private.dispatch_ride(v_ride_id);

  return v_ride_id;
end;
$$;

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
  where r.id = p_ride_id and r.status = 'requested' and r.destination_place is not null;

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

create or replace function public.respond_proposal(p_proposal_id bigint, p_accept boolean)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_prop public.ride_proposals;
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

  if not exists (
    select 1 from public.drivers d
    where d.id = v_prop.driver_id and d.status = 'approved' and d.is_online
      and not exists (
        select 1 from public.rides a
        where a.driver_id = d.id and a.status in ('accepted', 'arrived', 'in_progress')
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
      estimated_price = estimated_price + v_prop.extra_amount
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

drop function private.driver_can_serve(public.vehicle_type, public.payment_method);

-- ---------------------------------------------------------------------------
-- Avaliação: passageiro avalia o motorista e o motorista avalia o passageiro
-- ---------------------------------------------------------------------------

-- rides.driver_rating é a nota que o passageiro deu ao motorista;
-- rides.passenger_rating é a nota que o motorista deu ao passageiro.
create function public.rate_ride(p_ride_id bigint, p_stars int)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_ride public.rides;
begin
  if p_stars is null or p_stars < 1 or p_stars > 5 then
    raise exception 'A nota vai de 1 a 5 estrelas';
  end if;

  select * into v_ride from public.rides r where r.id = p_ride_id and r.status = 'completed';
  if not found then
    raise exception 'Só dá para avaliar uma corrida concluída';
  end if;

  if v_ride.passenger_id = auth.uid() then
    update public.rides set driver_rating = p_stars where id = p_ride_id and driver_rating is null;
  elsif v_ride.driver_id = auth.uid() then
    update public.rides set passenger_rating = p_stars where id = p_ride_id and passenger_rating is null;
  else
    raise exception 'Corrida não encontrada';
  end if;

  if not found then
    raise exception 'Você já avaliou essa corrida';
  end if;
end;
$$;

revoke execute on function public.rate_ride(bigint, int) from public, anon;
grant execute on function public.rate_ride(bigint, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Nota de prioridade do motorista (calculada, ainda não usada no despacho)
-- ---------------------------------------------------------------------------

-- Nota ajustada: com poucas avaliações ela puxa para 4,5, para não oscilar.
create function private.adjusted_rating(p_count int, p_avg numeric)
returns numeric
language sql
immutable
as $$
  select (coalesce(p_count, 0) * coalesce(p_avg, 0) + 10 * 4.5) / (coalesce(p_count, 0) + 10);
$$;

-- 0 a 100: 60% nota ajustada, 20% aceite, 20% sem cancelamento. Quem tem menos
-- de 20 corridas fica neutro (nulo). Os pesos são ponto de partida: valem
-- depois dos primeiros 30 dias de dados reais.
create function private.driver_score(
  p_completed int,
  p_rating_count int,
  p_rating_avg numeric,
  p_accepted int,
  p_declined int,
  p_cancelled int
)
returns numeric
language sql
immutable
as $$
  select case
    when coalesce(p_completed, 0) < 20 then null
    else round(
      100 * (
        0.6 * (private.adjusted_rating(p_rating_count, p_rating_avg) - 1) / 4
        + 0.2 * coalesce(p_accepted::numeric / nullif(p_accepted + p_declined, 0), 1)
        + 0.2 * (1 - coalesce(p_cancelled::numeric / nullif(p_completed + p_cancelled, 0), 0))
      ),
      1
    )
  end;
$$;

-- Confere a conta na hora de aplicar a migration.
do $$
begin
  if private.adjusted_rating(0, null) <> 4.5
     or private.adjusted_rating(10, 5.0) <> 4.75 then
    raise exception 'Nota ajustada errada';
  end if;
  if private.driver_score(19, 10, 5.0, 8, 2, 0) is not null then
    raise exception 'Motorista novo deveria ficar neutro';
  end if;
  if private.driver_score(20, 10, 5.0, 8, 2, 0) <> 92.3 then
    raise exception 'Nota de prioridade errada (caso 1)';
  end if;
  if private.driver_score(20, 0, null, 0, 0, 0) <> 92.5 then
    raise exception 'Nota de prioridade errada (caso sem avaliações)';
  end if;
end;
$$;

revoke execute on function private.adjusted_rating(int, numeric) from public, anon, authenticated;
revoke execute on function private.driver_score(int, int, numeric, int, int, int) from public, anon, authenticated;

-- Só a equipe lê (painel do Supabase). Só contam corridas feitas pelo app.
create view public.driver_stats
with (security_invoker = true)
as
with base as (
  select
    d.id as driver_id,
    d.vehicle_plate,
    (select count(*) from public.rides r where r.driver_id = d.id and r.status = 'completed') as completed_rides,
    (select count(*) from public.rides r
       where r.driver_id = d.id and r.status = 'cancelled' and r.cancelled_by = d.id) as cancelled_by_driver,
    (select count(r.driver_rating) from public.rides r where r.driver_id = d.id) as rating_count,
    (select avg(r.driver_rating) from public.rides r where r.driver_id = d.id) as rating_avg,
    (select count(*) from public.ride_offers o where o.driver_id = d.id and o.status = 'accepted') as offers_accepted,
    (select count(*) from public.ride_offers o where o.driver_id = d.id and o.status = 'declined') as offers_declined
  from public.drivers d
)
select
  b.driver_id,
  b.vehicle_plate,
  b.completed_rides,
  b.rating_count,
  round(b.rating_avg, 2) as rating_avg,
  round(private.adjusted_rating(b.rating_count::int, b.rating_avg), 2) as adjusted_rating,
  round(b.offers_accepted::numeric / nullif(b.offers_accepted + b.offers_declined, 0), 3) as accept_rate,
  round(b.cancelled_by_driver::numeric / nullif(b.completed_rides + b.cancelled_by_driver, 0), 3) as cancel_rate,
  (b.completed_rides < 20) as is_new,
  private.driver_score(
    b.completed_rides::int, b.rating_count::int, b.rating_avg,
    b.offers_accepted::int, b.offers_declined::int, b.cancelled_by_driver::int
  ) as score
from base b
order by b.completed_rides desc;

revoke all on public.driver_stats from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Histórico: a view ganha as datas e a nota que o próprio usuário deu
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
  r.final_price,
  r.requested_at,
  r.completed_at,
  r.cancelled_at,
  case when r.passenger_id = (select auth.uid()) then r.driver_rating else r.passenger_rating end as my_rating,
  p.full_name as passenger_name,
  dp.full_name as driver_name,
  d.vehicle_model,
  d.vehicle_color,
  d.vehicle_plate
from public.rides r
left join public.profiles p on p.id = r.passenger_id
left join public.drivers d on d.id = r.driver_id
left join public.profiles dp on dp.id = r.driver_id;
