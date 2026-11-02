-- Testes da exclusão de conta pelo painel.
-- Rode inteiro no SQL Editor do Supabase DEPOIS de aplicar a migration 20261105000000.
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

create function pg_temp.as_user(p_user uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user)::text, true);
end $f$;

-- Personagens: ST (equipe), P1 (passageiro com foto), P2 (passageiro comum), DR (motorista com CPF).
do $t$
declare st uuid; p1 uuid; p2 uuid; dr uuid;
begin
  st := pg_temp.mk_user('Equipe Teste');
  p1 := pg_temp.mk_user('Passageiro Um');
  p2 := pg_temp.mk_user('Passageiro Dois');
  dr := pg_temp.mk_user('Motorista Teste');
  insert into public.staff (user_id) values (st);
  update public.profiles set photo_path = p1::text || '/avatar.jpg' where id = p1;
  update public.profiles set photo_path = p2::text || '/avatar.jpg' where id = p2;
  insert into public.drivers (id, city_id, status, vehicle_type, vehicle_model, vehicle_color, vehicle_plate, vehicle_year, is_online)
  values (dr, (select id from public.cities where name = 'Guaraciaba do Norte'), 'approved', 'car', 'Uno', 'Branco', 'DEL0001', 2020, true);
  insert into public.driver_private (driver_id, cpf, birth_date, cnh_category, cnh_ear)
  values (dr, '52998224725', date '1990-01-01', 'B', true);
  insert into public.zz_fx values ('st', st::text), ('p1', p1::text), ('p2', p2::text), ('dr', dr::text);
end $t$;

-- equipe_exclui_passageiro: nome, telefone e foto saem, login bloqueado, devolve o caminho da foto
do $t$
declare st uuid := (select v::uuid from public.zz_fx where k = 'st');
        p1 uuid := (select v::uuid from public.zz_fx where k = 'p1');
        r text; pr public.profiles; u auth.users;
begin
  perform pg_temp.as_user(st);
  r := public.staff_delete_account(p1);
  if r is distinct from p1::text || '/avatar.jpg' then
    raise exception 'FALHOU equipe_exclui_passageiro: devolveu % em vez do caminho da foto', r;
  end if;
  select * into pr from public.profiles where id = p1;
  if pr.full_name <> 'Conta excluída' or pr.phone is not null or pr.photo_path is not null or pr.deleted_at is null then
    raise exception 'FALHOU equipe_exclui_passageiro: perfil ficou com nome=%, phone=%, foto=%, deleted_at=%', pr.full_name, pr.phone, pr.photo_path, pr.deleted_at;
  end if;
  select * into u from auth.users where id = p1;
  if u.phone is not null or u.banned_until is null then
    raise exception 'FALHOU equipe_exclui_passageiro: login ficou com phone=% banned_until=%', u.phone, u.banned_until;
  end if;
  insert into public.zz_fx values ('ok:equipe_exclui_passageiro', '1');
end $t$;

-- excluir_duas_vezes: a segunda tentativa dá erro em português
do $t$
declare st uuid := (select v::uuid from public.zz_fx where k = 'st');
        p1 uuid := (select v::uuid from public.zz_fx where k = 'p1');
begin
  perform pg_temp.as_user(st);
  begin
    perform public.staff_delete_account(p1);
    raise exception 'FALHOU excluir_duas_vezes: excluiu de novo sem erro';
  exception when others then
    if sqlerrm <> 'Essa conta já foi excluída' then raise exception 'FALHOU excluir_duas_vezes: erro %', sqlerrm; end if;
  end;
  insert into public.zz_fx values ('ok:excluir_duas_vezes', '1');
end $t$;

-- so_equipe_exclui: passageiro comum não exclui ninguém
do $t$
declare p2 uuid := (select v::uuid from public.zz_fx where k = 'p2');
        dr uuid := (select v::uuid from public.zz_fx where k = 'dr');
begin
  perform pg_temp.as_user(p2);
  begin
    perform public.staff_delete_account(dr);
    raise exception 'FALHOU so_equipe_exclui: passageiro excluiu uma conta';
  exception when others then
    if sqlerrm <> 'Acesso só para a equipe' then raise exception 'FALHOU so_equipe_exclui: erro %', sqlerrm; end if;
  end;
  insert into public.zz_fx values ('ok:so_equipe_exclui', '1');
end $t$;

-- nao_exclui_equipe_nem_a_si: a equipe não exclui a si mesma nem outra pessoa da equipe
do $t$
declare st uuid := (select v::uuid from public.zz_fx where k = 'st');
        st2 uuid := pg_temp.mk_user('Equipe Dois');
begin
  insert into public.staff (user_id) values (st2);
  perform pg_temp.as_user(st);
  begin
    perform public.staff_delete_account(st);
    raise exception 'FALHOU nao_exclui_equipe_nem_a_si: excluiu a si mesma';
  exception when others then
    if sqlerrm <> 'Você não pode excluir a sua própria conta por aqui' then raise exception 'FALHOU nao_exclui_equipe_nem_a_si: erro %', sqlerrm; end if;
  end;
  begin
    perform public.staff_delete_account(st2);
    raise exception 'FALHOU nao_exclui_equipe_nem_a_si: excluiu outra pessoa da equipe';
  exception when others then
    if sqlerrm <> 'Contas da equipe não podem ser excluídas por aqui' then raise exception 'FALHOU nao_exclui_equipe_nem_a_si: erro %', sqlerrm; end if;
  end;
  insert into public.zz_fx values ('ok:nao_exclui_equipe_nem_a_si', '1');
end $t$;

-- corrida_em_andamento_bloqueia: não exclui quem está numa corrida em andamento
do $t$
declare st uuid := (select v::uuid from public.zz_fx where k = 'st');
        p2 uuid := (select v::uuid from public.zz_fx where k = 'p2');
        dr uuid := (select v::uuid from public.zz_fx where k = 'dr');
begin
  insert into public.rides (passenger_id, driver_id, city_id, vehicle_type, status, payment_method,
                            origin, origin_address, destination, destination_address, estimated_price)
  values (p2, dr, (select id from public.cities where name = 'Guaraciaba do Norte'), 'car', 'in_progress', 'cash',
          extensions.st_setsrid(extensions.st_makepoint(-40.7475, -4.1670), 4326)::extensions.geography, 'Origem teste',
          extensions.st_setsrid(extensions.st_makepoint(-40.7400, -4.1600), 4326)::extensions.geography, 'Destino teste', 20);
  perform pg_temp.as_user(st);
  begin
    perform public.staff_delete_account(p2);
    raise exception 'FALHOU corrida_em_andamento_bloqueia: excluiu passageiro em corrida';
  exception when others then
    if sqlerrm not like 'Essa conta tem uma corrida em andamento%' then raise exception 'FALHOU corrida_em_andamento_bloqueia: erro %', sqlerrm; end if;
  end;
  if (select deleted_at from public.profiles where id = p2) is not null then
    raise exception 'FALHOU corrida_em_andamento_bloqueia: o perfil foi alterado mesmo com o erro';
  end if;
  update public.rides set status = 'completed' where passenger_id = p2;
  insert into public.zz_fx values ('ok:corrida_em_andamento_bloqueia', '1');
end $t$;

-- motorista_guarda_hash_do_cpf: motorista excluído fica bloqueado, sem CPF, com o hash guardado
do $t$
declare st uuid := (select v::uuid from public.zz_fx where k = 'st');
        dr uuid := (select v::uuid from public.zz_fx where k = 'dr');
begin
  perform pg_temp.as_user(st);
  perform public.staff_delete_account(dr);
  if (select status from public.drivers where id = dr) <> 'blocked' or (select is_online from public.drivers where id = dr) then
    raise exception 'FALHOU motorista_guarda_hash_do_cpf: motorista não ficou bloqueado e offline';
  end if;
  if exists (select 1 from public.driver_private where driver_id = dr) then
    raise exception 'FALHOU motorista_guarda_hash_do_cpf: o CPF continua guardado';
  end if;
  if not exists (select 1 from public.deleted_driver_cpfs where cpf_hash = private.cpf_hash('52998224725')) then
    raise exception 'FALHOU motorista_guarda_hash_do_cpf: o hash do CPF não foi guardado';
  end if;
  insert into public.zz_fx values ('ok:motorista_guarda_hash_do_cpf', '1');
end $t$;

-- propria_exclusao_continua_valendo: delete_my_account segue funcionando e limpa o caminho da foto
do $t$
declare p2 uuid := (select v::uuid from public.zz_fx where k = 'p2');
begin
  perform pg_temp.as_user(p2);
  perform public.delete_my_account();
  if (select full_name from public.profiles where id = p2) <> 'Conta excluída'
     or (select photo_path from public.profiles where id = p2) is not null then
    raise exception 'FALHOU propria_exclusao_continua_valendo: nome=% foto=%', (select full_name from public.profiles where id = p2), (select photo_path from public.profiles where id = p2);
  end if;
  insert into public.zz_fx values ('ok:propria_exclusao_continua_valendo', '1');
end $t$;

do $t$
begin
  raise exception 'RESULTADO: % de 7 testes OK (esta mensagem é esperada e desfaz tudo): %',
    (select count(*) from public.zz_fx where k like 'ok:%'),
    (select string_agg(substr(k, 4), ', ' order by k) from public.zz_fx where k like 'ok:%');
end $t$;

rollback;
