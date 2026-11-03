-- Cancela as corridas em andamento (pedidas, aceitas, motorista chegou, em viagem).
-- NÃO é uma migration: é para colar no SQL Editor do Supabase e rodar quando precisar
-- destravar os testes. Corridas já concluídas ou canceladas não mudam.
--
-- Diferente do botão do app: cancela também corrida 'in_progress', que a função
-- cancel_ride() recusa.
--
-- NÃO MEXE: viagens agendadas que ainda faltam mais de 1 hora (private.ride_is_live).
--
-- cancelled_at recebe o horário do pedido, não now(): assim o preço dinâmico
-- (private.demand_factor) não conta estes cancelamentos como "pedido que esperou
-- mais de 60 s" e o fator não sobe por causa da limpeza.
-- cancelled_by fica vazio de propósito: não conta como cancelamento de motorista
-- nos relatórios (cancel_rate).

-- Antes de rodar o update, confira quantas corridas serão canceladas (rode só este select):
--   select status, count(*) from public.rides
--   where status in ('requested', 'accepted', 'arrived', 'in_progress')
--     and private.ride_is_live(scheduled_for)
--   group by status;
-- Se houver corrida in_progress com passageiro a bordo, NÃO rode.

begin;

update public.rides
set status = 'cancelled', cancelled_at = requested_at
where status in ('requested', 'accepted', 'arrived', 'in_progress')
  and private.ride_is_live(scheduled_for);

commit;
