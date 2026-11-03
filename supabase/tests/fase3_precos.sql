-- Testes da fase 3 (preços: sem mínimo, noturno com teto, preço entre cidades, cidades).
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

-- tarifa_sem_minimo: carro 8 + 2,20/km + 0,30/min, moto 5 + 1,40/km + 0,20/min, sem piso; depois de city_far_km o km vale city_far_per_km
do $t$
declare c bigint := (select id from public.cities where name = 'Guaraciaba do Norte');
        o extensions.geography := private.point(-40.7475, -4.1670);
        d extensions.geography := private.point(-40.7475, -4.0770);
        near extensions.geography := private.point(-40.7475, -4.1661);
        r record; f record;
begin
  -- Os valores esperados saem da tarifa vigente na tabela, não de números fixos.
  select * into f from public.fares where city_id = c and vehicle_type = 'car' and effective_from <= current_date order by effective_from desc limit 1;
  select * into r from private.ride_quote(c, 'car', o, d, null);
  if r.price is distinct from round(f.base + f.per_km * least(r.distance_km, f.city_far_km) + f.per_min * (least(r.distance_km, f.city_far_km) / 30 * 60)
      + f.city_far_per_km * greatest(0, r.distance_km - f.city_far_km), 2) then
    raise exception 'FALHOU tarifa_sem_minimo: carro % km deu %', r.distance_km, r.price;
  end if;
  select * into f from public.fares where city_id = c and vehicle_type = 'moto' and effective_from <= current_date order by effective_from desc limit 1;
  select * into r from private.ride_quote(c, 'moto', o, d, null);
  if r.price is distinct from round(f.base + f.per_km * least(r.distance_km, f.city_far_km) + f.per_min * (least(r.distance_km, f.city_far_km) / 30 * 60)
      + f.city_far_per_km * greatest(0, r.distance_km - f.city_far_km), 2) then
    raise exception 'FALHOU tarifa_sem_minimo: moto % km deu %', r.distance_km, r.price;
  end if;
  select * into f from public.fares where city_id = c and vehicle_type = 'car' and effective_from <= current_date order by effective_from desc limit 1;
  select * into r from private.ride_quote(c, 'car', o, near, null);
  if r.price < f.base or r.price >= f.base + 2 then
    raise exception 'FALHOU tarifa_sem_minimo: corrida de % km deu % (sem piso deveria ficar entre % e %)', r.distance_km, r.price, f.base, f.base + 2;
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

-- preco_entre_cidades: viagem para outra cidade usa a tarifa da cidade de origem, com valor por km próprio e tempo a 100 km/h
do $t$
declare g bigint := (select id from public.cities where name = 'Guaraciaba do Norte');
        u bigint := (select id from public.cities where name = 'Ubajara');
        o extensions.geography := private.point(-40.7475, -4.1670);
        d extensions.geography := private.point(-40.9210, -3.8545);
        km numeric; esperado numeric; got numeric; f record;
begin
  select * into f from public.fares where city_id = g and vehicle_type = 'car' and effective_from <= current_date order by effective_from desc limit 1;
  km := round((extensions.st_distance(o, d) / 1000 * 1.3)::numeric, 2);
  esperado := round(f.base + f.intercity_per_km * least(km, f.intercity_t1_km)
    + f.intercity_rate2 * greatest(0, least(km, f.intercity_t2_km) - f.intercity_t1_km)
    + f.intercity_rate3 * greatest(0, km - f.intercity_t2_km), 2);
  select r.price into got from private.ride_quote(g, 'car', o, d, u) r;
  if got is distinct from esperado then
    raise exception 'FALHOU preco_entre_cidades: preço % (esperado %)', got, esperado;
  end if;
  if to_regclass('public.intercity_fares') is not null then
    raise exception 'FALHOU preco_entre_cidades: intercity_fares ainda existe';
  end if;
  -- viagem longa (Fortaleza, ~326 km): as três faixas dão pelo menos R$ 890 só de ida
  select r.price into got from private.ride_quote(g, 'car', o, private.point(-38.5267, -3.7319), u) r;
  if got < 890 or got > 900 then
    raise exception 'FALHOU preco_entre_cidades: Fortaleza deu % (esperado entre 890 e 900)', got;
  end if;
  -- sítio dentro da cidade (Várzea dos Espinhos, ~22 km de estrada): uns R$ 30 pela regra do km mais barato
  select r.price into got from private.ride_quote(g, 'car', o, private.point(-40.842067, -4.284433), null) r;
  if got < 28 or got > 32 then
    raise exception 'FALHOU preco_entre_cidades: Várzea dos Espinhos deu % (esperado uns 30)', got;
  end if;
  insert into public.zz_fx values ('ok:preco_entre_cidades', '1');
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

-- so_equipe: passageiro comum não mexe em cidade
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
  insert into public.zz_fx values ('ok:so_equipe', '1');
end $t$;

do $t$
begin
  raise exception 'RESULTADO: % de 8 testes OK (esta mensagem é esperada e desfaz tudo): %',
    (select count(*) from public.zz_fx where k like 'ok:%'),
    (select string_agg(substr(k, 4), ', ' order by k) from public.zz_fx where k like 'ok:%');
end $t$;

rollback;
