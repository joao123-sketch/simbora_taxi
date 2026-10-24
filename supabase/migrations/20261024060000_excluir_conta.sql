-- Exclusão de conta (exigência das lojas de aplicativos).
-- A pessoa some do app: nome, telefone e login são apagados. O histórico de
-- corridas continua para a outra pessoa da corrida, só que sem o nome. Do
-- motorista guardamos apenas um código irreversível do CPF (hash), para ele não
-- ganhar um segundo mês grátis nem pagar a entrada de novo se voltar.

alter table public.profiles add column deleted_at timestamptz;

-- O que o CPF (em hash) já usou: se teve mês grátis e quantos meses pagou.
create table public.deleted_driver_cpfs (
  cpf_hash text primary key,
  had_free boolean not null,
  paid_count int not null,
  deleted_at timestamptz not null default now()
);

alter table public.deleted_driver_cpfs enable row level security;
revoke all on public.deleted_driver_cpfs from anon, authenticated;

create function private.cpf_hash(p_cpf text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(p_cpf, 'UTF8')), 'hex');
$$;

revoke execute on function private.cpf_hash(text) from public, anon, authenticated;

-- Quem volta com o mesmo CPF herda o que já usou: não tem outro mês grátis, e
-- se já pagou, volta pagando o valor padrão.
create or replace function private.open_next_period(p_driver uuid, p_start date)
returns bigint
language plpgsql
security definer set search_path = ''
as $$
declare
  v_vehicle public.vehicle_type;
  v_had_free boolean;
  v_paid int;
  v_kind public.fee_kind;
  v_amount numeric;
  v_id bigint;
  v_old public.deleted_driver_cpfs;
begin
  select d.vehicle_type into v_vehicle from public.drivers d where d.id = p_driver;

  select coalesce(bool_or(p.kind = 'free'), false),
         count(*) filter (where p.status = 'paid' and p.kind in ('entry', 'standard'))
  into v_had_free, v_paid
  from public.driver_fee_periods p
  where p.driver_id = p_driver;

  select h.* into v_old
  from public.deleted_driver_cpfs h
  join public.driver_private dp on private.cpf_hash(dp.cpf) = h.cpf_hash
  where dp.driver_id = p_driver;

  if found then
    v_had_free := v_had_free or v_old.had_free;
    v_paid := v_paid + v_old.paid_count;
  end if;

  v_kind := private.fee_kind_for(v_had_free, v_paid);
  v_amount := coalesce(private.fee_amount(v_vehicle, v_kind, p_start), 0);

  insert into public.driver_fee_periods (driver_id, period_start, period_end, kind, amount, status, due_on)
  values (
    p_driver, p_start, (p_start + interval '1 month')::date, v_kind, v_amount,
    case when v_kind = 'free' then 'waived'::public.fee_status else 'open'::public.fee_status end,
    p_start
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- A própria pessoa exclui a conta.
create function public.delete_my_account()
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_cpf text;
  v_had_free boolean;
  v_paid int;
begin
  if v_uid is null then
    raise exception 'Faça login para excluir a conta';
  end if;

  if exists (
    select 1 from public.rides r
    where (r.passenger_id = v_uid or r.driver_id = v_uid)
      and r.status in ('accepted', 'arrived', 'in_progress')
  ) then
    raise exception 'Termine a corrida em andamento antes de excluir a conta';
  end if;

  -- Pedido aberto some junto com a conta.
  update public.rides
  set status = 'cancelled', cancelled_at = now(), cancelled_by = v_uid
  where passenger_id = v_uid and status = 'requested';

  -- Motorista: guarda só o hash do CPF e apaga os dados pessoais.
  if exists (select 1 from public.drivers d where d.id = v_uid) then
    select dp.cpf into v_cpf from public.driver_private dp where dp.driver_id = v_uid;

    if v_cpf is not null then
      select coalesce(bool_or(p.kind = 'free'), false),
             count(*) filter (where p.status = 'paid' and p.kind in ('entry', 'standard'))
      into v_had_free, v_paid
      from public.driver_fee_periods p
      where p.driver_id = v_uid;

      insert into public.deleted_driver_cpfs as h (cpf_hash, had_free, paid_count)
      values (private.cpf_hash(v_cpf), v_had_free, v_paid)
      on conflict (cpf_hash) do update
        set had_free = h.had_free or excluded.had_free,
            paid_count = greatest(h.paid_count, excluded.paid_count),
            deleted_at = now();
    end if;

    delete from public.driver_private where driver_id = v_uid;
    delete from public.driver_checklist where driver_id = v_uid;
    delete from public.driver_acceptances where driver_id = v_uid;
    delete from public.driver_locations where driver_id = v_uid;

    -- A linha do motorista fica (as corridas apontam para ela), mas bloqueada e sem dados.
    update public.drivers
    set status = 'blocked',
        is_online = false,
        pix_key = null,
        vehicle_plate = 'EXC' || left(replace(v_uid::text, '-', ''), 10)
    where id = v_uid;
  end if;

  -- Mensagens que a pessoa escreveu viram "mensagem apagada" para o outro lado.
  update public.ride_messages set body = '(mensagem apagada)' where sender_id = v_uid;

  update public.profiles
  set full_name = 'Conta excluída', phone = null, deleted_at = now()
  where id = v_uid;

  -- O login: sem telefone, sem sessões e bloqueado. O número fica livre para
  -- um cadastro novo, que começa do zero.
  delete from auth.sessions where user_id = v_uid;
  delete from auth.identities where user_id = v_uid;
  update auth.users
  set phone = null,
      email = null,
      raw_user_meta_data = '{}'::jsonb,
      banned_until = 'infinity'::timestamptz
  where id = v_uid;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
