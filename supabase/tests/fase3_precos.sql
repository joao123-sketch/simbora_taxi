-- Testes da fase 3 (preços: sem mínimo, noturno com teto, pares simétricos, cidades).
-- Rode inteiro no SQL Editor do Supabase DEPOIS de aplicar a migration 20261104000000.
-- Antes dela, falha (é o esperado). Tudo acontece numa transação que termina desfeita:
-- o resultado aparece como um "erro" que começa com RESULTADO (é de propósito).

begin;

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

-- Personagens: ST (equipe) e PS (passageiro comum).
do $t$
declare st uuid; ps uuid;
begin
  st := pg_temp.mk_user('Equipe Teste');
  ps := pg_temp.mk_user('Passageiro Teste');
  insert into public.staff (user_id) values (st);
  insert into public.zz_fx values ('st', st::text), ('ps', ps::text);
end $t$;

-- noturno_janela: 22:00 a 05:59 em Fortaleza
do $t$
begin
  if not private.night_applies(timestamptz '2026-11-02 22:00-03')
     or not private.night_applies(timestamptz '2026-11-03 05:59-03')
     or not private.night_applies(timestamptz '2026-11-03 00:30-03') then
    raise exception 'FALHOU noturno_janela: 22:00, 00:30 e 05:59 deveriam ser noturno';
  end if;
  if private.night_applies(timestamptz '2026-11-03 06:00-03')
     or private.night_applies(timestamptz '2026-11-02 21:59-03')
     or private.night_applies(timestamptz '2026-11-02 12:00-03') then
    raise exception 'FALHOU noturno_janela: 06:00, 21:59 e 12:00 não deveriam ser noturno';
  end if;
  insert into public.zz_fx values ('ok:noturno_janela', '1');
end $t$;

-- fator_noturno_e_teto: 1,00 -> 1,20 à noite; 1,40 -> teto 1,50; 1,50 -> 1,50; dia fica no fator
do $t$
declare c bigint := (select id from public.cities where name = 'Guaraciaba do Norte');
        night timestamptz := timestamptz '2026-11-02 23:00-03';
        day timestamptz := timestamptz '2026-11-02 12:00-03';
begin
  update public.pricing_settings set locked = true, locked_factor = 1.00 where id = 1;
  if private.pricing_factor(c, 'car', night) is distinct from 1.20::numeric
     or private.pricing_factor(c, 'car', day) is distinct from 1.00::numeric then
    raise exception 'FALHOU fator_noturno_e_teto: fator 1,00 deu noite=% dia=%', private.pricing_factor(c, 'car', night), private.pricing_factor(c, 'car', day);
  end if;
  update public.pricing_settings set locked_factor = 1.40 where id = 1;
  if private.pricing_factor(c, 'car', night) is distinct from 1.50::numeric
     or private.pricing_factor(c, 'car', day) is distinct from 1.40::numeric then
    raise exception 'FALHOU fator_noturno_e_teto: fator 1,40 deu noite=% dia=%', private.pricing_factor(c, 'car', night), private.pricing_factor(c, 'car', day);
  end if;
  update public.pricing_settings set locked_factor = 1.50 where id = 1;
  if private.pricing_factor(c, 'car', night) is distinct from 1.50::numeric then
    raise exception 'FALHOU fator_noturno_e_teto: fator travado 1,50 deu % à noite', private.pricing_factor(c, 'car', night);
  end if;
  insert into public.zz_fx values ('ok:fator_noturno_e_teto', '1');
end $t$;

-- tarifa_sem_minimo: carro 8 + 2,20/km + 0,30/min, moto 5 + 1,40/km + 0,20/min, sem piso
do $t$
declare c bigint := (select id from public.cities where name = 'Guaraciaba do Norte');
        o extensions.geography := private.point(-40.7475, -4.1670);
        d extensions.geography := private.point(-40.7475, -4.0770);
        near extensions.geography := private.point(-40.7475, -4.1661);
        r record;
begin
  select * into r from private.ride_quote(c, 'car', o, d, null);
  if r.price is distinct from round(8 + 2.20 * r.distance_km + 0.30 * (r.distance_km / 30 * 60), 2) then
    raise exception 'FALHOU tarifa_sem_minimo: carro % km deu %', r.distance_km, r.price;
  end if;
  select * into r from private.ride_quote(c, 'moto', o, d, null);
  if r.price is distinct from round(5 + 1.40 * r.distance_km + 0.20 * (r.distance_km / 30 * 60), 2) then
    raise exception 'FALHOU tarifa_sem_minimo: moto % km deu %', r.distance_km, r.price;
  end if;
  select * into r from private.ride_quote(c, 'car', o, near, null);
  if r.price >= 10 or r.price < 8 then
    raise exception 'FALHOU tarifa_sem_minimo: corrida de % km deu % (sem piso deveria ficar entre 8 e 10)', r.distance_km, r.price;
  end if;
  insert into public.zz_fx values ('ok:tarifa_sem_minimo', '1');
end $t$;

-- entrega_sem_noturno: quote_delivery segue ride_quote x fator dinâmico x (1 - desconto), sem noturno
do $t$
declare c bigint := (select id from public.cities where name = 'Guaraciaba do Norte');
        o extensions.geography := private.point(-40.7475, -4.1670);
        d extensions.geography := private.point(-40.7475, -4.0770);
        ps uuid := (select v::uuid from public.zz_fx where k = 'ps');
        base numeric; q record; n int := 0;
begin
  update public.pricing_settings set locked = true, locked_factor = 1.00 where id = 1;
  perform pg_temp.as_user(ps);
  for q in select * from public.quote_delivery(c, -40.7475, -4.1670, -40.7475, -4.0770, 'P') loop
    select r.price into base from private.ride_quote(c, q.vehicle_type, o, d, null) r;
    if q.price is distinct from round(base * 1.00 * (1 - private.delivery_discount()), 2) then
      raise exception 'FALHOU entrega_sem_noturno: % deu % (esperado % sem noturno)', q.vehicle_type, q.price, round(base * (1 - private.delivery_discount()), 2);
    end if;
    n := n + 1;
  end loop;
  if n = 0 then raise exception 'FALHOU entrega_sem_noturno: nenhuma cotação de entrega'; end if;
  insert into public.zz_fx values ('ok:entrega_sem_noturno', '1');
end $t$;

-- pares_simetricos: preço único por par, igual nos dois sentidos
do $t$
declare g bigint := (select id from public.cities where name = 'Guaraciaba do Norte');
        u bigint := (select id from public.cities where name = 'Ubajara');
        tg bigint := (select id from public.cities where name = 'Tianguá');
        sb bigint := (select id from public.cities where name = 'São Benedito');
        st uuid := (select v::uuid from public.zz_fx where k = 'st');
        o extensions.geography := private.point(-40.7475, -4.1670);
        d extensions.geography := private.point(-40.9210, -3.8545);
        a numeric; b numeric; pair record;
begin
  for pair in select * from (values (u, 'car', 90.00), (u, 'moto', 55.00), (tg, 'car', 115.00), (tg, 'moto', 70.00)) v (city, veh, price) loop
    select f.price into a from public.intercity_fares f where f.origin_city_id = g and f.destination_city_id = pair.city and f.vehicle_type = pair.veh::public.vehicle_type;
    select f.price into b from public.intercity_fares f where f.origin_city_id = pair.city and f.destination_city_id = g and f.vehicle_type = pair.veh::public.vehicle_type;
    if a is distinct from pair.price or b is distinct from pair.price then
      raise exception 'FALHOU pares_simetricos: par % % ida=% volta=% (esperado %)', pair.city, pair.veh, a, b, pair.price;
    end if;
  end loop;

  -- São Benedito mantém o preço que já existia, só precisa ser igual nos dois sentidos.
  for pair in select * from (values ('car'), ('moto')) v (veh) loop
    select f.price into a from public.intercity_fares f where f.origin_city_id = g and f.destination_city_id = sb and f.vehicle_type = pair.veh::public.vehicle_type;
    select f.price into b from public.intercity_fares f where f.origin_city_id = sb and f.destination_city_id = g and f.vehicle_type = pair.veh::public.vehicle_type;
    if a is null or a is distinct from b then
      raise exception 'FALHOU pares_simetricos: São Benedito % ida=% volta=%', pair.veh, a, b;
    end if;
  end loop;

  perform pg_temp.as_user(st);
  perform public.staff_set_intercity_price(g, u, 'car', 77);
  select r.price into a from private.ride_quote(g, 'car', o, d, u) r;
  select r.price into b from private.ride_quote(u, 'car', d, o, g) r;
  if a is distinct from 77::numeric or b is distinct from 77::numeric then
    raise exception 'FALHOU pares_simetricos: após salvar 77, ida=% volta=%', a, b;
  end if;
  insert into public.zz_fx values ('ok:pares_simetricos', '1');
end $t$;

-- par_remover: apaga os dois sentidos e os dois veículos
do $t$
declare g bigint := (select id from public.cities where name = 'Guaraciaba do Norte');
        u bigint := (select id from public.cities where name = 'Ubajara');
        st uuid := (select v::uuid from public.zz_fx where k = 'st');
        n int;
begin
  perform pg_temp.as_user(st);
  perform public.staff_delete_intercity_pair(g, u);
  select count(*) into n from public.intercity_fares f
  where (f.origin_city_id = g and f.destination_city_id = u) or (f.origin_city_id = u and f.destination_city_id = g);
  if n <> 0 then raise exception 'FALHOU par_remover: sobraram % linhas', n; end if;
  insert into public.zz_fx values ('ok:par_remover', '1');
end $t$;

-- cidades: adicionar nasce desativada, ativar exige tarifa
do $t$
declare st uuid := (select v::uuid from public.zz_fx where k = 'st');
        cid bigint;
begin
  perform pg_temp.as_user(st);
  cid := public.staff_add_city('Cidade Teste', 'CE', -4.0, -40.8);
  if (select active from public.cities where cities.id = cid) then
    raise exception 'FALHOU cidades: cidade nova nasceu ativa';
  end if;
  begin
    perform public.staff_set_city_active(cid, true);
    raise exception 'FALHOU cidades: ativou cidade sem tarifa';
  exception when others then
    if sqlerrm not like '%tarifa%' or sqlerrm like 'FALHOU%' then raise exception 'FALHOU cidades: erro inesperado %', sqlerrm; end if;
  end;
  perform public.staff_add_fare(cid, 'car', 8, 2.2, 0.3, current_date);
  perform public.staff_set_city_active(cid, true);
  if not (select active from public.cities where cities.id = cid) then
    raise exception 'FALHOU cidades: não ativou com tarifa';
  end if;
  insert into public.zz_fx values ('ok:cidades', '1');
end $t$;

-- painel_sem_minimo_e_com_noturno: visão geral sem minimum e com as configurações novas
do $t$
declare st uuid := (select v::uuid from public.zz_fx where k = 'st');
        r jsonb; s jsonb;
begin
  perform pg_temp.as_user(st);
  r := public.staff_pricing_overview();
  if r -> 'fares' -> 0 ? 'minimum' then
    raise exception 'FALHOU painel_sem_minimo_e_com_noturno: fares ainda traz minimum';
  end if;
  s := r -> 'settings';
  if (s ->> 'night_surcharge')::numeric is distinct from 0.20::numeric or (s ->> 'night_from')::int <> 22
     or (s ->> 'night_until')::int <> 6 or (s ->> 'max_factor')::numeric is distinct from 1.50::numeric then
    raise exception 'FALHOU painel_sem_minimo_e_com_noturno: settings = %', s;
  end if;
  perform public.staff_set_pricing_settings('{"night_surcharge": 0.30, "max_factor": 1.80}'::jsonb);
  if (select night_surcharge from public.pricing_settings where id = 1) is distinct from 0.30::numeric
     or (select max_factor from public.pricing_settings where id = 1) is distinct from 1.80::numeric then
    raise exception 'FALHOU painel_sem_minimo_e_com_noturno: staff_set_pricing_settings não gravou noturno e teto';
  end if;
  insert into public.zz_fx values ('ok:painel_sem_minimo_e_com_noturno', '1');
end $t$;

-- so_equipe: passageiro comum não mexe em cidade nem em rota
do $t$
declare ps uuid := (select v::uuid from public.zz_fx where k = 'ps');
        g bigint := (select id from public.cities where name = 'Guaraciaba do Norte');
        u bigint := (select id from public.cities where name = 'Ubajara');
begin
  perform pg_temp.as_user(ps);
  begin perform public.staff_add_city('Outra', 'CE', -4.0, -40.8); raise exception 'FALHOU so_equipe: add_city';
  exception when others then if sqlerrm <> 'Acesso só para a equipe' then raise exception 'FALHOU so_equipe: add_city deu %', sqlerrm; end if; end;
  begin perform public.staff_set_city_active(g, false); raise exception 'FALHOU so_equipe: set_city_active';
  exception when others then if sqlerrm <> 'Acesso só para a equipe' then raise exception 'FALHOU so_equipe: set_city_active deu %', sqlerrm; end if; end;
  begin perform public.staff_delete_intercity_pair(g, u); raise exception 'FALHOU so_equipe: delete_pair';
  exception when others then if sqlerrm <> 'Acesso só para a equipe' then raise exception 'FALHOU so_equipe: delete_pair deu %', sqlerrm; end if; end;
  insert into public.zz_fx values ('ok:so_equipe', '1');
end $t$;

do $t$
begin
  raise exception 'RESULTADO: % de 9 testes OK (esta mensagem é esperada e desfaz tudo): %',
    (select count(*) from public.zz_fx where k like 'ok:%'),
    (select string_agg(substr(k, 4), ', ' order by k) from public.zz_fx where k like 'ok:%');
end $t$;

rollback;
