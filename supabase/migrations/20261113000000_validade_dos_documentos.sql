-- Documentos do motorista com validade: antecedentes criminais, documento do veículo (CRLV) e seguro de
-- acidentes pessoais de passageiros (APP). A equipe marca que conferiu e informa até quando o documento vale.
-- A primeira aprovação só passa com os três em dia (data informada e ainda não vencida). Depois, o painel avisa
-- quem está com documento vencendo ou vencido (staff_expiring_documents); a decisão de travar é da equipe.

alter table public.driver_checklist
  add column insurance_ok boolean not null default false,
  add column criminal_record_valid_until date,
  add column crlv_valid_until date,
  add column insurance_valid_until date;

-- ---------------------------------------------------------------------------
-- Lista de motoristas: ganha o seguro e as três validades (no fim das colunas)
-- ---------------------------------------------------------------------------

drop function public.staff_list_drivers(public.driver_status);

create function public.staff_list_drivers(p_status public.driver_status default null)
returns table (
  driver_id uuid,
  full_name text,
  phone text,
  status public.driver_status,
  vehicle_type public.vehicle_type,
  vehicle_model text,
  vehicle_color text,
  vehicle_plate text,
  vehicle_year int,
  city_name text,
  is_online boolean,
  created_at timestamptz,
  approved_at timestamptz,
  cpf text,
  birth_date date,
  cnh_category text,
  cnh_ear boolean,
  declared_helmets boolean,
  declared_leg_guard boolean,
  declared_line_cutter boolean,
  terms_accepted boolean,
  cnh_ok boolean,
  criminal_record_ok boolean,
  crlv_ok boolean,
  inspection_ok boolean,
  helmets_ok boolean,
  vest_delivered boolean,
  leg_guard_ok boolean,
  line_cutter_ok boolean,
  notes text,
  insurance_ok boolean,
  criminal_record_valid_until date,
  crlv_valid_until date,
  insurance_valid_until date
)
language plpgsql
stable
security definer set search_path = ''
as $$
begin
  perform private.require_staff();

  return query
  select
    d.id, p.full_name, p.phone, d.status, d.vehicle_type,
    d.vehicle_model, d.vehicle_color, d.vehicle_plate, d.vehicle_year,
    c.name, d.is_online, d.created_at, d.approved_at,
    dp.cpf, dp.birth_date, dp.cnh_category, dp.cnh_ear,
    dp.declared_helmets, dp.declared_leg_guard, dp.declared_line_cutter,
    exists (select 1 from public.driver_acceptances a where a.driver_id = d.id and a.document = 'termos'),
    ck.cnh_ok, ck.criminal_record_ok, ck.crlv_ok, ck.inspection_ok,
    ck.helmets_ok, ck.vest_delivered, ck.leg_guard_ok, ck.line_cutter_ok, ck.notes,
    ck.insurance_ok, ck.criminal_record_valid_until, ck.crlv_valid_until, ck.insurance_valid_until
  from public.drivers d
  join public.profiles p on p.id = d.id
  join public.cities c on c.id = d.city_id
  left join public.driver_private dp on dp.driver_id = d.id
  left join public.driver_checklist ck on ck.driver_id = d.id
  where p_status is null or d.status = p_status
  order by (d.status = 'pending') desc, d.created_at desc;
end;
$$;

revoke execute on function public.staff_list_drivers(public.driver_status) from public, anon;
grant execute on function public.staff_list_drivers(public.driver_status) to authenticated;

-- ---------------------------------------------------------------------------
-- Marcar o checklist: agora também o seguro e as datas de validade
-- ---------------------------------------------------------------------------
-- As datas chegam como texto "2027-03-31"; texto vazio apaga a data.

create or replace function public.staff_set_checklist(p_driver uuid, p_patch jsonb)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_key text;
  v_text text;
begin
  perform private.require_staff();

  -- Datas absurdas (ex.: ano 2207 por engano de digitação) são recusadas.
  foreach v_key in array array['criminal_record_valid_until', 'crlv_valid_until', 'insurance_valid_until'] loop
    if p_patch ? v_key then
      v_text := nullif(trim(p_patch ->> v_key), '');
      if v_text is not null and (v_text::date < date '2020-01-01' or v_text::date > current_date + interval '10 years') then
        raise exception 'Confira a data de validade';
      end if;
    end if;
  end loop;

  update public.driver_checklist c
  set cnh_ok = coalesce((p_patch ->> 'cnh_ok')::boolean, c.cnh_ok),
      criminal_record_ok = coalesce((p_patch ->> 'criminal_record_ok')::boolean, c.criminal_record_ok),
      crlv_ok = coalesce((p_patch ->> 'crlv_ok')::boolean, c.crlv_ok),
      insurance_ok = coalesce((p_patch ->> 'insurance_ok')::boolean, c.insurance_ok),
      inspection_ok = coalesce((p_patch ->> 'inspection_ok')::boolean, c.inspection_ok),
      helmets_ok = coalesce((p_patch ->> 'helmets_ok')::boolean, c.helmets_ok),
      vest_delivered = coalesce((p_patch ->> 'vest_delivered')::boolean, c.vest_delivered),
      leg_guard_ok = coalesce((p_patch ->> 'leg_guard_ok')::boolean, c.leg_guard_ok),
      line_cutter_ok = coalesce((p_patch ->> 'line_cutter_ok')::boolean, c.line_cutter_ok),
      criminal_record_valid_until = case when p_patch ? 'criminal_record_valid_until'
        then nullif(trim(p_patch ->> 'criminal_record_valid_until'), '')::date else c.criminal_record_valid_until end,
      crlv_valid_until = case when p_patch ? 'crlv_valid_until'
        then nullif(trim(p_patch ->> 'crlv_valid_until'), '')::date else c.crlv_valid_until end,
      insurance_valid_until = case when p_patch ? 'insurance_valid_until'
        then nullif(trim(p_patch ->> 'insurance_valid_until'), '')::date else c.insurance_valid_until end,
      notes = case when p_patch ? 'notes' then nullif(trim(p_patch ->> 'notes'), '') else c.notes end,
      updated_at = now()
  where c.driver_id = p_driver;

  if not found then
    raise exception 'Motorista sem checklist';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Trava da primeira aprovação: documentos em dia, com validade
-- ---------------------------------------------------------------------------

create or replace function private.guard_driver_approval()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  v_check public.driver_checklist;
  v_missing text[] := '{}';
begin
  -- Só vale na primeira aprovação; voltar de uma suspensão não pede tudo de novo.
  if new.status = 'approved' and old.status = 'pending' then
    if not exists (select 1 from public.driver_private p where p.driver_id = new.id) then
      raise exception 'Cadastro incompleto: o motorista precisa fazer o cadastro completo pelo app';
    end if;

    select * into v_check from public.driver_checklist c where c.driver_id = new.id;
    if not found then
      raise exception 'Cadastro sem checklist da equipe';
    end if;

    if not exists (
      select 1 from public.driver_acceptances a where a.driver_id = new.id and a.document = 'termos'
    ) then
      v_missing := v_missing || 'aceite dos termos'::text;
    end if;
    if not v_check.cnh_ok then v_missing := v_missing || 'CNH com EAR'::text; end if;

    if not v_check.criminal_record_ok then
      v_missing := v_missing || 'antecedentes criminais'::text;
    elsif v_check.criminal_record_valid_until is null then
      v_missing := v_missing || 'validade dos antecedentes criminais'::text;
    elsif v_check.criminal_record_valid_until < current_date then
      v_missing := v_missing || 'antecedentes criminais vencidos'::text;
    end if;

    if not v_check.crlv_ok then
      v_missing := v_missing || 'CRLV em dia'::text;
    elsif v_check.crlv_valid_until is null then
      v_missing := v_missing || 'validade do CRLV'::text;
    elsif v_check.crlv_valid_until < current_date then
      v_missing := v_missing || 'CRLV vencido'::text;
    end if;

    if not v_check.insurance_ok then
      v_missing := v_missing || 'seguro de acidentes pessoais (APP)'::text;
    elsif v_check.insurance_valid_until is null then
      v_missing := v_missing || 'validade do seguro'::text;
    elsif v_check.insurance_valid_until < current_date then
      v_missing := v_missing || 'seguro vencido'::text;
    end if;

    if not v_check.inspection_ok then v_missing := v_missing || 'vistoria do veículo'::text; end if;

    if new.vehicle_type = 'moto' then
      if not v_check.helmets_ok then v_missing := v_missing || 'dois capacetes'::text; end if;
      if not v_check.vest_delivered then v_missing := v_missing || 'colete entregue'::text; end if;
      if not v_check.leg_guard_ok then v_missing := v_missing || 'protetor de pernas'::text; end if;
      if not v_check.line_cutter_ok then v_missing := v_missing || 'aparador de linha'::text; end if;
    end if;

    if cardinality(v_missing) > 0 then
      raise exception 'Falta confirmar antes de aprovar: %', array_to_string(v_missing, ', ');
    end if;

    new.approved_at := coalesce(new.approved_at, now());
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Aviso de documentos vencendo ou vencidos (motoristas aprovados)
-- ---------------------------------------------------------------------------
-- Uma linha por documento com problema: vencido, vence nos próximos p_days dias ou sem data informada.
-- days_left é negativo quando já venceu e vazio quando falta a data.

create function public.staff_expiring_documents(p_days int default 30)
returns table (
  driver_id uuid,
  full_name text,
  phone text,
  vehicle_type public.vehicle_type,
  document text,
  valid_until date,
  days_left int
)
language plpgsql
stable
security definer set search_path = ''
as $$
begin
  perform private.require_staff();

  return query
  select x.id, x.full_name, x.phone, x.vehicle_type, x.document, x.valid_until,
         case when x.valid_until is null then null else (x.valid_until - current_date)::int end
  from (
    select d.id, p.full_name, p.phone, d.vehicle_type, v.document, v.valid_until
    from public.drivers d
    join public.profiles p on p.id = d.id
    join public.driver_checklist ck on ck.driver_id = d.id
    cross join lateral (values
      ('Antecedentes criminais', ck.criminal_record_valid_until),
      ('Documento do veículo (CRLV)', ck.crlv_valid_until),
      ('Seguro de acidentes pessoais (APP)', ck.insurance_valid_until)
    ) as v (document, valid_until)
    where d.status = 'approved'
  ) x
  where x.valid_until is null or x.valid_until <= current_date + greatest(coalesce(p_days, 30), 0)
  order by x.valid_until nulls first, x.full_name;
end;
$$;

revoke execute on function public.staff_expiring_documents(int) from public, anon;
grant execute on function public.staff_expiring_documents(int) to authenticated;
