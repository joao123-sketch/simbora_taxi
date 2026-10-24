-- Chat: número parecido com telefone é escondido antes de salvar.

create function private.mask_phones(p_text text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_text text := p_text;
  v_match text;
begin
  -- Trechos de números (com espaço, parênteses, ponto ou traço no meio) com 8
  -- dígitos ou mais viram aviso.
  for v_match in
    select (regexp_matches(p_text, '(\(?\+?\d[\d\s().-]{5,}\d)', 'g'))[1]
  loop
    if length(regexp_replace(v_match, '\D', '', 'g')) >= 8 then
      v_text := replace(v_text, v_match, '(número escondido)');
    end if;
  end loop;
  return v_text;
end;
$$;

revoke execute on function private.mask_phones(text) from public, anon, authenticated;

create or replace function public.send_message(p_ride_id bigint, p_body text)
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
  values (p_ride_id, auth.uid(), private.mask_phones(v_body));
end;
$$;
