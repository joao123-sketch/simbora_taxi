-- Etapa 6: chat da corrida e posição do motorista para o passageiro.
-- Notificações push e localização em segundo plano ficam para depois do
-- build de desenvolvimento (Etapa 3): não funcionam no Expo Go.

-- ---------------------------------------------------------------------------
-- Chat entre passageiro e motorista da corrida (no lugar do telefone)
-- ---------------------------------------------------------------------------

create table public.ride_messages (
  id bigint generated always as identity primary key,
  ride_id bigint not null references public.rides (id) on delete cascade,
  sender_id uuid not null references public.profiles (id),
  body text not null check (length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create index ride_messages_ride_idx on public.ride_messages (ride_id, id);

alter table public.ride_messages enable row level security;

create function private.is_ride_participant(p_ride_id bigint)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.rides r
    where r.id = p_ride_id
      and (r.passenger_id = (select auth.uid()) or r.driver_id = (select auth.uid()))
  );
$$;

revoke execute on function private.is_ride_participant(bigint) from public, anon;
grant execute on function private.is_ride_participant(bigint) to authenticated;

-- Só o passageiro e o motorista da corrida leem. Ninguém escreve direto: só por send_message.
create policy "participantes leem as mensagens" on public.ride_messages
  for select to authenticated using (private.is_ride_participant(ride_id));

-- As mensagens chegam em tempo real para os dois.
alter publication supabase_realtime add table public.ride_messages;

create function public.send_message(p_ride_id bigint, p_body text)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_body text := trim(coalesce(p_body, ''));
begin
  if length(v_body) = 0 or length(v_body) > 500 then
    raise exception 'Escreva uma mensagem de até 500 letras';
  end if;

  if not exists (
    select 1 from public.rides r
    where r.id = p_ride_id
      and r.status in ('accepted', 'arrived', 'in_progress')
      and (r.passenger_id = auth.uid() or r.driver_id = auth.uid())
  ) then
    raise exception 'Só dá para conversar durante a corrida';
  end if;

  insert into public.ride_messages (ride_id, sender_id, body)
  values (p_ride_id, auth.uid(), v_body);
end;
$$;

revoke execute on function public.send_message(bigint, text) from public, anon;
grant execute on function public.send_message(bigint, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Onde está o motorista (para o carro andar no mapa do passageiro)
-- ---------------------------------------------------------------------------

-- Latitude e longitude prontas, sem o app lidar com PostGIS. O RLS de
-- driver_locations continua valendo: o passageiro só vê o motorista da corrida
-- em andamento, e o motorista só vê a si mesmo.
create view public.driver_positions
with (security_invoker = true)
as
select
  l.driver_id,
  extensions.st_y(l.position::extensions.geometry) as lat,
  extensions.st_x(l.position::extensions.geometry) as lng,
  l.heading,
  l.updated_at
from public.driver_locations l;
