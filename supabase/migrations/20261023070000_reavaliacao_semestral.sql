-- Reavaliação do motorista a cada 6 meses. O motorista não vê nem sabe: a
-- tabela não tem nenhuma permissão para o app, só a equipe lê, pelo painel do
-- Supabase. Depois a equipe ganha um sistema de gestão por cima disto.

create table public.driver_reviews (
  driver_id uuid primary key references public.drivers (id) on delete cascade,
  last_reviewed_on date not null,
  next_review_on date not null,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.driver_reviews enable row level security;
revoke all on public.driver_reviews from anon, authenticated;

-- A equipe só preenche a data da última reavaliação; a próxima vem 6 meses depois.
create function private.set_next_review()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.next_review_on := (new.last_reviewed_on + interval '6 months')::date;
  return new;
end;
$$;

create trigger driver_reviews_next_date
  before insert or update of last_reviewed_on on public.driver_reviews
  for each row execute function private.set_next_review();

revoke execute on function private.set_next_review() from public, anon, authenticated;

-- A primeira reavaliação conta a partir da aprovação.
create or replace function private.on_driver_approved()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    perform private.start_trial(new.id);

    insert into public.driver_reviews (driver_id, last_reviewed_on)
    values (new.id, current_date)
    on conflict (driver_id) do nothing;
  end if;
  return new;
end;
$$;

-- Quem já estava aprovado conta a partir de hoje.
insert into public.driver_reviews (driver_id, last_reviewed_on)
select d.id, current_date
from public.drivers d
where d.status = 'approved'
on conflict (driver_id) do nothing;

-- Lista para a equipe: quem vence primeiro aparece no topo.
create view public.drivers_review_due
with (security_invoker = true)
as
select
  r.driver_id,
  d.vehicle_plate,
  d.vehicle_type,
  d.status,
  r.last_reviewed_on,
  r.next_review_on,
  (r.next_review_on - current_date) as days_left,
  r.notes
from public.driver_reviews r
join public.drivers d on d.id = r.driver_id
where d.status in ('approved', 'suspended')
order by r.next_review_on;

revoke all on public.drivers_review_due from anon, authenticated;
