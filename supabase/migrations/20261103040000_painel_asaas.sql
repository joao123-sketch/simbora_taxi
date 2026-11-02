-- Painel: a lista de mensalidades mostra o id da cobrança do Asaas de cada mês.
-- Igual à staff_list_fees de 20261025020000_mensalidade.sql, mais o campo asaas_payment_id.

create or replace function public.staff_list_fees(p_all boolean default false)
returns jsonb
language plpgsql
stable
security definer set search_path = ''
as $$
begin
  perform private.require_staff();

  return (
    select coalesce(jsonb_agg(item order by (item ->> 'rank')::int, (item ->> 'due_on')), '[]'::jsonb)
    from (
      select jsonb_build_object(
        'driver_id', d.id,
        'driver_name', pr.full_name,
        'vehicle_type', d.vehicle_type,
        'vehicle_plate', d.vehicle_plate,
        'state', st.state,
        'due_on', st.due_on,
        'days_late', st.days_late,
        'period_id', st.period_id,
        'kind', st.kind,
        'amount', st.amount,
        'needs_renewal', st.needs_renewal,
        'claimed_at', per.claimed_at,
        'receipt_path', per.receipt_path,
        'asaas_payment_id', fc.asaas_payment_id,
        'rank', case st.state when 'overdue' then 0 when 'due' then 1 when 'pending' then 2 else 3 end
      ) as item
      from public.drivers d
      join public.profiles pr on pr.id = d.id
      cross join lateral private.fee_state(d.id) st
      left join public.driver_fee_periods per on per.id = st.period_id
      left join public.fee_charges fc on fc.period_id = st.period_id
      where d.status = 'approved'
        and (p_all or st.state <> 'ok')
    ) x
  );
end;
$$;
