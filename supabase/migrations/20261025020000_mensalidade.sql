-- Etapa 10: cobrança da mensalidade do motorista.
--
-- O motorista paga o mês antes de ele começar (vence no primeiro dia), por Pix,
-- e manda o comprovante pelo app. A equipe confere e confirma o pagamento no
-- painel. A cobrança no app começa no primeiro dia de atraso (e é insistente);
-- o bloqueio só vem depois de 5 dias de tolerância: aí o motorista deixa de
-- receber pedidos até regularizar. Sem devolução proporcional se ele sair no
-- meio do mês.

-- Dados do Pix da empresa, editáveis no painel (o app monta o QR com o valor do
-- mês). Uma linha só. Os limites são os do padrão do Pix (BR Code).
create table public.pix_settings (
  id smallint primary key default 1 check (id = 1),
  pix_key text check (char_length(pix_key) between 3 and 77),
  receiver_name text check (char_length(receiver_name) between 2 and 25),
  receiver_city text check (char_length(receiver_city) between 2 and 15),
  description text not null default 'Simbora car' check (char_length(description) between 1 and 25),
  updated_at timestamptz not null default now()
);

insert into public.pix_settings default values;

alter table public.pix_settings enable row level security;
revoke all on public.pix_settings from anon, authenticated;

-- Quando o motorista diz que pagou e o comprovante que anexou.
alter table public.driver_fee_periods
  add column claimed_at timestamptz,
  add column receipt_path text;

create function private.fee_grace_days()
returns int
language sql
immutable
as $$
  select 5;
$$;

revoke execute on function private.fee_grace_days() from public, anon, authenticated;

-- Como está a mensalidade de um motorista agora:
--   ok ......... nada a pagar (mês grátis ou mês pago ainda valendo)
--   pending .... mês aberto, no prazo (até o dia do vencimento, inclusive)
--   due ........ já passou do vencimento: a cobrança no app começa, mas ele
--                ainda recebe pedidos durante os 5 dias de tolerância
--   overdue .... passou da tolerância: o motorista não recebe pedidos
-- Quando o mês acabou e ele ainda não renovou, `needs_renewal` fica true e o
-- vencimento é o fim do mês que acabou.
create function private.fee_state(p_driver uuid)
returns table (
  state text,
  due_on date,
  days_late int,
  period_id bigint,
  kind public.fee_kind,
  amount numeric,
  period_start date,
  period_end date,
  needs_renewal boolean
)
language plpgsql
stable
security definer set search_path = ''
as $$
declare
  v_last public.driver_fee_periods;
  v_vehicle public.vehicle_type;
  v_had_free boolean;
  v_paid int;
  v_due date;
  v_renew boolean := false;
  v_kind public.fee_kind;
  v_amount numeric;
  v_late int;
begin
  select * into v_last
  from public.driver_fee_periods p
  where p.driver_id = p_driver
  order by p.period_start desc
  limit 1;

  -- Sem assinatura ainda (não aprovado): nada a cobrar.
  if not found then
    return query select 'ok', null::date, 0, null::bigint, null::public.fee_kind, null::numeric,
      null::date, null::date, false;
    return;
  end if;

  if v_last.status = 'open' then
    v_due := v_last.due_on;
    v_kind := v_last.kind;
    v_amount := v_last.amount;
  elsif current_date >= v_last.period_end then
    -- O último mês acabou e o próximo ainda não foi aberto.
    v_renew := true;
    v_due := v_last.period_end;

    select d.vehicle_type into v_vehicle from public.drivers d where d.id = p_driver;
    select coalesce(bool_or(p.kind = 'free'), false),
           count(*) filter (where p.status = 'paid' and p.kind in ('entry', 'standard'))
    into v_had_free, v_paid
    from public.driver_fee_periods p
    where p.driver_id = p_driver;
    v_kind := private.fee_kind_for(v_had_free, v_paid);
    v_amount := coalesce(private.fee_amount(v_vehicle, v_kind, current_date), 0);
  else
    return query select 'ok', null::date, 0, null::bigint, null::public.fee_kind, null::numeric,
      v_last.period_start, v_last.period_end, false;
    return;
  end if;

  v_late := greatest(0, current_date - v_due);

  return query select
    case
      when current_date > v_due + private.fee_grace_days() then 'overdue'
      when current_date > v_due then 'due'
      else 'pending'
    end,
    v_due,
    v_late,
    case when v_renew then null::bigint else v_last.id end,
    v_kind,
    v_amount,
    v_last.period_start,
    v_last.period_end,
    v_renew;
end;
$$;

revoke execute on function private.fee_state(uuid) from public, anon, authenticated;

-- Pode receber pedidos? Só deixa de poder quem passou da tolerância.
create function private.fee_ok(p_driver uuid)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select coalesce((select s.state <> 'overdue' from private.fee_state(p_driver) s), true);
$$;

revoke execute on function private.fee_ok(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Quem está em atraso não recebe pedidos nem fica online
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
      and d.status = 'approved'
      and d.is_online
      and private.fee_ok(d.id)
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

-- ---------------------------------------------------------------------------
-- O que o motorista vê: o mês, o Pix e o histórico
-- ---------------------------------------------------------------------------

create function public.my_fee_status()
returns jsonb
language plpgsql
stable
security definer set search_path = ''
as $$
declare
  v_state record;
  v_period public.driver_fee_periods;
  v_pix public.pix_settings;
begin
  if not exists (select 1 from public.drivers d where d.id = (select auth.uid()) and d.status = 'approved') then
    return null;
  end if;

  select * into v_state from private.fee_state((select auth.uid()));

  if v_state.period_id is not null then
    select * into v_period from public.driver_fee_periods p where p.id = v_state.period_id;
  end if;

  select * into v_pix from public.pix_settings where id = 1;

  return jsonb_build_object(
    'state', v_state.state,
    'due_on', v_state.due_on,
    'days_late', v_state.days_late,
    'grace_days', private.fee_grace_days(),
    'period_id', v_state.period_id,
    'kind', v_state.kind,
    'amount', v_state.amount,
    'period_start', v_state.period_start,
    'period_end', v_state.period_end,
    'needs_renewal', v_state.needs_renewal,
    'claimed_at', v_period.claimed_at,
    'receipt_path', v_period.receipt_path,
    -- O Pix só aparece quando há algo a pagar.
    'pix', case
      when v_state.state in ('pending', 'due', 'overdue') and v_pix.pix_key is not null
      then jsonb_build_object(
        'key', v_pix.pix_key, 'name', v_pix.receiver_name, 'city', v_pix.receiver_city,
        'description', v_pix.description)
    end,
    'history', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'period_start', p.period_start, 'period_end', p.period_end, 'kind', p.kind,
        'amount', p.amount, 'status', p.status, 'paid_at', p.paid_at
      ) order by p.period_start desc), '[]'::jsonb)
      from (
        select * from public.driver_fee_periods x
        where x.driver_id = (select auth.uid())
        order by x.period_start desc
        limit 6
      ) p
    )
  );
end;
$$;

-- O motorista diz que pagou (e, se quiser, anexa o comprovante já enviado ao
-- armazenamento). A equipe confere e confirma.
create function public.claim_fee_payment(p_period_id bigint, p_receipt_path text default null)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if p_receipt_path is not null and left(p_receipt_path, 37) <> (select auth.uid())::text || '/' then
    raise exception 'Comprovante inválido';
  end if;

  update public.driver_fee_periods p
  set claimed_at = now(),
      receipt_path = coalesce(p_receipt_path, p.receipt_path)
  where p.id = p_period_id
    and p.driver_id = (select auth.uid())
    and p.status = 'open';

  if not found then
    raise exception 'Não encontramos essa mensalidade em aberto';
  end if;
end;
$$;

revoke execute on function public.my_fee_status() from public, anon;
revoke execute on function public.claim_fee_payment(bigint, text) from public, anon;
grant execute on function public.my_fee_status() to authenticated;
grant execute on function public.claim_fee_payment(bigint, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Comprovantes: arquivo privado, na pasta do próprio motorista
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fee-receipts', 'fee-receipts', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "motorista envia o próprio comprovante" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'fee-receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "motorista lê o próprio comprovante" on storage.objects
  for select to authenticated
  using (bucket_id = 'fee-receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "equipe lê os comprovantes" on storage.objects
  for select to authenticated
  using (bucket_id = 'fee-receipts' and public.staff_me());

-- ---------------------------------------------------------------------------
-- Painel: lista de mensalidades, confirmar pagamento e dados do Pix
-- ---------------------------------------------------------------------------

-- Motoristas com algo a pagar (ou que já disseram que pagaram), os mais atrasados primeiro.
create function public.staff_list_fees(p_all boolean default false)
returns jsonb
language plpgsql
stable
security definer set search_path = ''
as $$
begin
  perform private.require_staff();

  return (
    select coalesce(jsonb_agg(item order by (item ->> 'rank')::int, (item ->> 'due_on')), '[]'::jsonb)
    from (
      select jsonb_build_object(
        'driver_id', d.id,
        'driver_name', pr.full_name,
        'vehicle_type', d.vehicle_type,
        'vehicle_plate', d.vehicle_plate,
        'state', st.state,
        'due_on', st.due_on,
        'days_late', st.days_late,
        'period_id', st.period_id,
        'kind', st.kind,
        'amount', st.amount,
        'needs_renewal', st.needs_renewal,
        'claimed_at', per.claimed_at,
        'receipt_path', per.receipt_path,
        'rank', case st.state when 'overdue' then 0 when 'due' then 1 when 'pending' then 2 else 3 end
      ) as item
      from public.drivers d
      join public.profiles pr on pr.id = d.id
      cross join lateral private.fee_state(d.id) st
      left join public.driver_fee_periods per on per.id = st.period_id
      where d.status = 'approved'
        and (p_all or st.state <> 'ok')
    ) x
  );
end;
$$;

-- A equipe confirma que o dinheiro entrou.
create function public.staff_mark_fee_paid(p_period_id bigint)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  perform private.require_staff();

  update public.driver_fee_periods p
  set status = 'paid', paid_at = now()
  where p.id = p_period_id and p.status = 'open';

  if not found then
    raise exception 'Essa mensalidade não está em aberto';
  end if;
end;
$$;

create function public.staff_get_pix_settings()
returns jsonb
language plpgsql
stable
security definer set search_path = ''
as $$
begin
  perform private.require_staff();
  return (select to_jsonb(s) from public.pix_settings s where s.id = 1);
end;
$$;

create function public.staff_set_pix_settings(p_key text, p_name text, p_city text, p_description text)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  perform private.require_staff();

  update public.pix_settings
  set pix_key = nullif(trim(p_key), ''),
      receiver_name = nullif(upper(trim(p_name)), ''),
      receiver_city = nullif(upper(trim(p_city)), ''),
      description = coalesce(nullif(trim(p_description), ''), 'Simbora car'),
      updated_at = now()
  where id = 1;
exception
  when check_violation then
    raise exception 'Confira os campos: nome até 25 letras, cidade até 15 e descrição até 25';
end;
$$;

revoke execute on function public.staff_list_fees(boolean) from public, anon;
revoke execute on function public.staff_mark_fee_paid(bigint) from public, anon;
revoke execute on function public.staff_get_pix_settings() from public, anon;
revoke execute on function public.staff_set_pix_settings(text, text, text, text) from public, anon;
grant execute on function public.staff_list_fees(boolean) to authenticated;
grant execute on function public.staff_mark_fee_paid(bigint) to authenticated;
grant execute on function public.staff_get_pix_settings() to authenticated;
grant execute on function public.staff_set_pix_settings(text, text, text, text) to authenticated;
