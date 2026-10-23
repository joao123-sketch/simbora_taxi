-- Cartão (maquininha do motorista) entra como forma de pagamento.
-- Fica sozinho neste arquivo: o Postgres não deixa usar um valor de enum novo
-- na mesma transação em que ele nasce.

alter type public.payment_method add value if not exists 'card';
