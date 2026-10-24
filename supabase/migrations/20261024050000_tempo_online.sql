-- Tempo online do motorista, para o dashboard de "Minhas corridas".
-- Cada vez que o motorista fica online abre uma sessão; ao ficar offline ela
-- fecha. Uma sessão que ficou aberta (app fechado sem sair) só conta até 5
-- minutos depois da última posição que ele mandou.

create table public.driver_online_sessions (
  id bigint generated always as identity primary key,
  driver_id uuid not null references public.drivers (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

-- No máximo uma sessão aberta por motorista.
create unique index driver_online_one_open on public.driver_online_sessions (driver_id) where ended_at is null;
create index driver_online_sessions_idx on public.driver_online_sessions (driver_id, started_at);

-- Só as funções abaixo mexem na tabela.
alter table public.driver_online_sessions enable row level security;
revoke all on public.driver_online_sessions from anon, authenticated;

-- Motorista não fica offline no meio de uma corrida, e agora cada mudança de
-- status abre ou fecha uma sessão.
create or replace function public.set_driver_online(p_online boolean)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not p_online and exists (
    select 1 from public.rides r
    where r.driver_id = auth.uid() and r.status in ('accepted', 'arrived', 'in_progress')
  ) then
    raise exception 'Termine a corrida antes de ficar offline';
  end if;

  update public.drivers
  set is_online = p_online
  where id = auth.uid() and status = 'approved';

  if not found then
    raise exception 'Motorista não aprovado';
  end if;

  if p_online then
    insert into public.driver_online_sessions (driver_id)
    values (auth.uid())
    on conflict (driver_id) where ended_at is null do nothing;
  else
    update public.driver_online_sessions
    set ended_at = now()
    where driver_id = auth.uid() and ended_at is null;
  end if;
end;
$$;

-- Quantos segundos o motorista ficou online desde `p_since`.
create function public.driver_online_seconds(p_since timestamptz)
returns bigint
language sql
stable
security definer set search_path = ''
as $$
  select coalesce(sum(
    greatest(
      0,
      extract(epoch from (
        least(
          now(),
          coalesce(
            s.ended_at,
            (select l.updated_at + interval '5 minutes' from public.driver_locations l where l.driver_id = s.driver_id),
            s.started_at
          )
        ) - greatest(s.started_at, p_since)
      ))
    )
  ), 0)::bigint
  from public.driver_online_sessions s
  where s.driver_id = auth.uid()
    and coalesce(s.ended_at, now()) > p_since;
$$;

revoke execute on function public.driver_online_seconds(timestamptz) from public, anon;
grant execute on function public.driver_online_seconds(timestamptz) to authenticated;
