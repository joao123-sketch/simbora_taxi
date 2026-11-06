-- Testes de "várias cidades" (raio, origem dentro da cidade, abrir cidade).
-- Rode inteiro no SQL Editor do Supabase DEPOIS de aplicar a migration 20261114000000.
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

-- raio_padrao: toda cidade já cadastrada ficou com 8 km e a view mostra a coluna
do $t$
begin
  if exists (select 1 from public.cities where radius_km is distinct from 8::numeric) then
    raise exception 'FALHOU raio_padrao: há cidade com raio diferente de 8';
  end if;
  if not exists (select 1 from public.cities_map where radius_km = 8) then
    raise exception 'FALHOU raio_padrao: cities_map sem radius_km';
  end if;
  insert into public.zz_fx values ('ok:raio_padrao', '1');
end $t$;

-- origem_no_raio: 7,9 km passa, 8,1 km falha, centro passa
do $t$
declare c bigint := (select id from public.cities where name = 'Guaraciaba do Norte');
        center extensions.geography := (select center from public.cities where id = c);
        inside extensions.geography;
        outside extensions.geography;
begin
  -- 1 grau de latitude ~ 111,19 km; 7,9 km ~ 0,07105 grau e 8,1 km ~ 0,07285 grau.
  inside := private.point(extensions.st_x(center::extensions.geometry), extensions.st_y(center::extensions.geometry) + 0.0710);
  outside := private.point(extensions.st_x(center::extensions.geometry), extensions.st_y(center::extensions.geometry) + 0.0730);
  perform private.assert_origin_in_city(c, center);
  perform private.assert_origin_in_city(c, inside);
  begin
    perform private.assert_origin_in_city(c, outside);
    raise exception 'FALHOU origem_no_raio: 8,1 km deveria falhar';
  exception when others then
    if sqlerrm not like 'Você está fora da área desta cidade%' then
      raise exception 'FALHOU origem_no_raio: deu %', sqlerrm;
    end if;
  end;
  insert into public.zz_fx values ('ok:origem_no_raio', '1');
end $t$;

-- cotacao_confere_origem: dentro cota (2 tipos de veículo); fora dá erro em português
do $t$
declare ps uuid := (select v::uuid from public.zz_fx where k = 'ps');
        c bigint := (select id from public.cities where name = 'Guaraciaba do Norte');
        n int;
begin
  perform pg_temp.as_user(ps);
  select count(*) into n from public.quote_ride(c, -40.7475, -4.1670, -40.7475, -4.1500);
  if n <> 2 then
    raise exception 'FALHOU cotacao_confere_origem: origem no centro devolveu % linhas', n;
  end if;
  begin
    perform * from public.quote_ride(c, -40.8650, -4.0485, -40.7475, -4.1500);
    raise exception 'FALHOU cotacao_confere_origem: origem em São Benedito deveria falhar';
  exception when others then
    if sqlerrm not like 'Você está fora da área desta cidade%' then
      raise exception 'FALHOU cotacao_confere_origem: deu %', sqlerrm;
    end if;
  end;
  insert into public.zz_fx values ('ok:cotacao_confere_origem', '1');
end $t$;

-- abrir_cidade: nasce ativa, com o raio pedido e as tarifas copiadas da modelo
do $t$
declare st uuid := (select v::uuid from public.zz_fx where k = 'st');
        g bigint := (select id from public.cities where name = 'Guaraciaba do Norte');
        n bigint; nf int; same int;
begin
  perform pg_temp.as_user(st);
  n := public.staff_open_city('Ipu Teste', 'ce', -4.3200, -40.7100, 5, g);
  if not (select active from public.cities where id = n) or (select radius_km from public.cities where id = n) <> 5 then
    raise exception 'FALHOU abrir_cidade: cidade não nasceu ativa com raio 5';
  end if;
  select count(*) into nf from public.fares where city_id = n;
  select count(*) into same
  from public.fares a
  join (
    select distinct on (vehicle_type) * from public.fares
    where city_id = g and effective_from <= current_date order by vehicle_type, effective_from desc
  ) b on b.vehicle_type = a.vehicle_type
  where a.city_id = n and a.base = b.base and a.per_km = b.per_km and a.per_min = b.per_min
    and a.intercity_per_km = b.intercity_per_km and a.city_far_per_km = b.city_far_per_km;
  if nf <> 2 or same <> 2 then
    raise exception 'FALHOU abrir_cidade: % tarifas, % iguais à modelo', nf, same;
  end if;
  begin
    perform public.staff_open_city('Ipu Teste', 'CE', -4.3200, -40.7100, 5, g);
    raise exception 'FALHOU abrir_cidade: nome repetido deveria falhar';
  exception when others then
    if sqlerrm <> 'Essa cidade já existe' then raise exception 'FALHOU abrir_cidade: repetida deu %', sqlerrm; end if;
  end;
  insert into public.zz_fx values ('ok:abrir_cidade', '1');
end $t$;

-- abrir_cidade_modelo_sem_moto: falha inteira, sem deixar cidade criada
do $t$
declare st uuid := (select v::uuid from public.zz_fx where k = 'st');
        m bigint;
begin
  perform pg_temp.as_user(st);
  insert into public.cities (name, state, active, center) values ('Modelo Manco', 'CE', false, private.point(-40.0, -4.0)) returning id into m;
  insert into public.fares (city_id, vehicle_type, effective_from, base, per_km, per_min)
  values (m, 'car', current_date, 8, 2.2, 0.3);
  begin
    perform public.staff_open_city('Cidade Sem Moto', 'CE', -4.5, -40.5, 8, m);
    raise exception 'FALHOU abrir_cidade_modelo_sem_moto: deveria falhar';
  exception when others then
    if sqlerrm <> 'A cidade modelo precisa ter tarifa de carro e de moto' then
      raise exception 'FALHOU abrir_cidade_modelo_sem_moto: deu %', sqlerrm;
    end if;
  end;
  if exists (select 1 from public.cities where name = 'Cidade Sem Moto') then
    raise exception 'FALHOU abrir_cidade_modelo_sem_moto: cidade ficou criada';
  end if;
  insert into public.zz_fx values ('ok:abrir_cidade_modelo_sem_moto', '1');
end $t$;

-- raio_editavel_e_so_equipe: equipe muda o raio (1 a 50); passageiro não mexe
do $t$
declare st uuid := (select v::uuid from public.zz_fx where k = 'st');
        ps uuid := (select v::uuid from public.zz_fx where k = 'ps');
        g bigint := (select id from public.cities where name = 'Guaraciaba do Norte');
begin
  perform pg_temp.as_user(st);
  perform public.staff_set_city_radius(g, 6);
  if (select radius_km from public.cities where id = g) <> 6 then
    raise exception 'FALHOU raio_editavel_e_so_equipe: raio não mudou';
  end if;
  begin perform public.staff_set_city_radius(g, 51); raise exception 'FALHOU raio_editavel_e_so_equipe: 51 km deveria falhar';
  exception when others then if sqlerrm <> 'O raio vai de 1 a 50 km' then raise exception 'FALHOU raio_editavel_e_so_equipe: 51 deu %', sqlerrm; end if; end;
  perform pg_temp.as_user(ps);
  begin perform public.staff_set_city_radius(g, 8); raise exception 'FALHOU raio_editavel_e_so_equipe: passageiro mexeu';
  exception when others then if sqlerrm <> 'Acesso só para a equipe' then raise exception 'FALHOU raio_editavel_e_so_equipe: passageiro deu %', sqlerrm; end if; end;
  begin perform public.staff_open_city('Outra', 'CE', -4.0, -40.8, 8, g); raise exception 'FALHOU raio_editavel_e_so_equipe: passageiro abriu cidade';
  exception when others then if sqlerrm <> 'Acesso só para a equipe' then raise exception 'FALHOU raio_editavel_e_so_equipe: abrir deu %', sqlerrm; end if; end;
  insert into public.zz_fx values ('ok:raio_editavel_e_so_equipe', '1');
end $t$;

do $t$
begin
  raise exception 'RESULTADO: % de 6 testes OK (esta mensagem é esperada e desfaz tudo): %',
    (select count(*) from public.zz_fx where k like 'ok:%'),
    (select string_agg(substr(k, 4), ', ' order by k) from public.zz_fx where k like 'ok:%');
end $t$;

rollback;
