-- Testes do Web Push (tabela push_subscriptions, RLS, gravação por RPC e limpeza na exclusão).
-- Rode inteiro no SQL Editor do Supabase DEPOIS de aplicar a migration 20261110000000.
-- Tudo acontece numa transação que termina desfeita: o resultado aparece como um "erro"
-- que começa com RESULTADO (é de propósito). Cada linha deve terminar em "ok".

begin;

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
  perform set_config('role', 'authenticated', true);
end $f$;

create function pg_temp.as_admin() returns void language plpgsql as $f$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $f$;

create table public.zz_fx (k text primary key, v text);
grant all on public.zz_fx to authenticated, anon;

do $t$
declare a uuid; b uuid; n int; failed boolean;
begin
  a := pg_temp.mk_user('Ana Teste');
  b := pg_temp.mk_user('Beto Teste');

  -- 1. Pela RPC, a pessoa grava a própria inscrição.
  perform pg_temp.as_user(a);
  perform public.save_push_subscription('https://push.example/a1', 'chave-p', 'chave-a');
  select count(*) into n from public.push_subscriptions;
  insert into public.zz_fx values ('01 rpc grava a propria', case when n = 1 then 'ok' else 'FALHOU: ' || n end);

  -- 2. Segunda inscrição da mesma pessoa troca a primeira (uma conta, um celular).
  perform public.save_push_subscription('https://push.example/a2', 'chave-p', 'chave-a');
  select count(*) into n from public.push_subscriptions where user_id = a;
  insert into public.zz_fx values ('02 um celular por conta', case when n = 1 then 'ok' else 'FALHOU: ' || n end);

  -- 3. Endpoint que não é https é recusado.
  failed := false;
  begin
    perform public.save_push_subscription('http://push.example/x', 'p', 'a');
  exception when others then failed := true;
  end;
  insert into public.zz_fx values ('03 recusa endpoint sem https', case when failed then 'ok' else 'FALHOU' end);

  -- 4. Outra pessoa não enxerga a inscrição de Ana.
  perform pg_temp.as_user(b);
  select count(*) into n from public.push_subscriptions;
  insert into public.zz_fx values ('04 rls: Beto nao ve a de Ana', case when n = 0 then 'ok' else 'FALHOU: ' || n end);

  -- 5. Beto não consegue inserir inscrição em nome de Ana.
  failed := false;
  begin
    insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (a, 'https://push.example/fake', 'p', 'a');
  exception when others then failed := true;
  end;
  insert into public.zz_fx values ('05 rls: Beto nao inscreve em nome de Ana', case when failed then 'ok' else 'FALHOU' end);

  -- 6. Beto não apaga a inscrição de Ana (o delete não acha linha).
  delete from public.push_subscriptions where user_id = a;
  perform pg_temp.as_admin();
  select count(*) into n from public.push_subscriptions where user_id = a;
  insert into public.zz_fx values ('06 rls: Beto nao apaga a de Ana', case when n = 1 then 'ok' else 'FALHOU: ' || n end);

  -- 7. Quem não entrou (anon) não grava por RPC.
  perform set_config('role', 'anon', true);
  failed := false;
  begin
    perform public.save_push_subscription('https://push.example/z', 'p', 'a');
  exception when others then failed := true;
  end;
  perform pg_temp.as_admin();
  insert into public.zz_fx values ('07 anon nao grava', case when failed then 'ok' else 'FALHOU' end);

  -- 8. Aparelho que troca de dono: o endpoint passa para quem entrou agora.
  perform pg_temp.as_user(b);
  perform public.save_push_subscription('https://push.example/a2', 'chave-p2', 'chave-a2');
  perform pg_temp.as_admin();
  select count(*) into n from public.push_subscriptions where endpoint = 'https://push.example/a2' and user_id = b;
  insert into public.zz_fx values ('08 endpoint passa para o novo dono', case when n = 1 then 'ok' else 'FALHOU: ' || n end);

  -- 9. A própria pessoa apaga a sua inscrição.
  perform pg_temp.as_user(b);
  delete from public.push_subscriptions where endpoint = 'https://push.example/a2';
  perform pg_temp.as_admin();
  select count(*) into n from public.push_subscriptions where user_id = b;
  insert into public.zz_fx values ('09 a pessoa apaga a propria', case when n = 0 then 'ok' else 'FALHOU: ' || n end);

  -- 10. Excluir a conta (profiles.deleted_at) apaga as inscrições.
  perform pg_temp.as_user(b);
  perform public.save_push_subscription('https://push.example/b9', 'p', 'a');
  perform pg_temp.as_admin();
  update public.profiles set deleted_at = now() where id = b;
  select count(*) into n from public.push_subscriptions where user_id = b;
  insert into public.zz_fx values ('10 excluir conta apaga inscricoes', case when n = 0 then 'ok' else 'FALHOU: ' || n end);

  -- 11. Sem configuração (private.push_config vazia) o envio não faz nada e não dá erro.
  delete from private.push_config;
  perform private.send_push(a, 'new_offer', null, null, 0);
  insert into public.zz_fx values ('11 sem config nao falha', 'ok');

  -- 12. A tabela de configuração não é lida pelo app.
  perform pg_temp.as_user(a);
  failed := false;
  begin
    perform 1 from private.push_config;
  exception when others then failed := true;
  end;
  perform pg_temp.as_admin();
  insert into public.zz_fx values ('12 push_config fechada ao app', case when failed then 'ok' else 'FALHOU' end);
end
$t$;

do $r$
declare v text;
begin
  select string_agg(k || ' => ' || v, E'\n' order by k) into v from public.zz_fx;
  raise exception 'RESULTADO:%', E'\n' || v;
end
$r$;

rollback;
