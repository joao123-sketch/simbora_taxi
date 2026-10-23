-- Cadastro de moto sem travar nos itens de segurança. Quem ainda não tem o
-- protetor de pernas, por exemplo, pode se cadastrar e instalar até a vistoria:
-- a equipe confere cada item (driver_checklist) e o banco só deixa aprovar com
-- tudo marcado. O que o motorista declarou fica em driver_private.

create or replace function public.register_driver(
  p_city_id bigint,
  p_vehicle_type public.vehicle_type,
  p_vehicle_model text,
  p_vehicle_color text,
  p_vehicle_plate text,
  p_vehicle_year int,
  p_pix_key text,
  p_cpf text,
  p_birth_date date,
  p_cnh_category text,
  p_cnh_ear boolean,
  p_declared_helmets boolean,
  p_declared_leg_guard boolean,
  p_declared_line_cutter boolean,
  p_terms_version text
)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_plate text := upper(regexp_replace(coalesce(p_vehicle_plate, ''), '[^A-Za-z0-9]', '', 'g'));
  v_cpf text := regexp_replace(coalesce(p_cpf, ''), '[^0-9]', '', 'g');
  v_constraint text;
begin
  if v_uid is null then
    raise exception 'Faça login para se cadastrar';
  end if;

  if exists (select 1 from public.drivers d where d.id = v_uid) then
    raise exception 'Você já tem cadastro de motorista';
  end if;

  if not exists (select 1 from public.cities c where c.id = p_city_id and c.active) then
    raise exception 'O Simbora Car ainda não atende essa cidade';
  end if;

  if length(trim(coalesce(p_vehicle_model, ''))) < 2 or length(trim(coalesce(p_vehicle_color, ''))) < 3 then
    raise exception 'Informe o modelo e a cor do veículo';
  end if;

  if v_plate !~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$' then
    raise exception 'Placa inválida';
  end if;

  if p_vehicle_year is null or p_vehicle_year < 2010 or p_vehicle_year > extract(year from current_date)::int + 1 then
    raise exception 'O Simbora Car aceita veículos de 2010 em diante';
  end if;

  if not private.is_valid_cpf(v_cpf) then
    raise exception 'CPF inválido';
  end if;

  if p_birth_date is null or p_birth_date > (current_date - interval '18 years')::date then
    raise exception 'O motorista precisa ter 18 anos ou mais';
  end if;
  if p_birth_date < (current_date - interval '100 years')::date then
    raise exception 'Data de nascimento inválida';
  end if;

  if not coalesce(p_cnh_ear, false) then
    raise exception 'A CNH precisa ter a observação EAR (exerce atividade remunerada)';
  end if;

  if p_vehicle_type = 'moto' then
    if coalesce(p_cnh_category, '') not in ('A', 'ACC') then
      raise exception 'Para moto, a CNH precisa ser categoria A ou ACC';
    end if;
    -- Capacetes, protetor de pernas e aparador de linha não travam o cadastro: o que
    -- o motorista declara fica guardado, e a equipe só aprova quando confere tudo na vistoria.
  elsif coalesce(p_cnh_category, '') <> 'B' then
    raise exception 'Categoria de CNH inválida';
  end if;

  if length(trim(coalesce(p_terms_version, ''))) = 0 then
    raise exception 'É preciso aceitar os termos';
  end if;

  insert into public.drivers (id, city_id, vehicle_type, vehicle_model, vehicle_color, vehicle_plate, vehicle_year, pix_key)
  values (
    v_uid, p_city_id, p_vehicle_type, trim(p_vehicle_model), trim(p_vehicle_color), v_plate, p_vehicle_year,
    nullif(trim(coalesce(p_pix_key, '')), '')
  );

  insert into public.driver_private (
    driver_id, cpf, birth_date, cnh_category, cnh_ear,
    declared_helmets, declared_leg_guard, declared_line_cutter
  )
  values (
    v_uid, v_cpf, p_birth_date, p_cnh_category, true,
    coalesce(p_declared_helmets, false), coalesce(p_declared_leg_guard, false), coalesce(p_declared_line_cutter, false)
  );

  insert into public.driver_checklist (driver_id) values (v_uid);

  insert into public.driver_acceptances (driver_id, document, version)
  values (v_uid, 'termos', trim(p_terms_version));
exception
  when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'drivers_vehicle_plate_key' then
      raise exception 'Essa placa já está cadastrada';
    elsif v_constraint = 'driver_private_cpf_key' then
      raise exception 'Esse CPF já tem cadastro';
    end if;
    raise;
end;
$$;
