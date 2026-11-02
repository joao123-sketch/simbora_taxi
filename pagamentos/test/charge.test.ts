import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AsaasError } from '../src/asaas.ts';
import { getOrCreateCharge } from '../src/charge.ts';
import { asaasConfig, fakeFetch, newWorld, supabaseConfig } from './fakes.ts';

function deps(world: ReturnType<typeof newWorld>) {
  return { fetch: fakeFetch(world), asaas: asaasConfig, supabase: supabaseConfig };
}

const asaasPosts = (w: ReturnType<typeof newWorld>, path: string) =>
  w.calls.filter((c) => c.service === 'asaas' && c.method === 'POST' && c.path === path);

test('sem cliente no banco cria o cliente uma vez e salva', async () => {
  const world = newWorld();
  await getOrCreateCharge(deps(world), 'drv-1');
  assert.equal(asaasPosts(world, '/v3/customers').length, 1);
  assert.equal(world.customers.get('drv-1'), 'cus_1');
});

test('com cliente salvo não cria outro cliente', async () => {
  const world = newWorld();
  world.customers.set('drv-1', 'cus_ja_existe');
  await getOrCreateCharge(deps(world), 'drv-1');
  assert.equal(asaasPosts(world, '/v3/customers').length, 0);
  assert.equal((asaasPosts(world, '/v3/payments')[0].body as { customer: string }).customer, 'cus_ja_existe');
});

test('o valor do pagamento vem do banco', async () => {
  const world = newWorld();
  world.periods[0].amount = 300;
  await getOrCreateCharge(deps(world), 'drv-1');
  assert.equal((asaasPosts(world, '/v3/payments')[0].body as { value: number }).value, 300);
});

test('com cobrança já salva não cria outro pagamento e devolve a salva', async () => {
  const world = newWorld();
  const first = await getOrCreateCharge(deps(world), 'drv-1');
  const second = await getOrCreateCharge(deps(world), 'drv-1');
  assert.equal(asaasPosts(world, '/v3/payments').length, 1);
  assert.equal(second.invoiceUrl, first.invoiceUrl);
  assert.equal(second.pixPayload, 'PIX-pay_1');
  assert.equal(second.pixQrImage, 'IMG-pay_1');
  assert.equal(second.amount, 200);
  assert.equal(second.dueOn, '2026-11-05');
});

test('dois pedidos ao mesmo tempo terminam com a mesma cobrança', async () => {
  const world = newWorld({ paymentDelayMs: 20 });
  const [a, b] = await Promise.all([getOrCreateCharge(deps(world), 'drv-1'), getOrCreateCharge(deps(world), 'drv-1')]);
  assert.equal(a.invoiceUrl, b.invoiceUrl);
  assert.equal(world.charges.size, 1);
});

test('erro do Asaas propaga e não salva cobrança', async () => {
  const world = newWorld({ asaasFails: true });
  await assert.rejects(() => getOrCreateCharge(deps(world), 'drv-1'), (e) => e instanceof AsaasError);
  assert.equal(world.charges.size, 0);
});

test('motorista sem CPF cadastrado não gera cobrança', async () => {
  const world = newWorld();
  world.driver.cpf = null;
  await assert.rejects(() => getOrCreateCharge(deps(world), 'drv-1'), /CPF/);
  assert.equal(asaasPosts(world, '/v3/customers').length, 0);
});

test('o erro do banco chega com a mensagem em português', async () => {
  const world = newWorld();
  world.driver.approved = false;
  await assert.rejects(() => getOrCreateCharge(deps(world), 'drv-1'), /Só motorista aprovado paga mensalidade/);
});
