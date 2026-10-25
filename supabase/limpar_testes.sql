-- Limpa os dados de TESTE e deixa o sistema como novo, sem perder contas nem configurações.
-- NÃO é uma migration: é para colar no SQL Editor do Supabase e rodar uma vez, quando
-- você quiser zerar os testes. Não dá para desfazer.
--
-- APAGA: todas as corridas e tudo que depende delas (histórico, propostas, mensagens do
--   chat, notas, ofertas, links de trajeto, códigos de entrega, desistências), cotações,
--   posições, tempo online, motoristas favoritos e o estado do preço dinâmico.
-- MANTÉM: contas, motoristas (aprovados ou não), cadastros e checklists, tarifas e preços
--   entre cidades, taxa do cartão, tamanhos de pacote, dados do Pix, equipe do painel e
--   as mensalidades de cada motorista (só tira o aviso de "já paguei" dos meses em aberto).
-- NÃO MEXE: os comprovantes enviados ficam no armazenamento (apague em Storage > fee-receipts,
--   se quiser).

begin;

truncate table public.rides restart identity cascade;

truncate table
  public.price_quotes,
  public.delivery_quotes,
  public.passenger_locations,
  public.driver_locations,
  public.driver_online_sessions,
  public.favorite_drivers,
  public.city_pricing_state;

update public.drivers set is_online = false;

update public.driver_fee_periods
set claimed_at = null, receipt_path = null
where status = 'open';

commit;
