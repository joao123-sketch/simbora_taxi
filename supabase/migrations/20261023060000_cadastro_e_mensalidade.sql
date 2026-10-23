-- Etapa 4: cadastro completo do motorista e modelo da mensalidade.
--
-- Dados pessoais (CPF, nascimento, CNH) ficam em tabelas à parte: o passageiro
-- pode ler a linha de `drivers` do motorista da corrida dele, e o RLS não
-- filtra coluna. Aqui só o próprio motorista lê o que é dele.

create type public.fee_kind as enum ('free', 'entry', 'standard');
create type public.fee_status as enum ('open', 'paid', 'waived');

-- ---------------------------------------------------------------------------
-- Dados pessoais e declarações do motorista
-- ---------------------------------------------------------------------------

create table public.driver_private (
  driver_id uuid primary key references public.drivers (id) on delete cascade,
  cpf text not null,
  birth_date date not null,
  cnh_category text not null,
  cnh_ear boolean not null,
  declared_helmets boolean not null default false,
  declared_leg_guard boolean not null default false,
  declared_line_cutter boolean not null default false,
  created_at timestamptz not null default now(),
  constraint driver_private_cpf_key unique (cpf),
  constraint driver_private_cpf_format check (cpf ~ '^[0-9]{11}$'),
  constraint driver_private_cnh_category check (cnh_category in ('B', 'A', 'ACC'))
);

-- O que a equipe confere nas reuniões e na vistoria, antes de aprovar.
create table public.driver_checklist (
  driver_id uuid primary key references public.drivers (id) on delete cascade,
  cnh_ok boolean not null default false,
  criminal_record_ok boolean not null default false,
  crlv_ok boolean not null default false,
  inspection_ok boolean not null default false,
  -- Só para moto:
  helmets_ok boolean not null default false,
  vest_delivered boolean not null default false,
  leg_guard_ok boolean not null default false,
  line_cutter_ok boolean not null default false,
  notes text,
  updated_at timestamptz not null default now()
);

-- Aceites de termos e de contrato, com a versão do texto aceito.
create table public.driver_acceptances (
  id bigint generated always as identity primary key,
  driver_id uuid not null references public.drivers (id) on delete cascade,
  document text not null check (document in ('termos', 'contrato')),
  version text not null,
  accepted_at timestamptz not null default now(),
  unique (driver_id, document, version)
);

alter table public.driver_private enable row level security;
alter table public.driver_checklist enable row level security;
alter table public.driver_acceptances enable row level security;

create policy "motorista vê os próprios dados" on public.driver_private
  for select to authenticated using (driver_id = (select auth.uid()));
create policy "motorista vê o próprio checklist" on public.driver_checklist
  for select to authenticated using (driver_id = (select auth.uid()));
create policy "motorista vê os próprios aceites" on public.driver_acceptances
  for select to authenticated using (driver_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- CPF
-- ---------------------------------------------------------------------------

create function private.is_valid_cpf(p_cpf text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  d int[];
  i int;
  s int;
  r int;
begin
  if p_cpf is null or p_cpf !~ '^[0-9]{11}$' then
    return false;
  end if;
  -- 111.111.111-11 e parecidos passam na conta, mas não existem.
  if p_cpf ~ '^(.)\1{10}$' then
    return false;
  end if;

  for i in 1..11 loop
    d[i] := substr(p_cpf, i, 1)::int;
  end loop;

  s := 0;
  for i in 1..9 loop
    s := s + d[i] * (11 - i);
  end loop;
  r := (s * 10) % 11;
  if r = 10 then r := 0; end if;
  if r <> d[10] then
    return false;
  end if;

  s := 0;
  for i in 1..10 loop
    s := s + d[i] * (12 - i);
  end loop;
  r := (s * 10) % 11;
  if r = 10 then r := 0; end if;
  return r = d[11];
end;
$$;

-- ---------------------------------------------------------------------------
-- Mensalidade
-- ---------------------------------------------------------------------------

-- Quanto custa cada tipo de mês, por veículo. A moto começa igual ao carro e
-- pode mudar depois com dados reais, sem mexer em código.
create table public.fee_schedule (
  vehicle_type public.vehicle_type not null,
  kind public.fee_kind not null,
  amount numeric(10, 2) not null check (amount >= 0),
  effective_from date not null default date '2026-01-01',
  primary key (vehicle_type, kind, effective_from)
);

insert into public.fee_schedule (vehicle_type, kind, amount) values
  ('car', 'free', 0), ('car', 'entry', 200), ('car', 'standard', 300),
  ('moto', 'free', 0), ('moto', 'entry', 200), ('moto', 'standard', 300);

-- Início do mês grátis e do contrato. O contrato começa no mês 2, quando o
-- motorista decide continuar, e faz aniversário 12 meses depois.
create table public.driver_subscriptions (
  driver_id uuid primary key references public.drivers (id) on delete cascade,
  trial_started_on date not null,
  contract_started_on date,
  contract_anniversary date,
  created_at timestamptz not null default now()
);

-- Um mês de cobrança. Pago antes de liberar o mês (vence no primeiro dia) e
-- sem devolução proporcional se o motorista sair no meio.
create table public.driver_fee_periods (
  id bigint generated always as identity primary key,
  driver_id uuid not null references public.drivers (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  kind public.fee_kind not null,
  amount numeric(10, 2) not null,
  status public.fee_status not null default 'open',
  due_on date not null,
  paid_at timestamptz,
  unique (driver_id, period_start),
  check (period_end > period_start)
);

alter table public.fee_schedule enable row level security;
alter table public.driver_subscriptions enable row level security;
alter table public.driver_fee_periods enable row level security;

create policy "valores da mensalidade visíveis" on public.fee_schedule
  for select to authenticated using (true);
create policy "motorista vê a própria assinatura" on public.driver_subscriptions
  for select to authenticated using (driver_id = (select auth.uid()));
create policy "motorista vê os próprios meses" on public.driver_fee_periods
  for select to authenticated using (driver_id = (select auth.uid()));

-- Que mês vem agora: o grátis (uma vez só), o de entrada (R$ 200) enquanto o
-- motorista nunca pagou, e o padrão (R$ 300) depois que já pagou algum.
--   primeira vez ................................ grátis, depois R$ 200, depois R$ 300
--   saiu depois do grátis sem nunca pagar ....... volta pagando R$ 200, depois R$ 300
--   já pagou os R$ 200 e volta .................. volta pagando R$ 300
create function private.fee_kind_for(p_had_free boolean, p_paid_count int)
returns public.fee_kind
language sql
immutable
set search_path = ''
as $$
  select case
    when not p_had_free then 'free'::public.fee_kind
    when p_paid_count = 0 then 'entry'::public.fee_kind
    else 'standard'::public.fee_kind
  end;
$$;

-- Confere a regra na hora de aplicar a migration; se algum dia mudar, falha aqui.
do $$
begin
  if private.fee_kind_for(false, 0) <> 'free'
     or private.fee_kind_for(true, 0) <> 'entry'
     or private.fee_kind_for(true, 1) <> 'standard'
     or private.fee_kind_for(true, 7) <> 'standard' then
    raise exception 'Regra da mensalidade errada';
  end if;
  if not private.is_valid_cpf('52998224725')
     or private.is_valid_cpf('52998224724')
     or private.is_valid_cpf('11111111111')
     or private.is_valid_cpf('123') then
    raise exception 'Validação de CPF errada';
  end if;
end;
$$;

create function private.fee_amount(p_vehicle public.vehicle_type, p_kind public.fee_kind, p_on date)
returns numeric
language sql
stable
set search_path = ''
as $$
  select f.amount
  from public.fee_schedule f
  where f.vehicle_type = p_vehicle and f.kind = p_kind and f.effective_from <= p_on
  order by f.effective_from desc
  limit 1;
$$;

-- Abre o próximo mês do motorista pela regra acima. O mês grátis nasce
-- "dispensado" (waived), para não contar como mês pago.
create function private.open_next_period(p_driver uuid, p_start date)
returns bigint
language plpgsql
security definer set search_path = ''
as $$
declare
  v_vehicle public.vehicle_type;
  v_had_free boolean;
  v_paid int;
  v_kind public.fee_kind;
  v_amount numeric;
  v_id bigint;
begin
  select d.vehicle_type into v_vehicle from public.drivers d where d.id = p_driver;

  select coalesce(bool_or(p.kind = 'free'), false),
         count(*) filter (where p.status = 'paid' and p.kind in ('entry', 'standard'))
  into v_had_free, v_paid
  from public.driver_fee_periods p
  where p.driver_id = p_driver;

  v_kind := private.fee_kind_for(v_had_free, v_paid);
  v_amount := coalesce(private.fee_amount(v_vehicle, v_kind, p_start), 0);

  insert into public.driver_fee_periods (driver_id, period_start, period_end, kind, amount, status, due_on)
  values (
    p_driver, p_start, (p_start + interval '1 month')::date, v_kind, v_amount,
    case when v_kind = 'free' then 'waived'::public.fee_status else 'open'::public.fee_status end,
    p_start
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- O mês grátis começa quando o motorista é aprovado, e só uma vez.
create function private.start_trial(p_driver uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.driver_subscriptions (driver_id, trial_started_on)
  values (p_driver, current_date)
  on conflict (driver_id) do nothing
  returning driver_id into v_id;

  if v_id is not null then
    perform private.open_next_period(p_driver, current_date);
  end if;
end;
$$;

revoke execute on function private.is_valid_cpf(text) from public, anon, authenticated;
revoke execute on function private.fee_kind_for(boolean, int) from public, anon, authenticated;
revoke execute on function private.fee_amount(public.vehicle_type, public.fee_kind, date) from public, anon, authenticated;
revoke execute on function private.open_next_period(uuid, date) from public, anon, authenticated;
revoke execute on function private.start_trial(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Aprovação: só com tudo conferido, e o mês grátis começa sozinho
-- ---------------------------------------------------------------------------

create function private.guard_driver_approval()
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
    if not v_check.criminal_record_ok then v_missing := v_missing || 'antecedentes criminais'::text; end if;
    if not v_check.crlv_ok then v_missing := v_missing || 'CRLV em dia'::text; end if;
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

create trigger drivers_approval_guard
  before update of status on public.drivers
  for each row execute function private.guard_driver_approval();

create function private.on_driver_approved()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    perform private.start_trial(new.id);
  end if;
  return new;
end;
$$;

create trigger drivers_start_trial
  after update of status on public.drivers
  for each row execute function private.on_driver_approved();

revoke execute on function private.guard_driver_approval() from public, anon, authenticated;
revoke execute on function private.on_driver_approved() from public, anon, authenticated;

-- Quem já estava aprovado ganha o mês grátis a partir de hoje.
do $$
declare
  r record;
begin
  for r in select d.id from public.drivers d where d.status = 'approved' loop
    perform private.start_trial(r.id);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cadastro do motorista: tudo numa função, com os dados pessoais separados
-- ---------------------------------------------------------------------------

drop policy "motorista se cadastra como pendente" on public.drivers;

create function public.register_driver(
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
    if not (coalesce(p_declared_helmets, false) and coalesce(p_declared_leg_guard, false) and coalesce(p_declared_line_cutter, false)) then
      raise exception 'Para moto é preciso ter capacete para você e para o passageiro, protetor de pernas e aparador de linha';
    end if;
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

revoke execute on function public.register_driver(
  bigint, public.vehicle_type, text, text, text, int, text, text, date, text, boolean, boolean, boolean, boolean, text
) from public, anon;
grant execute on function public.register_driver(
  bigint, public.vehicle_type, text, text, text, int, text, text, date, text, boolean, boolean, boolean, boolean, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- Continuar depois do mês grátis (o contrato começa no mês 2)
-- ---------------------------------------------------------------------------

create function public.continue_contract(p_contract_version text)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_last public.driver_fee_periods;
  v_start date;
begin
  if not exists (select 1 from public.drivers d where d.id = v_uid and d.status = 'approved') then
    raise exception 'Só motorista aprovado pode continuar';
  end if;

  if not exists (select 1 from public.driver_subscriptions s where s.driver_id = v_uid) then
    raise exception 'O seu mês grátis ainda não começou';
  end if;

  if length(trim(coalesce(p_contract_version, ''))) = 0 then
    raise exception 'É preciso aceitar o contrato';
  end if;

  select * into v_last
  from public.driver_fee_periods p
  where p.driver_id = v_uid
  order by p.period_start desc
  limit 1;

  if v_last.status = 'open' then
    raise exception 'Você já tem uma mensalidade em aberto';
  end if;

  if v_last.kind <> 'free' and v_last.period_end > current_date then
    raise exception 'O seu mês ainda está valendo';
  end if;

  -- Durante o mês grátis o contrato começa quando ele acaba; quem volta depois
  -- de sair começa hoje.
  v_start := greatest(v_last.period_end, current_date);

  insert into public.driver_acceptances (driver_id, document, version)
  values (v_uid, 'contrato', trim(p_contract_version))
  on conflict (driver_id, document, version) do nothing;

  update public.driver_subscriptions
  set contract_started_on = v_start,
      contract_anniversary = (v_start + interval '12 months')::date
  where driver_id = v_uid;

  perform private.open_next_period(v_uid, v_start);
end;
$$;

revoke execute on function public.continue_contract(text) from public, anon;
grant execute on function public.continue_contract(text) to authenticated;
