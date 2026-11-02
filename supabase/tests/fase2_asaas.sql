-- Testes da fase 2 (cobrança da mensalidade pelo Asaas).
-- Rode inteiro no SQL Editor do Supabase DEPOIS de aplicar as migrations 20261103030000, 20261103040000 e 20261103050000.
-- Antes dela, falha (é o esperado). Tudo acontece numa transação que termina desfeita:
-- o resultado aparece como um "erro" que começa com RESULTADO (é de propósito).

begin;

alter table public.drivers disable trigger user;

create table public.zz_fx (k text primary key, v text);
grant all on public.zz_fx to authenticated;

create function pg_temp.mk_user(p_name text) returns uuid language plpgsql as $f$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, aud, role, phone)
  values (v, 'authenticated', 'authenticated', '5599' || lpad((random() * 999999999)::bigint::text, 9, '0'));
  update public.profiles set full_name = p_name where id = v;
  return v;
end $f$;

create function pg_temp.mk_driver(p_name text, p_plate text, p_cpf text, p_status public.driver_status) returns uuid language plpgsql as $f$
declare v uuid := pg_temp.mk_user(p_name);
begin
  insert into public.drivers (id, city_id, status, vehicle_type, vehicle_model, vehicle_color, vehicle_plate, vehicle_year, is_online)
  values (v, (select id from public.cities where name = 'Guaraciaba do Norte'), p_status, 'car', 'Uno', 'Branco', p_plate, 2020, false);
  insert into public.driver_private (driver_id, cpf, birth_date, cnh_category, cnh_ear)
  values (v, p_cpf, date '1990-01-01', 'B', true);
  return v;
end $f$;

create function pg_temp.mk_period(p_driver uuid, p_start date, p_due date) returns bigint language plpgsql as $f$
declare v bigint;
begin
  insert into public.driver_fee_periods (driver_id, period_start, period_end, kind, amount, due_on)
  values (p_driver, p_start, p_start + 30, 'entry', 200, p_due)
  returning id into v;
  return v;
end $f$;

-- Personagens: DP (pendente), DA (aprovado, sem mês aberto), DB (aprovado, mês longe do vencimento),
-- DC (aprovado, mês vencendo em 5 dias), DD (aprovado, mês vencido).
do $t$
declare dp uuid; da uuid; db uuid; dc uuid; dd uuid; pb bigint; pc bigint; pd bigint;
begin
  dp := pg_temp.mk_driver('Motorista Pendente', 'AST0001', '52998224725', 'pending');
  da := pg_temp.mk_driver('Motorista Sem Mes', 'AST0002', '11144477735', 'approved');
  db := pg_temp.mk_driver('Motorista Longe', 'AST0003', '39053344705', 'approved');
  dc := pg_temp.mk_driver('Motorista Cinco Dias', 'AST0004', '12345678909', 'approved');
  dd := pg_temp.mk_driver('Motorista Vencido', 'AST0005', '82857414076', 'approved');
  pb := pg_temp.mk_period(db, current_date + 6, current_date + 6);
  pc := pg_temp.mk_period(dc, current_date + 5, current_date + 5);
  pd := pg_temp.mk_period(dd, current_date - 10, current_date - 10);
  insert into public.zz_fx values ('dp', dp::text), ('da', da::text), ('db', db::text), ('dc', dc::text), ('dd', dd::text),
    ('pb', pb::text), ('pc', pc::text), ('pd', pd::text);
end $t$;

-- asaas_contexto_so_aprovado, asaas_contexto_sem_mes_aberto, asaas_contexto_longe_do_vencimento
do $t$
declare dp uuid := (select v::uuid from public.zz_fx where k = 'dp');
        da uuid := (select v::uuid from public.zz_fx where k = 'da');
        db uuid := (select v::uuid from public.zz_fx where k = 'db');
        dc uuid := (select v::uuid from public.zz_fx where k = 'dc');
        pc bigint := (select v::bigint from public.zz_fx where k = 'pc');
        r record;
begin
  begin
    perform * from public.asaas_charge_context(dp);
    raise exception 'FALHOU asaas_contexto_so_aprovado: motorista pendente recebeu contexto';
  exception when others then
    if sqlerrm <> 'Só motorista aprovado paga mensalidade' then raise exception 'FALHOU asaas_contexto_so_aprovado: %', sqlerrm; end if;
  end;
  insert into public.zz_fx values ('ok:asaas_contexto_so_aprovado', '1');

  begin
    perform * from public.asaas_charge_context(da);
    raise exception 'FALHOU asaas_contexto_sem_mes_aberto: devolveu contexto sem mês aberto';
  exception when others then
    if sqlerrm <> 'Você não tem mensalidade para pagar agora' then raise exception 'FALHOU asaas_contexto_sem_mes_aberto: %', sqlerrm; end if;
  end;
  insert into public.zz_fx values ('ok:asaas_contexto_sem_mes_aberto', '1');

  begin
    perform * from public.asaas_charge_context(db);
    raise exception 'FALHOU asaas_contexto_longe_do_vencimento: devolveu contexto com vencimento em 6 dias';
  exception when others then
    if sqlerrm <> 'A cobrança abre 5 dias antes do vencimento' then raise exception 'FALHOU asaas_contexto_longe_do_vencimento: %', sqlerrm; end if;
  end;
  select * into r from public.asaas_charge_context(dc);
  if r.period_id is distinct from pc or r.amount is distinct from 200::numeric or r.cpf is distinct from '12345678909' then
    raise exception 'FALHOU asaas_contexto_longe_do_vencimento: com vencimento em 5 dias devolveu period=%, amount=%, cpf=%', r.period_id, r.amount, r.cpf;
  end if;
  insert into public.zz_fx values ('ok:asaas_contexto_longe_do_vencimento', '1');
end $t$;

-- asaas_salva_e_devolve e asaas_salva_uma_vez
do $t$
declare dc uuid := (select v::uuid from public.zz_fx where k = 'dc');
        pc bigint := (select v::bigint from public.zz_fx where k = 'pc');
        r record;
begin
  perform public.asaas_save_customer(dc, 'cus_teste_1');
  perform public.asaas_save_charge(pc, 'pay_teste_1', 'https://exemplo/fatura1', 'PIXCOPIAECOLA1');
  select * into r from public.asaas_charge_context(dc);
  if r.asaas_customer_id is distinct from 'cus_teste_1' or r.asaas_payment_id is distinct from 'pay_teste_1'
     or r.invoice_url is distinct from 'https://exemplo/fatura1' or r.pix_payload is distinct from 'PIXCOPIAECOLA1' then
    raise exception 'FALHOU asaas_salva_e_devolve: customer=%, payment=%, url=%, pix=%', r.asaas_customer_id, r.asaas_payment_id, r.invoice_url, r.pix_payload;
  end if;
  insert into public.zz_fx values ('ok:asaas_salva_e_devolve', '1');

  perform public.asaas_save_charge(pc, 'pay_teste_2', 'https://exemplo/fatura2', 'OUTRO');
  perform public.asaas_save_customer(dc, 'cus_teste_2');
  select * into r from public.asaas_charge_context(dc);
  if r.asaas_payment_id is distinct from 'pay_teste_1' or r.asaas_customer_id is distinct from 'cus_teste_1' then
    raise exception 'FALHOU asaas_salva_uma_vez: o segundo salvamento trocou os ids (payment=%, customer=%)', r.asaas_payment_id, r.asaas_customer_id;
  end if;
  insert into public.zz_fx values ('ok:asaas_salva_uma_vez', '1');
end $t$;

-- asaas_baixa_idempotente
do $t$
declare pc bigint := (select v::bigint from public.zz_fx where k = 'pc');
        ok1 boolean; ok2 boolean; ok3 boolean; st public.fee_status; quando1 timestamptz; quando2 timestamptz;
begin
  ok1 := public.asaas_mark_paid('pay_teste_1');
  select status, paid_at into st, quando1 from public.driver_fee_periods where id = pc;
  ok2 := public.asaas_mark_paid('pay_teste_1');
  select paid_at into quando2 from public.driver_fee_periods where id = pc;
  ok3 := public.asaas_mark_paid('pay_que_nao_existe');
  if ok1 is not true or st <> 'paid' then raise exception 'FALHOU asaas_baixa_idempotente: primeira baixa ok1=%, status=%', ok1, st; end if;
  if ok2 is not false or quando2 is distinct from quando1 then raise exception 'FALHOU asaas_baixa_idempotente: segunda baixa ok2=%, paid_at mudou', ok2; end if;
  if ok3 is not false then raise exception 'FALHOU asaas_baixa_idempotente: id desconhecido devolveu %', ok3; end if;
  insert into public.zz_fx values ('ok:asaas_baixa_idempotente', '1');
end $t$;

-- asaas_so_service_role
do $t$
declare dc uuid := (select v::uuid from public.zz_fx where k = 'dc');
        papel text;
begin
  foreach papel in array array['authenticated', 'anon'] loop
    execute 'set local role ' || papel;
    begin
      perform * from public.asaas_charge_context(dc);
      execute 'reset role';
      raise exception 'FALHOU asaas_so_service_role: % executou asaas_charge_context', papel;
    exception when insufficient_privilege then
      execute 'reset role';
    end;
    execute 'set local role ' || papel;
    begin
      perform public.asaas_mark_paid('pay_x');
      execute 'reset role';
      raise exception 'FALHOU asaas_so_service_role: % executou asaas_mark_paid', papel;
    exception when insufficient_privilege then
      execute 'reset role';
    end;
  end loop;
  insert into public.zz_fx values ('ok:asaas_so_service_role', '1');
end $t$;

-- painel_lista_mostra_cobranca
do $t$
declare st uuid; dd uuid := (select v::uuid from public.zz_fx where k = 'dd');
        pd bigint := (select v::bigint from public.zz_fx where k = 'pd'); item jsonb;
begin
  st := pg_temp.mk_user('Equipe Asaas');
  insert into public.staff (user_id) values (st);
  perform public.asaas_save_charge(pd, 'pay_dd', 'https://exemplo/dd', null);
  perform set_config('request.jwt.claims', json_build_object('sub', st)::text, true);
  select i into item from jsonb_array_elements(public.staff_list_fees(false)) i where i ->> 'driver_id' = dd::text;
  if item is null or item ->> 'asaas_payment_id' is distinct from 'pay_dd' then
    raise exception 'FALHOU painel_lista_mostra_cobranca: item=%', item;
  end if;
  insert into public.zz_fx values ('ok:painel_lista_mostra_cobranca', '1');
end $t$;

-- fee_status_proximo_pagamento
do $t$
declare de uuid; pe1 bigint; pe2 bigint; dc uuid := (select v::uuid from public.zz_fx where k = 'dc'); r jsonb;
begin
  -- Mês aberto: o próximo pagamento é ele mesmo.
  perform set_config('request.jwt.claims', json_build_object('sub', dc)::text, true);
  r := public.my_fee_status();
  if r ->> 'next_due_on' is distinct from (current_date + 5)::text or (r ->> 'next_amount')::numeric is distinct from 200::numeric then
    raise exception 'FALHOU fee_status_proximo_pagamento: mês aberto next_due_on=%, next_amount=%', r ->> 'next_due_on', r ->> 'next_amount';
  end if;
  -- Sem mês aberto: o próximo vence quando o último acaba, e vale o preço da regra (depois de grátis e um pago, standard).
  de := pg_temp.mk_driver('Motorista Proximo', 'AST0006', '45317828791', 'approved');
  insert into public.driver_fee_periods (driver_id, period_start, period_end, kind, amount, status, due_on)
  values (de, current_date - 40, current_date - 10, 'free', 0, 'waived', current_date - 40),
         (de, current_date - 10, current_date + 20, 'entry', 200, 'paid', current_date - 10);
  perform set_config('request.jwt.claims', json_build_object('sub', de)::text, true);
  r := public.my_fee_status();
  if r ->> 'next_due_on' is distinct from (current_date + 20)::text
     or (r ->> 'next_amount')::numeric is distinct from coalesce(private.fee_amount('car', 'standard', current_date + 20), 0) then
    raise exception 'FALHOU fee_status_proximo_pagamento: sem mês aberto next_due_on=%, next_amount=%', r ->> 'next_due_on', r ->> 'next_amount';
  end if;
  insert into public.zz_fx values ('ok:fee_status_proximo_pagamento', '1');
end $t$;

do $t$
begin
  raise exception 'RESULTADO: % de 9 testes OK (esta mensagem é esperada e desfaz tudo): %',
    (select count(*) from public.zz_fx where k like 'ok:%'),
    (select string_agg(substr(k, 4), ', ' order by k) from public.zz_fx where k like 'ok:%');
end $t$;

rollback;
