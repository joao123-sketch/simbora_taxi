-- Conta excluída pelo próprio usuário (profiles.deleted_at) não pode ser travada nem destravada
-- pelo painel: a linha do motorista fica bloqueada e sem dados só para guardar o histórico.

create or replace function public.staff_lock_driver(p_driver uuid, p_reason text default null)
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
  if exists (select 1 from public.profiles p where p.id = p_driver and p.deleted_at is not null) then
    raise exception 'Essa conta foi excluída pelo próprio usuário';
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

  update public.driver_online_sessions set ended_at = now() where driver_id = p_driver and ended_at is null;
end;
$$;

create or replace function public.staff_unlock_driver(p_driver uuid)
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
  if exists (select 1 from public.profiles p where p.id = p_driver and p.deleted_at is not null) then
    raise exception 'Essa conta foi excluída pelo próprio usuário';
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
