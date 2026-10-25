-- Painel: aba "Cadastrados" (todos os motoristas, com as informações) e travar / destravar a conta.
--
-- Travar = suspender: o motorista não fica online nem recebe pedidos, e as viagens agendadas
-- que ele tinha (ainda longe da hora) voltam para a lista. Destravar traz de volta: quem já
-- foi aprovado alguma vez volta aprovado; quem nunca foi aprovado volta para "aguardando".

alter table public.drivers
  add column lock_note text,
  add column locked_at timestamptz;

-- Todos os motoristas de uma vez, com o que a equipe precisa para acompanhar.
create function public.staff_driver_overview()
returns jsonb
language plpgsql
stable
security definer set search_path = ''
as $$
begin
  perform private.require_staff();

  return (
    select coalesce(jsonb_agg(item order by (item ->> 'status_rank')::int, lower(coalesce(item ->> 'full_name', ''))), '[]'::jsonb)
    from (
      select jsonb_build_object(
        'driver_id', d.id,
        'full_name', p.full_name,
        'phone', p.phone,
        'status', d.status,
        'status_rank', case d.status when 'pending' then 0 when 'approved' then 1 when 'suspended' then 2 else 3 end,
        'vehicle_type', d.vehicle_type,
        'vehicle_model', d.vehicle_model,
        'vehicle_color', d.vehicle_color,
        'vehicle_plate', d.vehicle_plate,
        'vehicle_year', d.vehicle_year,
        'city_name', c.name,
        'is_online', d.is_online,
        'created_at', d.created_at,
        'approved_at', d.approved_at,
        'cpf', dp.cpf,
        'birth_date', dp.birth_date,
        'cnh_category', dp.cnh_category,
        'cnh_ear', dp.cnh_ear,
        'lock_note', d.lock_note,
        'locked_at', d.locked_at,
        'last_seen', l.updated_at,
        'rides_total', (select count(*) from public.rides r where r.driver_id = d.id and r.status = 'completed'),
        'rides_30d', (select count(*) from public.rides r
                      where r.driver_id = d.id and r.status = 'completed' and r.completed_at >= now() - interval '30 days'),
        'rating_avg', (select round(avg(x.passenger_to_driver), 2)
                       from public.rides r join public.ride_ratings x on x.ride_id = r.id
                       where r.driver_id = d.id and r.status = 'completed' and x.passenger_to_driver is not null),
        'rating_count', (select count(x.passenger_to_driver)
                         from public.rides r join public.ride_ratings x on x.ride_id = r.id
                         where r.driver_id = d.id and r.status = 'completed'),
        'fee_state', case when d.status = 'approved' then (select s.state from private.fee_state(d.id) s) end,
        'fee_due_on', case when d.status = 'approved' then (select s.due_on from private.fee_state(d.id) s) end,
        'fee_amount', case when d.status = 'approved' then (select s.amount from private.fee_state(d.id) s) end
      ) as item
      from public.drivers d
      join public.profiles p on p.id = d.id
      join public.cities c on c.id = d.city_id
      left join public.driver_private dp on dp.driver_id = d.id
      left join public.driver_locations l on l.driver_id = d.id
    ) x
  );
end;
$$;

-- Trava a conta (com um motivo para a equipe lembrar depois).
create function public.staff_lock_driver(p_driver uuid, p_reason text default null)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_driver public.drivers;
  v_ride record;
begin
  perform private.require_staff();

  select * into v_driver from public.drivers d where d.id = p_driver for update;
  if not found then
    raise exception 'Motorista não encontrado';
  end if;
  if v_driver.status in ('suspended', 'blocked') then
    raise exception 'Essa conta já está travada';
  end if;

  update public.drivers
  set status = 'suspended',
      is_online = false,
      lock_note = nullif(trim(coalesce(p_reason, '')), ''),
      locked_at = now()
  where id = p_driver;

  -- Viagens agendadas ainda longe da hora voltam para a lista (no valor original).
  for v_ride in
    select r.id from public.rides r
    where r.driver_id = p_driver
      and r.status = 'accepted'
      and r.scheduled_for is not null
      and r.scheduled_for > now() + interval '1 hour'
      and r.advance_received_at is null
    for update
  loop
    update public.rides
    set driver_id = null,
        status = 'requested',
        accepted_at = null,
        advance_percent = null,
        advance_received_at = null,
        estimated_price = estimated_price - coalesce(extra_amount, 0),
        extra_amount = 0
    where id = v_ride.id;

    update public.ride_proposals set status = 'withdrawn' where ride_id = v_ride.id and status = 'accepted';
    insert into public.ride_driver_releases (ride_id, driver_id) values (v_ride.id, p_driver);
  end loop;

  -- Fecha o tempo online que estivesse aberto.
  update public.driver_online_sessions set ended_at = now() where driver_id = p_driver and ended_at is null;
end;
$$;

-- Destrava: quem já foi aprovado volta aprovado; quem nunca foi volta a "aguardando aprovação".
create function public.staff_unlock_driver(p_driver uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_driver public.drivers;
begin
  perform private.require_staff();

  select * into v_driver from public.drivers d where d.id = p_driver for update;
  if not found then
    raise exception 'Motorista não encontrado';
  end if;
  if v_driver.status not in ('suspended', 'blocked') then
    raise exception 'Essa conta não está travada';
  end if;

  update public.drivers
  set status = case when v_driver.approved_at is not null then 'approved'::public.driver_status
                    else 'pending'::public.driver_status end,
      lock_note = null,
      locked_at = null
  where id = p_driver;
end;
$$;

revoke execute on function public.staff_driver_overview() from public, anon;
revoke execute on function public.staff_lock_driver(uuid, text) from public, anon;
revoke execute on function public.staff_unlock_driver(uuid) from public, anon;
grant execute on function public.staff_driver_overview() to authenticated;
grant execute on function public.staff_lock_driver(uuid, text) to authenticated;
grant execute on function public.staff_unlock_driver(uuid) to authenticated;
