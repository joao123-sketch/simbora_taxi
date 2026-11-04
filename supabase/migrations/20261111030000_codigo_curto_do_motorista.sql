-- Código do motorista (para favoritar) mais curto: 5 letras e números em vez de 8, fácil de ditar e digitar.
-- Sem letras e números que se confundem (0/O, 1/I/L). A função antiga (8 caracteres) continua valendo para o
-- código do trajeto compartilhado, que precisa ser longo.

create function private.new_driver_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
begin
  loop
    v_code := '';
    for i in 1..5 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.drivers d where d.share_code = v_code);
  end loop;
  return v_code;
end;
$$;

revoke execute on function private.new_driver_code() from public, anon, authenticated;

alter table public.drivers alter column share_code set default private.new_driver_code();

-- Quem já tinha código ganha um novo, curto. Convites e QR antigos deixam de valer.
update public.drivers set share_code = private.new_driver_code();
