-- Excluir conta: viagem agendada ainda longe da hora (sem adiantamento) não segura mais a exclusão.
-- A do motorista volta para a lista e a do passageiro é cancelada; só corrida em andamento, perto da
-- hora ou com adiantamento recebido bloqueia. A checagem fica só em private.delete_account.

create or replace function private.delete_account(p_uid uuid)
returns text
language plpgsql
security definer set search_path = ''
as $$
declare
  v_photo text;
  v_cpf text;
  v_had_free boolean;
  v_paid int;
  v_ride record;
begin
  select p.photo_path into v_photo from public.profiles p where p.id = p_uid;

  -- Corrida de verdade em andamento (ou agendada já perto da hora, ou com adiantamento pago) segura a exclusão.
  if exists (
    select 1 from public.rides r
    where (r.passenger_id = p_uid or r.driver_id = p_uid)
      and r.status in ('accepted', 'arrived', 'in_progress')
      and not (
        r.status = 'accepted'
        and r.scheduled_for is not null
        and r.scheduled_for > now() + interval '1 hour'
        and r.advance_received_at is null
      )
  ) then
    raise exception 'Termine a corrida em andamento antes de excluir a conta';
  end if;

  -- Viagens agendadas ainda longe da hora, sem adiantamento: do motorista voltam para a lista
  -- (no valor original, como na trava); do passageiro são canceladas.
  for v_ride in
    select r.id, r.driver_id from public.rides r
    where (r.passenger_id = p_uid or r.driver_id = p_uid)
      and r.status = 'accepted'
      and r.scheduled_for is not null
      and r.scheduled_for > now() + interval '1 hour'
      and r.advance_received_at is null
    for update
  loop
    if v_ride.driver_id = p_uid then
      update public.rides
      set driver_id = null,
          status = 'requested',
          accepted_at = null,
          advance_percent = null,
          advance_received_at = null,
          estimated_price = estimated_price - coalesce(extra_amount, 0),
          extra_amount = 0
      where id = v_ride.id;

      insert into public.ride_driver_releases (ride_id, driver_id) values (v_ride.id, p_uid);
    else
      update public.rides
      set status = 'cancelled', cancelled_at = now(), cancelled_by = p_uid
      where id = v_ride.id;
    end if;

    update public.ride_proposals set status = 'withdrawn' where ride_id = v_ride.id and status = 'accepted';
  end loop;

  -- Pedido aberto some junto com a conta.
  update public.rides
  set status = 'cancelled', cancelled_at = now(), cancelled_by = p_uid
  where passenger_id = p_uid and status = 'requested';

  -- Motorista: guarda só o hash do CPF e apaga os dados pessoais.
  if exists (select 1 from public.drivers d where d.id = p_uid) then
    select dp.cpf into v_cpf from public.driver_private dp where dp.driver_id = p_uid;

    if v_cpf is not null then
      select coalesce(bool_or(p.kind = 'free'), false),
             count(*) filter (where p.status = 'paid' and p.kind in ('entry', 'standard'))
      into v_had_free, v_paid
      from public.driver_fee_periods p
      where p.driver_id = p_uid;

      insert into public.deleted_driver_cpfs as h (cpf_hash, had_free, paid_count)
      values (private.cpf_hash(v_cpf), v_had_free, v_paid)
      on conflict (cpf_hash) do update
        set had_free = h.had_free or excluded.had_free,
            paid_count = greatest(h.paid_count, excluded.paid_count),
            deleted_at = now();
    end if;

    delete from public.driver_private where driver_id = p_uid;
    delete from public.driver_checklist where driver_id = p_uid;
    delete from public.driver_acceptances where driver_id = p_uid;
    delete from public.driver_locations where driver_id = p_uid;

    -- A linha do motorista fica (as corridas apontam para ela), mas bloqueada e sem dados.
    update public.drivers
    set status = 'blocked',
        is_online = false,
        pix_key = null,
        vehicle_plate = 'EXC' || left(replace(p_uid::text, '-', ''), 10)
    where id = p_uid;
  end if;

  -- Mensagens que a pessoa escreveu viram "mensagem apagada" para o outro lado.
  update public.ride_messages set body = '(mensagem apagada)' where sender_id = p_uid;

  update public.profiles
  set full_name = 'Conta excluída', phone = null, photo_path = null, deleted_at = now()
  where id = p_uid;

  -- O login: sem telefone, sem sessões e bloqueado. O número fica livre para
  -- um cadastro novo, que começa do zero.
  delete from auth.sessions where user_id = p_uid;
  delete from auth.identities where user_id = p_uid;
  update auth.users
  set phone = null,
      email = null,
      raw_user_meta_data = '{}'::jsonb,
      banned_until = 'infinity'::timestamptz
  where id = p_uid;

  return v_photo;
end;
$$;

-- A checagem de corrida em andamento agora é só a de private.delete_account.
create or replace function public.staff_delete_account(p_user_id uuid)
returns text
language plpgsql
security definer set search_path = ''
as $$
begin
  perform private.require_staff();

  if p_user_id = auth.uid() then
    raise exception 'Você não pode excluir a sua própria conta por aqui';
  end if;
  if exists (select 1 from public.staff s where s.user_id = p_user_id) then
    raise exception 'Contas da equipe não podem ser excluídas por aqui';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user_id) then
    raise exception 'Conta não encontrada';
  end if;
  if exists (select 1 from public.profiles p where p.id = p_user_id and p.deleted_at is not null) then
    raise exception 'Essa conta já foi excluída';
  end if;

  return private.delete_account(p_user_id);
end;
$$;
