-- Etapa 10: relatórios da equipe (só leitura, pelo painel) e reavaliação semestral.
--
--  * Reavaliação semestral: quem vence nos próximos dias e o registro de que foi
--    feita (o motorista não vê nada disso no app).
--  * Relatório de fuga: corridas no app contra a mensalidade, motorista muito tempo
--    online com poucas corridas, queda forte de corridas e dupla passageiro e
--    motorista que parou de aparecer.
--  * Alerta a partir do mês 3: menos de 10 corridas no mês pede uma conversa da
--    equipe, antes de qualquer outra medida.
-- Os limites ficam em funções pequenas, fáceis de ajustar com dados reais.

-- ---------------------------------------------------------------------------
-- Limites dos relatórios
-- ---------------------------------------------------------------------------

-- Corridas mínimas por mês a partir do mês 3 da mensalidade.
create function private.month3_min_rides()
returns int
language sql
immutable
as $$
  select 10;
$$;

-- Muito tempo online com poucas corridas, nos últimos 30 dias.
create function private.fuga_online_hours()
returns int
language sql
immutable
as $$
  select 20;
$$;

create function private.fuga_few_rides()
returns int
language sql
immutable
as $$
  select 3;
$$;

-- Dupla que andava junta (corridas mínimas nos dias 31 a 90 atrás) e parou.
create function private.fuga_pair_min_rides()
returns int
language sql
immutable
as $$
  select 3;
$$;

revoke execute on function private.month3_min_rides() from public, anon, authenticated;
revoke execute on function private.fuga_online_hours() from public, anon, authenticated;
revoke execute on function private.fuga_few_rides() from public, anon, authenticated;
revoke execute on function private.fuga_pair_min_rides() from public, anon, authenticated;

-- Segundos online de um motorista desde `p_since` (a mesma conta do dashboard do
-- motorista: sessão esquecida aberta só vale até 5 minutos depois da última posição).
create function private.online_seconds(p_driver uuid, p_since timestamptz)
returns bigint
language sql
stable
security definer set search_path = ''
as $$
  select coalesce(sum(
    greatest(
      0,
      extract(epoch from (
        least(
          now(),
          coalesce(
            s.ended_at,
            (select l.updated_at + interval '5 minutes' from public.driver_locations l where l.driver_id = s.driver_id),
            s.started_at
          )
        ) - greatest(s.started_at, p_since)
      ))
    )
  ), 0)::bigint
  from public.driver_online_sessions s
  where s.driver_id = p_driver
    and coalesce(s.ended_at, now()) > p_since;
$$;

revoke execute on function private.online_seconds(uuid, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Reavaliação semestral
-- ---------------------------------------------------------------------------

-- Quem vence nos próximos `p_days` dias (e quem já venceu), do mais urgente ao menos.
create function public.staff_review_list(p_days int default 30)
returns jsonb
language plpgsql
stable
security definer set search_path = ''
as $$
begin
  perform private.require_staff();

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'driver_id', d.id,
      'driver_name', p.full_name,
      'vehicle_type', d.vehicle_type,
      'vehicle_plate', d.vehicle_plate,
      'status', d.status,
      'last_reviewed_on', r.last_reviewed_on,
      'next_review_on', r.next_review_on,
      'days_left', r.next_review_on - current_date,
      'notes', r.notes
    ) order by r.next_review_on), '[]'::jsonb)
    from public.driver_reviews r
    join public.drivers d on d.id = r.driver_id
    join public.profiles p on p.id = d.id
    where d.status in ('approved', 'suspended')
      and r.next_review_on <= current_date + greatest(coalesce(p_days, 30), 0)
  );
end;
$$;

-- A equipe registra que a reavaliação foi feita hoje; a próxima vem 6 meses depois.
create function public.staff_register_review(p_driver uuid, p_notes text default null)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  perform private.require_staff();

  update public.driver_reviews r
  set last_reviewed_on = current_date,
      notes = coalesce(nullif(trim(p_notes), ''), r.notes)
  where r.driver_id = p_driver;

  if not found then
    raise exception 'Esse motorista não tem reavaliação cadastrada';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Relatório de fuga
-- ---------------------------------------------------------------------------

create function public.staff_fuga_report()
returns jsonb
language plpgsql
stable
security definer set search_path = ''
as $$
declare
  v_drivers jsonb;
  v_pairs jsonb;
begin
  perform private.require_staff();

  -- Por motorista aprovado: corridas e horas dos últimos 30 dias, contra a
  -- mensalidade que ele paga.
  select coalesce(jsonb_agg(item order by (item ->> 'rank')::int, (item ->> 'rides_30d')::int), '[]'::jsonb)
  into v_drivers
  from (
    select jsonb_build_object(
      'driver_id', x.id,
      'driver_name', x.full_name,
      'vehicle_type', x.vehicle_type,
      'vehicle_plate', x.vehicle_plate,
      'rides_30d', x.rides_30d,
      'rides_prev_30d', x.rides_prev_30d,
      'online_hours_30d', round(x.online_seconds / 3600.0, 1),
      'monthly_fee', x.monthly_fee,
      'fee_per_ride', case when x.rides_30d > 0 and x.monthly_fee is not null
                           then round(x.monthly_fee / x.rides_30d, 2) end,
      'few_rides_many_hours', (x.online_seconds / 3600.0 >= private.fuga_online_hours()
                               and x.rides_30d <= private.fuga_few_rides()),
      'rides_dropped', (x.rides_prev_30d >= 5 and x.rides_30d * 2 < x.rides_prev_30d),
      'rank', case
        when (x.online_seconds / 3600.0 >= private.fuga_online_hours() and x.rides_30d <= private.fuga_few_rides()) then 0
        when (x.rides_prev_30d >= 5 and x.rides_30d * 2 < x.rides_prev_30d) then 1
        else 2
      end
    ) as item
    from (
      select
        d.id, pr.full_name, d.vehicle_type, d.vehicle_plate,
        (select count(*) from public.rides r
          where r.driver_id = d.id and r.status = 'completed'
            and r.completed_at >= now() - interval '30 days') as rides_30d,
        (select count(*) from public.rides r
          where r.driver_id = d.id and r.status = 'completed'
            and r.completed_at >= now() - interval '60 days'
            and r.completed_at < now() - interval '30 days') as rides_prev_30d,
        private.online_seconds(d.id, now() - interval '30 days') as online_seconds,
        (select f.amount from public.driver_fee_periods f
          where f.driver_id = d.id and f.kind <> 'free'
          order by f.period_start desc limit 1) as monthly_fee
      from public.drivers d
      join public.profiles pr on pr.id = d.id
      where d.status = 'approved'
    ) x
  ) y;

  -- Duplas que andavam juntas e pararam de aparecer nos últimos 30 dias: pode ser
  -- que tenham passado a combinar as corridas por fora do app.
  select coalesce(jsonb_agg(jsonb_build_object(
      'passenger_name', pp.full_name,
      'driver_name', dp.full_name,
      'driver_id', t.driver_id,
      'rides_before', t.n,
      'last_ride_on', t.last_on
    ) order by t.n desc, t.last_on desc), '[]'::jsonb)
  into v_pairs
  from (
    select r.passenger_id, r.driver_id, count(*) as n, max(r.completed_at)::date as last_on
    from public.rides r
    where r.status = 'completed'
      and r.driver_id is not null
      and r.completed_at >= now() - interval '90 days'
      and r.completed_at < now() - interval '30 days'
    group by r.passenger_id, r.driver_id
    having count(*) >= private.fuga_pair_min_rides()
  ) t
  join public.drivers d on d.id = t.driver_id and d.status = 'approved'
  join public.profiles pp on pp.id = t.passenger_id
  join public.profiles dp on dp.id = t.driver_id
  where not exists (
    select 1 from public.rides r2
    where r2.passenger_id = t.passenger_id and r2.driver_id = t.driver_id
      and r2.status = 'completed' and r2.completed_at >= now() - interval '30 days'
  );

  return jsonb_build_object(
    'drivers', v_drivers,
    'pairs', v_pairs,
    'limits', jsonb_build_object(
      'online_hours', private.fuga_online_hours(),
      'few_rides', private.fuga_few_rides(),
      'pair_min_rides', private.fuga_pair_min_rides()
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Alerta a partir do mês 3
-- ---------------------------------------------------------------------------

-- Motoristas que já estão na mensalidade padrão (mês 3 em diante): corridas no
-- mês corrente da mensalidade. Mês que já acabou com menos de 10 corridas pede
-- conversa; mês em andamento mostra o ritmo.
create function public.staff_month3_alerts()
returns jsonb
language plpgsql
stable
security definer set search_path = ''
as $$
begin
  perform private.require_staff();

  return (
    select coalesce(jsonb_agg(item order by (item ->> 'rank')::int, (item ->> 'rides')::int), '[]'::jsonb)
    from (
      select jsonb_build_object(
        'driver_id', x.id,
        'driver_name', x.full_name,
        'vehicle_type', x.vehicle_type,
        'vehicle_plate', x.vehicle_plate,
        'period_start', x.period_start,
        'period_end', x.period_end,
        'rides', x.rides,
        'min_rides', private.month3_min_rides(),
        'ended', x.period_end <= current_date,
        'days_left', greatest(0, x.period_end - current_date),
        -- Ritmo: no meio do mês, quantas já deveria ter feito para chegar às 10.
        'on_pace', (x.period_end <= current_date and x.rides >= private.month3_min_rides())
                   or (x.period_end > current_date
                       and x.rides >= ceil(private.month3_min_rides()
                                           * (current_date - x.period_start)::numeric
                                           / greatest(1, x.period_end - x.period_start))),
        'rank', case
          when x.period_end <= current_date and x.rides < private.month3_min_rides() then 0
          when x.period_end > current_date and x.rides < ceil(private.month3_min_rides()
               * (current_date - x.period_start)::numeric / greatest(1, x.period_end - x.period_start)) then 1
          else 2
        end
      ) as item
      from (
        select
          d.id, pr.full_name, d.vehicle_type, d.vehicle_plate, per.period_start, per.period_end,
          (select count(*) from public.rides r
            where r.driver_id = d.id and r.status = 'completed'
              and r.completed_at >= (per.period_start::timestamp at time zone 'America/Fortaleza')
              and r.completed_at < (per.period_end::timestamp at time zone 'America/Fortaleza')) as rides
        from public.drivers d
        join public.profiles pr on pr.id = d.id
        join lateral (
          select f.period_start, f.period_end
          from public.driver_fee_periods f
          where f.driver_id = d.id and f.kind = 'standard' and f.period_start <= current_date
          order by f.period_start desc
          limit 1
        ) per on true
        where d.status = 'approved'
      ) x
    ) y
  );
end;
$$;

revoke execute on function public.staff_review_list(int) from public, anon;
revoke execute on function public.staff_register_review(uuid, text) from public, anon;
revoke execute on function public.staff_fuga_report() from public, anon;
revoke execute on function public.staff_month3_alerts() from public, anon;
grant execute on function public.staff_review_list(int) to authenticated;
grant execute on function public.staff_register_review(uuid, text) to authenticated;
grant execute on function public.staff_fuga_report() to authenticated;
grant execute on function public.staff_month3_alerts() to authenticated;
