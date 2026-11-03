-- Aviso na hora de digitar o CPF no cadastro de motorista: se o CPF já tem cadastro em outra
-- conta, o app avisa de uma vez (sem esperar o fim do cadastro) e manda falar com o suporte.
-- Só responde sim ou não; nunca devolve quem é o dono do CPF.

create function public.cpf_already_registered(p_cpf text)
returns boolean
language plpgsql
stable
security definer set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'Faça login para continuar';
  end if;
  if p_cpf is null or p_cpf !~ '^[0-9]{11}$' then
    return false;
  end if;
  -- Quem já é motorista nesta própria conta não conta (o app barra isso em outro lugar).
  return exists (
    select 1 from public.driver_private dp
    where dp.cpf = p_cpf and dp.driver_id <> v_me
  );
end;
$$;

revoke all on function public.cpf_already_registered(text) from public, anon;
grant execute on function public.cpf_already_registered(text) to authenticated;
