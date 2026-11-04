-- Web Push: avisos com o app em segundo plano ou fechado (principalmente no iPhone).
-- O app grava a inscrição do aparelho em public.push_subscriptions. Gatilhos no banco chamam a
-- Edge Function `push` (pelo pg_net) quando: chega pedido de corrida ao motorista, a corrida muda de
-- estado (avisa o passageiro), chega proposta em viagem entre cidades, chega mensagem de chat e há
-- viagem agendada para confirmar.
--
-- Depois de aplicar, o dono grava o endereço da função e a senha combinada (veja docs/EQUIPE.md):
--   insert into private.push_config (id, url, secret)
--   values (1, 'https://SEU-PROJETO.supabase.co/functions/v1/push', 'a-mesma-senha-do-segredo-PUSH_SECRET')
--   on conflict (id) do update set url = excluded.url, secret = excluded.secret;
-- Enquanto isso não for feito, os gatilhos não fazem nada (o app segue como antes).
-- Nenhuma falha de envio derruba a corrida: todo envio roda dentro de um bloco que ignora erro.

do $$
begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net não pôde ser ativado: ative em Database > Extensions e rode esta migration de novo';
end;
$$;

-- ---------------------------------------------------------------------------
-- Inscrições
-- ---------------------------------------------------------------------------

create table public.push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique check (endpoint like 'https://%'),
  p256dh text not null,
  auth text not null,
  criado_em timestamptz not null default now()
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
grant select, insert, delete on public.push_subscriptions to authenticated;

create policy push_subscriptions_select_own on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
create policy push_subscriptions_insert_own on public.push_subscriptions
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy push_subscriptions_delete_own on public.push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));

-- O app grava por aqui: uma conta, um celular (apaga as outras inscrições da pessoa) e, se o aparelho
-- já estava inscrito para outra conta, ele passa para quem entrou agora.
create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Entre na sua conta primeiro';
  end if;
  if p_endpoint is null or p_endpoint not like 'https://%' or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'Inscrição inválida';
  end if;

  delete from public.push_subscriptions where user_id = v_uid and endpoint <> p_endpoint;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (v_uid, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, criado_em = now();
end;
$$;

revoke execute on function public.save_push_subscription(text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;

-- Conta excluída (pelo app ou pelo painel): as inscrições saem junto. A exclusão só marca
-- profiles.deleted_at, então o gatilho fica aqui e private.delete_account não precisa mudar.
create function private.drop_push_on_delete()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  delete from public.push_subscriptions where user_id = new.id;
  return new;
end;
$$;

create trigger profiles_drop_push
  after update of deleted_at on public.profiles
  for each row
  when (new.deleted_at is not null and old.deleted_at is null)
  execute function private.drop_push_on_delete();

-- ---------------------------------------------------------------------------
-- Envio
-- ---------------------------------------------------------------------------

create table private.push_config (
  id int primary key check (id = 1),
  url text not null,
  secret text not null
);

alter table private.push_config enable row level security;
revoke all on private.push_config from public, anon, authenticated;

-- Chama a função de envio, sem esperar a resposta. p_delay_seconds: a vez do motorista na fila.
create function private.send_push(
  p_user uuid,
  p_event text,
  p_ride_id bigint default null,
  p_offer_id bigint default null,
  p_delay_seconds int default 0
)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_cfg private.push_config;
begin
  if p_user is null then
    return;
  end if;
  select * into v_cfg from private.push_config where id = 1;
  if not found then
    return;
  end if;
  if not exists (select 1 from public.push_subscriptions s where s.user_id = p_user) then
    return;
  end if;

  perform net.http_post(
    url := v_cfg.url,
    body := jsonb_build_object(
      'event', p_event,
      'user_id', p_user,
      'ride_id', p_ride_id,
      'offer_id', p_offer_id,
      'delay_seconds', greatest(coalesce(p_delay_seconds, 0), 0)
    ),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_cfg.secret),
    timeout_milliseconds := 5000
  );
exception when others then
  -- Aviso é extra: se falhar, a corrida segue.
  null;
end;
$$;

revoke execute on function private.send_push(uuid, text, bigint, bigint, int) from public, anon, authenticated;

-- Novo pedido para o motorista. O pedido vira uma fila em ondas (cada motorista o vê alguns
-- segundos depois do anterior): a função espera a vez dele e confere se o pedido ainda está aberto.
create function private.push_on_offer()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  perform private.send_push(
    new.driver_id,
    'new_offer',
    new.ride_id,
    new.id,
    greatest(ceil(extract(epoch from (new.visible_from - now())))::int, 0)
  );
  return new;
end;
$$;

create trigger ride_offers_push
  after insert on public.ride_offers
  for each row execute function private.push_on_offer();

-- Mudança de estado da corrida.
create function private.push_on_ride_change()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  v_trip boolean := new.destination_city_id is not null and new.destination_city_id <> new.city_id;
begin
  if new.status is distinct from old.status then
    if new.status = 'accepted' and old.status = 'requested' then
      if v_trip then
        -- Viagem entre cidades: quem aceita é o passageiro, escolhendo a proposta do motorista.
        perform private.send_push(new.driver_id, 'trip_proposal_chosen', new.id);
      else
        perform private.send_push(new.passenger_id, 'ride_accepted', new.id);
      end if;
    elsif new.status = 'arrived' then
      perform private.send_push(new.passenger_id, 'ride_arrived', new.id);
    elsif new.status = 'in_progress' then
      perform private.send_push(new.passenger_id, 'ride_started', new.id);
    elsif new.status = 'completed' then
      perform private.send_push(new.passenger_id, 'ride_completed', new.id);
    elsif new.status = 'cancelled' then
      if new.void_reason = 'not_confirmed' then
        perform private.send_push(new.driver_id, 'trip_void_driver', new.id);
        perform private.send_push(new.passenger_id, 'trip_void_passenger', new.id);
      elsif new.cancelled_by is null then
        if old.status = 'requested' and v_trip then
          perform private.send_push(new.passenger_id, 'trip_expired', new.id);
        end if;
      elsif new.cancelled_by = new.passenger_id then
        perform private.send_push(
          new.driver_id,
          case when v_trip then 'trip_cancelled_by_passenger' else 'ride_cancelled_by_passenger' end,
          new.id
        );
      elsif new.cancelled_by = new.driver_id then
        perform private.send_push(
          new.passenger_id,
          case when v_trip then 'trip_cancelled_by_driver' else 'ride_cancelled_by_driver' end,
          new.id
        );
      end if;
    end if;
  elsif old.status = 'accepted' and new.status = 'accepted' and old.confirmed_at is null and new.confirmed_at is not null then
    -- Viagem agendada: o passageiro confirmou.
    perform private.send_push(new.driver_id, 'trip_confirmed', new.id);
  end if;
  return new;
end;
$$;

create trigger rides_push
  after update on public.rides
  for each row
  when (old.status is distinct from new.status or old.confirmed_at is distinct from new.confirmed_at)
  execute function private.push_on_ride_change();

-- Proposta nova numa viagem entre cidades: avisa o passageiro.
create function private.push_on_proposal()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  perform private.send_push((select r.passenger_id from public.rides r where r.id = new.ride_id), 'trip_proposal', new.ride_id);
  return new;
end;
$$;

create trigger ride_proposals_push
  after insert on public.ride_proposals
  for each row execute function private.push_on_proposal();

-- Mensagem de chat: avisa a outra pessoa da corrida (o texto da mensagem não vai no aviso).
create function private.push_on_message()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  v_ride public.rides;
begin
  select * into v_ride from public.rides r where r.id = new.ride_id;
  if not found then
    return new;
  end if;
  perform private.send_push(
    case when new.sender_id = v_ride.passenger_id then v_ride.driver_id else v_ride.passenger_id end,
    'chat_message',
    new.ride_id
  );
  return new;
end;
$$;

create trigger ride_messages_push
  after insert on public.ride_messages
  for each row execute function private.push_on_message();

-- Viagem agendada para confirmar: a janela abre 12 horas antes e fecha 2 horas antes (confirmState).
-- Um aviso só por viagem.
alter table public.rides add column confirm_push_sent_at timestamptz;

create function private.push_confirm_reminders()
returns int
language plpgsql
security definer set search_path = ''
as $$
declare
  v_row record;
  v_count int := 0;
begin
  for v_row in
    update public.rides r
    set confirm_push_sent_at = now()
    where r.status = 'accepted'
      and r.scheduled_for is not null
      and r.confirmed_at is null
      and r.confirm_push_sent_at is null
      and r.scheduled_for <= now() + interval '12 hours'
      and r.scheduled_for > now() + interval '2 hours'
    returning r.id, r.passenger_id
  loop
    perform private.send_push(v_row.passenger_id, 'trip_confirm_reminder', v_row.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function private.push_confirm_reminders() from public, anon, authenticated;

-- Rotina agendada, se o projeto permitir; sem ela o lembrete de confirmar fica só no aviso local do app.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('push-confirm-reminders', '*/10 * * * *', 'select private.push_confirm_reminders()');
exception when others then
  null;
end;
$$;
