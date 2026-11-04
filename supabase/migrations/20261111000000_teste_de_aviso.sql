-- Teste de aviso: o motorista toca em "Testar aviso" no app, fecha o app e o servidor manda um push
-- de teste depois de alguns segundos (a Edge Function `push` precisa conhecer o evento "test").
-- Só funciona para o próprio aparelho já inscrito e no máximo uma vez a cada 20 segundos.

create table private.push_test_log (
  user_id uuid primary key,
  last_at timestamptz not null
);

alter table private.push_test_log enable row level security;
revoke all on private.push_test_log from public, anon, authenticated;

create function public.send_test_push(p_delay_seconds int default 10)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_cfg private.push_config;
  v_delay int := least(greatest(coalesce(p_delay_seconds, 0), 0), 30);
begin
  if v_uid is null then
    raise exception 'Entre na sua conta primeiro';
  end if;
  if not exists (select 1 from public.push_subscriptions s where s.user_id = v_uid) then
    raise exception 'Este aparelho ainda não está inscrito nos avisos. Ligue os avisos e tente de novo.';
  end if;
  select * into v_cfg from private.push_config where id = 1;
  if not found then
    raise exception 'O envio de avisos ainda não foi configurado no servidor';
  end if;

  insert into private.push_test_log (user_id, last_at) values (v_uid, now())
  on conflict (user_id) do update set last_at = now()
    where private.push_test_log.last_at < now() - interval '20 seconds';
  if not found then
    raise exception 'Espere alguns segundos para testar de novo';
  end if;

  perform net.http_post(
    url := v_cfg.url,
    body := jsonb_build_object('event', 'test', 'user_id', v_uid, 'delay_seconds', v_delay),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_cfg.secret),
    timeout_milliseconds := 40000
  );
end;
$$;

revoke execute on function public.send_test_push(int) from public, anon;
grant execute on function public.send_test_push(int) to authenticated;
