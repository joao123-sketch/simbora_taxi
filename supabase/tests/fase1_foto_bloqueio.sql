-- Testes da fase 1 (foto do passageiro, bloqueio, painel de fotos).
-- Rode inteiro no SQL Editor do Supabase DEPOIS de aplicar as 3 migrations
-- 20261103000000, 20261103010000 e 20261103020000. Antes delas, falha (é o esperado).
-- Tudo acontece dentro de uma transação e termina em ROLLBACK: não sobra nada no banco.
-- Cada teste imprime "OK <nome>" nas mensagens (aba "Mensagens" do editor) ou levanta erro.

begin;

-- As travas de cadastro e aprovação de motorista não interessam aqui.
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

create function pg_temp.mk_driver(p_name text, p_plate text) returns uuid language plpgsql as $f$
declare v uuid := pg_temp.mk_user(p_name);
begin
  insert into public.drivers (id, city_id, status, vehicle_type, vehicle_model, vehicle_color, vehicle_plate, vehicle_year, is_online)
  values (v, (select id from public.cities where name = 'Guaraciaba do Norte'), 'approved', 'car', 'Uno', 'Branco', p_plate, 2020, true);
  return v;
end $f$;

create function pg_temp.mk_ride(p_passenger uuid, p_driver uuid, p_status public.ride_status, p_rider text, p_scheduled timestamptz, p_dest_city text)
returns bigint language plpgsql as $f$
declare v bigint;
begin
  insert into public.rides (passenger_id, driver_id, city_id, destination_city_id, vehicle_type, status, payment_method,
                            origin, origin_address, destination, destination_address, estimated_price, rider_name, scheduled_for)
  values (p_passenger, p_driver, (select id from public.cities where name = 'Guaraciaba do Norte'),
          (select id from public.cities where name = p_dest_city),
          'car', p_status, 'cash',
          extensions.st_setsrid(extensions.st_makepoint(-40.7475, -4.1670), 4326)::extensions.geography, 'Origem teste',
          extensions.st_setsrid(extensions.st_makepoint(-40.7400, -4.1600), 4326)::extensions.geography, 'Destino teste',
          20, p_rider, p_scheduled)
  returning id into v;
  return v;
end $f$;

-- Personagens: P (com foto, pedido aberto para D1), P2 (com foto, corrida aceita por D2),
-- PS (com foto, viagem agendada: aparece para todo motorista elegível, por desenho),
-- Q (sem foto), D1 e D2 (motoristas online).
do $t$
declare p uuid; p2 uuid; ps uuid; q uuid; d1 uuid; d2 uuid; r1 bigint; r2 bigint; r3 bigint; r4 bigint;
begin
  p := pg_temp.mk_user('Ana Souza Lima');
  p2 := pg_temp.mk_user('Bruno Alves Costa');
  ps := pg_temp.mk_user('Sara Agendada Rocha');
  q := pg_temp.mk_user('Carla Sem Foto');
  d1 := pg_temp.mk_driver('Motorista Um', 'TST0001');
  d2 := pg_temp.mk_driver('Motorista Dois', 'TST0002');

  -- foto_pedido_sem_foto_recusado
  begin
    perform pg_temp.mk_ride(q, null, 'requested', null, null, 'Tianguá');
    raise exception 'FALHOU foto_pedido_sem_foto_recusado: o pedido sem foto foi aceito';
  exception when others then
    if sqlerrm <> 'Tire a sua foto antes de pedir uma corrida' then
      raise exception 'FALHOU foto_pedido_sem_foto_recusado: erro inesperado: %', sqlerrm;
    end if;
  end;
  raise notice 'OK foto_pedido_sem_foto_recusado';

  update public.profiles set photo_path = p::text || '/avatar.jpg' where id = p;
  update public.profiles set photo_path = p2::text || '/avatar.jpg' where id = p2;
  update public.profiles set photo_path = ps::text || '/avatar.jpg' where id = ps;

  -- foto_pedido_com_foto_aceito
  r1 := pg_temp.mk_ride(p, null, 'requested', null, null, 'Tianguá');
  raise notice 'OK foto_pedido_com_foto_aceito';

  r2 := pg_temp.mk_ride(p2, d2, 'accepted', null, null, 'Tianguá');
  r3 := pg_temp.mk_ride(p, null, 'requested', 'Maria da Silva', null, 'Tianguá');
  r4 := pg_temp.mk_ride(ps, null, 'requested', null, now() + interval '3 hours', 'Tianguá');

  insert into public.ride_offers (ride_id, driver_id, rank, visible_from) values (r1, d1, 1, now() - interval '1 minute');
  insert into public.ride_offers (ride_id, driver_id, rank, visible_from) values (r3, d1, 1, now() - interval '1 minute');

  insert into public.zz_fx values ('p', p::text), ('p2', p2::text), ('q', q::text), ('d1', d1::text), ('d2', d2::text),
    ('r1', r1::text), ('r2', r2::text), ('r3', r3::text), ('r4', r4::text);
end $t$;

-- foto_motorista_ve_foto_com_oferta e foto_motorista_ve_foto_na_corrida_aceita
do $t$
declare p uuid := (select v::uuid from public.zz_fx where k = 'p');
        p2 uuid := (select v::uuid from public.zz_fx where k = 'p2');
        d1 uuid := (select v::uuid from public.zz_fx where k = 'd1');
        d2 uuid := (select v::uuid from public.zz_fx where k = 'd2');
        r2 bigint := (select v::bigint from public.zz_fx where k = 'r2');
begin
  perform set_config('request.jwt.claims', json_build_object('sub', d1)::text, true);
  if not private.driver_can_see_photo(p) then raise exception 'FALHOU foto_motorista_ve_foto_com_oferta: D1 deveria ver a foto de P'; end if;
  if private.driver_can_see_photo(p2) then raise exception 'FALHOU foto_motorista_ve_foto_com_oferta: D1 não deveria ver a foto de P2'; end if;
  raise notice 'OK foto_motorista_ve_foto_com_oferta';

  perform set_config('request.jwt.claims', json_build_object('sub', d2)::text, true);
  if not private.driver_can_see_photo(p2) then raise exception 'FALHOU foto_motorista_ve_foto_na_corrida_aceita: D2 deveria ver a foto de P2'; end if;
  if private.driver_can_see_photo(p) then raise exception 'FALHOU foto_motorista_ve_foto_na_corrida_aceita: D2 não deveria ver a foto de P'; end if;
  update public.rides set status = 'completed', completed_at = now() where id = r2;
  if private.driver_can_see_photo(p2) then raise exception 'FALHOU foto_motorista_ve_foto_na_corrida_aceita: depois de concluída não deveria ver'; end if;
  raise notice 'OK foto_motorista_ve_foto_na_corrida_aceita';
end $t$;

-- foto_motorista_le_perfil_do_pedido (precisa do papel authenticated, para valer a RLS)
do $t$
declare p uuid := (select v::uuid from public.zz_fx where k = 'p');
        q uuid := (select v::uuid from public.zz_fx where k = 'q');
        d1 uuid := (select v::uuid from public.zz_fx where k = 'd1');
        d2 uuid := (select v::uuid from public.zz_fx where k = 'd2');
        n int;
        nome text;
        foto text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', d1)::text, true);
  execute 'set local role authenticated';
  select full_name, photo_path into nome, foto from public.profiles where id = p;
  if nome is distinct from 'Ana Souza Lima' or foto is null then
    execute 'reset role';
    raise exception 'FALHOU foto_motorista_le_perfil_do_pedido: D1 não leu nome e foto de P (nome=%, foto=%)', nome, foto;
  end if;
  select count(*) into n from public.profiles where id = q;
  execute 'reset role';
  if n <> 0 then raise exception 'FALHOU foto_motorista_le_perfil_do_pedido: D1 leu o perfil de Q, sem relação'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', d2)::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.profiles where id = p;
  execute 'reset role';
  if n <> 0 then raise exception 'FALHOU foto_motorista_le_perfil_do_pedido: D2 leu o perfil de P, sem relação'; end if;
  raise notice 'OK foto_motorista_le_perfil_do_pedido';
end $t$;

-- foto_ride_details_outra_pessoa
do $t$
declare p uuid := (select v::uuid from public.zz_fx where k = 'p');
        d1 uuid := (select v::uuid from public.zz_fx where k = 'd1');
        r3 bigint := (select v::bigint from public.zz_fx where k = 'r3');
        nome text; foto text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', d1)::text, true);
  execute 'set local role authenticated';
  select passenger_name, passenger_photo_path into nome, foto from public.ride_details where id = r3;
  execute 'reset role';
  if nome is distinct from 'Maria da Silva' then raise exception 'FALHOU foto_ride_details_outra_pessoa: passenger_name=%', nome; end if;
  if foto is distinct from p::text || '/avatar.jpg' then raise exception 'FALHOU foto_ride_details_outra_pessoa: foto=%', foto; end if;
  raise notice 'OK foto_ride_details_outra_pessoa';
end $t$;

-- foto_agendadas_nome_completo
do $t$
declare d1 uuid := (select v::uuid from public.zz_fx where k = 'd1');
        r4 bigint := (select v::bigint from public.zz_fx where k = 'r4');
        nome text; foto text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', d1)::text, true);
  select passenger_name, passenger_photo_path into nome, foto from public.open_scheduled_rides() where ride_id = r4;
  if nome is distinct from 'Sara Agendada Rocha' then raise exception 'FALHOU foto_agendadas_nome_completo: passenger_name=%', nome; end if;
  if foto is null then raise exception 'FALHOU foto_agendadas_nome_completo: sem foto'; end if;
  raise notice 'OK foto_agendadas_nome_completo';
end $t$;


-- ===========================================================================
-- Bloqueio de passageiro
-- Personagens novos: Pb (com foto) pede; D3 e D4 são motoristas online (D3 vê o pedido
-- agora, D4 só depois da espera da onda); D5 não tem relação com o pedido.
-- ===========================================================================

do $t$
declare pb uuid; d3 uuid; d4 uuid; d5 uuid; rb1 bigint;
begin
  pb := pg_temp.mk_user('Paulo Bloqueado Neto');
  update public.profiles set photo_path = pb::text || '/avatar.jpg' where id = pb;
  d3 := pg_temp.mk_driver('Motorista Tres', 'TST0003');
  d4 := pg_temp.mk_driver('Motorista Quatro', 'TST0004');
  d5 := pg_temp.mk_driver('Motorista Cinco', 'TST0005');
  rb1 := pg_temp.mk_ride(pb, null, 'requested', null, null, 'Tianguá');
  insert into public.ride_offers (ride_id, driver_id, rank, visible_from) values (rb1, d3, 1, now() - interval '1 minute');
  insert into public.ride_offers (ride_id, driver_id, rank, visible_from) values (rb1, d4, 2, now() + interval '15 seconds');
  insert into public.zz_fx values ('pb', pb::text), ('d3', d3::text), ('d4', d4::text), ('d5', d5::text), ('rb1', rb1::text);
end $t$;

-- bloqueio_recusa_sem_relacao
do $t$
declare d5 uuid := (select v::uuid from public.zz_fx where k = 'd5');
        rb1 bigint := (select v::bigint from public.zz_fx where k = 'rb1');
begin
  perform set_config('request.jwt.claims', json_build_object('sub', d5)::text, true);
  begin
    perform public.block_passenger(rb1);
    raise exception 'FALHOU bloqueio_recusa_sem_relacao: D5 conseguiu bloquear sem relação';
  exception when others then
    if sqlerrm <> 'Pedido indisponível' then
      raise exception 'FALHOU bloqueio_recusa_sem_relacao: erro inesperado: %', sqlerrm;
    end if;
  end;
  raise notice 'OK bloqueio_recusa_sem_relacao';
end $t$;

-- bloqueio_cria_e_lista, bloqueio_oferta_aberta_some e bloqueio_isolado
do $t$
declare pb uuid := (select v::uuid from public.zz_fx where k = 'pb');
        d3 uuid := (select v::uuid from public.zz_fx where k = 'd3');
        d4 uuid := (select v::uuid from public.zz_fx where k = 'd4');
        rb1 bigint := (select v::bigint from public.zz_fx where k = 'rb1');
        nome text; foto text; n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', d3)::text, true);
  if not private.can_see_offer(rb1) then raise exception 'FALHOU preparo: D3 deveria ver a oferta antes de bloquear'; end if;
  perform public.block_passenger(rb1);

  select full_name, photo_path into nome, foto from public.my_blocked_passengers() where passenger_id = pb;
  if nome is distinct from 'Paulo Bloqueado Neto' or foto is null then
    raise exception 'FALHOU bloqueio_cria_e_lista: nome=%, foto=%', nome, foto;
  end if;
  raise notice 'OK bloqueio_cria_e_lista';

  if private.can_see_offer(rb1) then raise exception 'FALHOU bloqueio_oferta_aberta_some: D3 ainda vê a oferta'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', d4)::text, true);
  if not private.can_see_offer(rb1) then raise exception 'FALHOU bloqueio_oferta_aberta_some: a onda não seguiu para D4'; end if;
  raise notice 'OK bloqueio_oferta_aberta_some';

  select count(*) into n from public.my_blocked_passengers();
  if n <> 0 then raise exception 'FALHOU bloqueio_isolado: o bloqueio de D3 apareceu para D4'; end if;
  raise notice 'OK bloqueio_isolado';
end $t$;

-- bloqueio_despacho_pula e bloqueio_agendadas
do $t$
declare pb uuid := (select v::uuid from public.zz_fx where k = 'pb');
        d3 uuid := (select v::uuid from public.zz_fx where k = 'd3');
        d4 uuid := (select v::uuid from public.zz_fx where k = 'd4');
        rb2 bigint; rb3 bigint; n3 int; n4 int;
begin
  rb2 := pg_temp.mk_ride(pb, null, 'requested', null, null, null);
  perform private.dispatch_ride(rb2);
  select count(*) into n3 from public.ride_offers where ride_id = rb2 and driver_id = d3;
  select count(*) into n4 from public.ride_offers where ride_id = rb2 and driver_id = d4;
  if n3 <> 0 then raise exception 'FALHOU bloqueio_despacho_pula: o despacho ofereceu a D3, que bloqueou Pb'; end if;
  if n4 <> 1 then raise exception 'FALHOU bloqueio_despacho_pula: o despacho não ofereceu a D4 (n=%)', n4; end if;
  raise notice 'OK bloqueio_despacho_pula';

  rb3 := pg_temp.mk_ride(pb, null, 'requested', null, now() + interval '3 hours', 'Tianguá');
  perform set_config('request.jwt.claims', json_build_object('sub', d3)::text, true);
  select count(*) into n3 from public.open_scheduled_rides() where ride_id = rb3;
  perform set_config('request.jwt.claims', json_build_object('sub', d4)::text, true);
  select count(*) into n4 from public.open_scheduled_rides() where ride_id = rb3;
  if n3 <> 0 then raise exception 'FALHOU bloqueio_agendadas: D3 ainda vê a viagem agendada de Pb'; end if;
  if n4 <> 1 then raise exception 'FALHOU bloqueio_agendadas: D4 não vê a viagem agendada de Pb'; end if;
  raise notice 'OK bloqueio_agendadas';
end $t$;

-- bloqueio_desbloqueia
do $t$
declare pb uuid := (select v::uuid from public.zz_fx where k = 'pb');
        d3 uuid := (select v::uuid from public.zz_fx where k = 'd3');
        rb4 bigint; n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', d3)::text, true);
  perform public.unblock_passenger(pb);
  select count(*) into n from public.my_blocked_passengers();
  if n <> 0 then raise exception 'FALHOU bloqueio_desbloqueia: ainda aparece na lista'; end if;
  rb4 := pg_temp.mk_ride(pb, null, 'requested', null, null, null);
  perform private.dispatch_ride(rb4);
  select count(*) into n from public.ride_offers where ride_id = rb4 and driver_id = d3;
  if n <> 1 then raise exception 'FALHOU bloqueio_desbloqueia: D3 não voltou a receber o pedido de Pb'; end if;
  raise notice 'OK bloqueio_desbloqueia';
end $t$;


-- ===========================================================================
-- Painel: busca de passageiro e registro de quem viu a foto
-- ===========================================================================

do $t$
declare st uuid; pb uuid := (select v::uuid from public.zz_fx where k = 'pb');
        d3 uuid := (select v::uuid from public.zz_fx where k = 'd3');
        nome text; n int; viewer uuid;
begin
  st := pg_temp.mk_user('Equipe Teste');
  insert into public.staff (user_id) values (st);

  -- painel_busca_so_equipe
  perform set_config('request.jwt.claims', json_build_object('sub', d3)::text, true);
  begin
    perform * from public.staff_find_passenger('Paulo');
    raise exception 'FALHOU painel_busca_so_equipe: um motorista conseguiu buscar passageiros';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
  end;
  begin
    perform public.staff_log_photo_view(pb);
    raise exception 'FALHOU painel_busca_so_equipe: um motorista conseguiu registrar visualização';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
  end;
  raise notice 'OK painel_busca_so_equipe';

  -- painel_busca_por_nome_ou_telefone
  perform set_config('request.jwt.claims', json_build_object('sub', st)::text, true);
  select full_name into nome from public.staff_find_passenger('Bloqueado');
  if nome is distinct from 'Paulo Bloqueado Neto' then raise exception 'FALHOU painel_busca_por_nome_ou_telefone: busca por nome devolveu %', nome; end if;
  select count(*) into n from public.staff_find_passenger((select right(phone, 6) from public.profiles where id = pb));
  if n < 1 then raise exception 'FALHOU painel_busca_por_nome_ou_telefone: busca por telefone não achou'; end if;
  raise notice 'OK painel_busca_por_nome_ou_telefone';

  -- painel_log_registra
  perform public.staff_log_photo_view(pb);
  select staff_id into viewer from public.photo_views where passenger_id = pb order by id desc limit 1;
  if viewer is distinct from st then raise exception 'FALHOU painel_log_registra: staff_id=%', viewer; end if;
  raise notice 'OK painel_log_registra';
end $t$;

rollback;

