-- Liberar número, versão simples: a equipe só libera o número (30 minutos). Quem pede o código é a própria
-- pessoa, no app ("Receber código" ou "Reenviar código"): o hook guarda o código do pedido mais recente e o
-- painel mostra sempre o último. Assim o código mostrado nunca fica velho por causa de um segundo pedido, e não
-- há conflito com a espera de 1 minuto entre pedidos do login.

create or replace function public.staff_release_phone(p_phone text)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_digits text;
begin
  perform private.require_staff();
  v_digits := private.release_phone_digits(p_phone);

  delete from private.phone_releases where expires_at < now();

  insert into private.phone_releases (phone, released_by, released_at, expires_at, code, code_at)
  values (v_digits, auth.uid(), now(), now() + interval '30 minutes', null, null)
  on conflict (phone) do update
    set released_by = excluded.released_by, released_at = excluded.released_at,
        expires_at = excluded.expires_at, code = null, code_at = null;
end;
$$;
