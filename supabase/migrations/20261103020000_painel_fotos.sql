-- Painel da equipe: achar um passageiro e abrir a foto só para investigar denúncia.
-- Cada vez que a foto é aberta, fica registrado quem abriu e quando.

create table public.photo_views (
  id bigint generated always as identity primary key,
  staff_id uuid not null references auth.users (id),
  passenger_id uuid not null references public.profiles (id) on delete cascade,
  viewed_at timestamptz not null default now()
);

alter table public.photo_views enable row level security;
revoke all on public.photo_views from anon, authenticated;

create function public.staff_find_passenger(p_query text)
returns table (passenger_id uuid, full_name text, phone text, photo_path text, rides_count bigint)
language plpgsql
stable
security definer set search_path = ''
as $$
declare
  v_q text := trim(coalesce(p_query, ''));
begin
  perform private.require_staff();

  if char_length(v_q) < 3 then
    return;
  end if;

  return query
  select p.id, p.full_name, p.phone, p.photo_path,
         (select count(*) from public.rides r where r.passenger_id = p.id)
  from public.profiles p
  where p.full_name ilike '%' || v_q || '%' or p.phone like '%' || v_q || '%'
  order by p.full_name
  limit 20;
end;
$$;

create function public.staff_log_photo_view(p_passenger_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  perform private.require_staff();
  insert into public.photo_views (staff_id, passenger_id) values (auth.uid(), p_passenger_id);
end;
$$;

revoke execute on function public.staff_find_passenger(text) from public, anon;
revoke execute on function public.staff_log_photo_view(uuid) from public, anon;
grant execute on function public.staff_find_passenger(text) to authenticated;
grant execute on function public.staff_log_photo_view(uuid) to authenticated;
