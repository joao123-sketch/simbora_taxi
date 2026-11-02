-- Mensalidade pelo Asaas: cada mês aberto de um motorista ganha uma cobrança no Asaas (Pix ou cartão),
-- gerada até 5 dias antes do vencimento. O Worker simbora-pagamentos fala com o Asaas e usa as
-- funções abaixo, que só a chave de serviço (service_role) executa; o app e o painel não mexem aqui.

-- O cliente do Asaas de cada motorista (criado na primeira cobrança).
create table public.asaas_customers (
  driver_id uuid primary key references public.drivers (id) on delete cascade,
  asaas_customer_id text not null unique,
  created_at timestamptz not null default now()
);

-- A cobrança de cada mês: no máximo uma por mês.
create table public.fee_charges (
  period_id bigint primary key references public.driver_fee_periods (id) on delete cascade,
  asaas_payment_id text not null unique,
  invoice_url text not null,
  pix_payload text,
  created_at timestamptz not null default now()
);

alter table public.asaas_customers enable row level security;
alter table public.fee_charges enable row level security;
revoke all on public.asaas_customers from anon, authenticated;
revoke all on public.fee_charges from anon, authenticated;

-- Dados para gerar (ou reencontrar) a cobrança do mês aberto mais antigo de um motorista aprovado.
-- O valor vem daqui, nunca do app.
create function public.asaas_charge_context(p_driver uuid)
returns table (
  period_id bigint,
  amount numeric,
  due_on date,
  period_start date,
  full_name text,
  cpf text,
  phone text,
  asaas_customer_id text,
  asaas_payment_id text,
  invoice_url text,
  pix_payload text
)
language plpgsql
stable
security definer set search_path = ''
as $$
declare
  v_period public.driver_fee_periods;
begin
  if not exists (select 1 from public.drivers d where d.id = p_driver and d.status = 'approved') then
    raise exception 'Só motorista aprovado paga mensalidade';
  end if;

  select * into v_period
  from public.driver_fee_periods p
  where p.driver_id = p_driver and p.status = 'open'
  order by p.period_start
  limit 1;

  if not found then
    raise exception 'Você não tem mensalidade para pagar agora';
  end if;

  -- A cobrança abre 5 dias antes do vencimento (e vale também para o que já venceu).
  if v_period.due_on > current_date + 5 then
    raise exception 'A cobrança abre 5 dias antes do vencimento';
  end if;

  return query
  select v_period.id, v_period.amount, v_period.due_on, v_period.period_start,
         pr.full_name, dp.cpf, pr.phone,
         ac.asaas_customer_id, fc.asaas_payment_id, fc.invoice_url, fc.pix_payload
  from public.profiles pr
  left join public.driver_private dp on dp.driver_id = pr.id
  left join public.asaas_customers ac on ac.driver_id = pr.id
  left join public.fee_charges fc on fc.period_id = v_period.id
  where pr.id = p_driver;
end;
$$;

create function public.asaas_save_customer(p_driver uuid, p_customer_id text)
returns void
language sql
security definer set search_path = ''
as $$
  insert into public.asaas_customers (driver_id, asaas_customer_id)
  values (p_driver, p_customer_id)
  on conflict (driver_id) do nothing;
$$;

-- Guarda a cobrança do mês. Se já existe uma, a primeira vale (um pagamento por mês).
create function public.asaas_save_charge(p_period_id bigint, p_payment_id text, p_invoice_url text, p_pix_payload text)
returns void
language sql
security definer set search_path = ''
as $$
  insert into public.fee_charges (period_id, asaas_payment_id, invoice_url, pix_payload)
  values (p_period_id, p_payment_id, p_invoice_url, p_pix_payload)
  on conflict (period_id) do nothing;
$$;

-- O Asaas avisou que o pagamento caiu: baixa o mês. Devolve true se baixou e false se o mês
-- já estava pago ou o pagamento é desconhecido (o aviso pode chegar duas vezes).
create function public.asaas_mark_paid(p_payment_id text)
returns boolean
language plpgsql
security definer set search_path = ''
as $$
begin
  update public.driver_fee_periods p
  set status = 'paid', paid_at = now()
  from public.fee_charges c
  where c.period_id = p.id
    and c.asaas_payment_id = p_payment_id
    and p.status = 'open';
  return found;
end;
$$;

revoke execute on function public.asaas_charge_context(uuid) from public, anon, authenticated;
revoke execute on function public.asaas_save_customer(uuid, text) from public, anon, authenticated;
revoke execute on function public.asaas_save_charge(bigint, text, text, text) from public, anon, authenticated;
revoke execute on function public.asaas_mark_paid(text) from public, anon, authenticated;
grant execute on function public.asaas_charge_context(uuid) to service_role;
grant execute on function public.asaas_save_customer(uuid, text) to service_role;
grant execute on function public.asaas_save_charge(bigint, text, text, text) to service_role;
grant execute on function public.asaas_mark_paid(text) to service_role;
