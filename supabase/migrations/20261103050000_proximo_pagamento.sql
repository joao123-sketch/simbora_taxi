-- Mensalidade: a tela do motorista mostra o histórico de pagamentos e a data e o valor do próximo.
-- Igual à my_fee_status de 20261025020000_mensalidade.sql, mais next_due_on e next_amount, e 12 meses de histórico.

create or replace function public.my_fee_status()
returns jsonb
language plpgsql
stable
security definer set search_path = ''
as $$
declare
  v_state record;
  v_period public.driver_fee_periods;
  v_pix public.pix_settings;
  v_last public.driver_fee_periods;
  v_vehicle public.vehicle_type;
  v_had_free boolean;
  v_paid int;
  v_next_due date;
  v_next_amount numeric;
begin
  if not exists (select 1 from public.drivers d where d.id = (select auth.uid()) and d.status = 'approved') then
    return null;
  end if;

  select * into v_state from private.fee_state((select auth.uid()));

  if v_state.period_id is not null then
    select * into v_period from public.driver_fee_periods p where p.id = v_state.period_id;
  end if;

  select * into v_pix from public.pix_settings where id = 1;

  -- Próximo pagamento: o mês aberto, se há; senão o do mês que vem, que vence quando o atual acaba.
  select * into v_last from public.driver_fee_periods p
  where p.driver_id = (select auth.uid()) order by p.period_start desc limit 1;

  if v_last.id is not null then
    if v_last.status = 'open' then
      v_next_due := v_last.due_on;
      v_next_amount := v_last.amount;
    else
      select d.vehicle_type into v_vehicle from public.drivers d where d.id = (select auth.uid());
      select coalesce(bool_or(p.kind = 'free'), false),
             count(*) filter (where p.status = 'paid' and p.kind in ('entry', 'standard'))
      into v_had_free, v_paid
      from public.driver_fee_periods p where p.driver_id = (select auth.uid());
      v_next_due := v_last.period_end;
      v_next_amount := coalesce(private.fee_amount(v_vehicle, private.fee_kind_for(v_had_free, v_paid), v_next_due), 0);
    end if;
  end if;

  return jsonb_build_object(
    'state', v_state.state,
    'due_on', v_state.due_on,
    'days_late', v_state.days_late,
    'grace_days', private.fee_grace_days(),
    'period_id', v_state.period_id,
    'kind', v_state.kind,
    'amount', v_state.amount,
    'period_start', v_state.period_start,
    'period_end', v_state.period_end,
    'needs_renewal', v_state.needs_renewal,
    'next_due_on', v_next_due,
    'next_amount', v_next_amount,
    'claimed_at', v_period.claimed_at,
    'receipt_path', v_period.receipt_path,
    -- O Pix só aparece quando há algo a pagar.
    'pix', case
      when v_state.state in ('pending', 'due', 'overdue') and v_pix.pix_key is not null
      then jsonb_build_object(
        'key', v_pix.pix_key, 'name', v_pix.receiver_name, 'city', v_pix.receiver_city,
        'description', v_pix.description)
    end,
    'history', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'period_start', p.period_start, 'period_end', p.period_end, 'kind', p.kind,
        'amount', p.amount, 'status', p.status, 'paid_at', p.paid_at
      ) order by p.period_start desc), '[]'::jsonb)
      from (
        select * from public.driver_fee_periods x
        where x.driver_id = (select auth.uid())
        order by x.period_start desc
        limit 12
      ) p
    )
  );
end;
$$;
