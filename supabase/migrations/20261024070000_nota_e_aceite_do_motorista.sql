-- O motorista passa a ver, no dashboard de "Minhas corridas", a própria nota
-- média e a taxa de aceite. As notas individuais continuam escondidas: ele só
-- recebe a média e a contagem, como números juntos.
--
--   nota média ..... média das estrelas que os passageiros deram nas corridas
--                    concluídas dele no período
--   taxa de aceite . aceitou ÷ (aceitou + recusou), só o que ele decidiu; pedido
--                    que ele deixou passar não conta (mesma regra do driver_stats)

create function public.driver_rating_summary(p_since timestamptz)
returns table (
  rating_avg numeric,
  rating_count int,
  accept_rate numeric,
  offers_accepted int,
  offers_declined int
)
language sql
stable
security definer set search_path = ''
as $$
  with notas as (
    select x.passenger_to_driver as stars
    from public.rides r
    join public.ride_ratings x on x.ride_id = r.id
    where r.driver_id = auth.uid()
      and r.status = 'completed'
      and r.completed_at >= p_since
      and x.passenger_to_driver is not null
  ),
  ofertas as (
    select
      count(*) filter (where o.status = 'accepted')::int as aceitas,
      count(*) filter (where o.status = 'declined')::int as recusadas
    from public.ride_offers o
    where o.driver_id = auth.uid()
      and o.created_at >= p_since
  )
  select
    (select round(avg(stars), 2) from notas),
    (select count(*)::int from notas),
    round(o.aceitas::numeric / nullif(o.aceitas + o.recusadas, 0), 3),
    o.aceitas,
    o.recusadas
  from ofertas o;
$$;

revoke execute on function public.driver_rating_summary(timestamptz) from public, anon;
grant execute on function public.driver_rating_summary(timestamptz) to authenticated;
