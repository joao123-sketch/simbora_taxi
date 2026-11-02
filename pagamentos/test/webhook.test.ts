import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getOrCreateCharge } from '../src/charge.ts';
import { handleWebhook } from '../src/webhook.ts';
import { asaasConfig, fakeFetch, newWorld, supabaseConfig, type Call } from './fakes.ts';

const TOKEN = 'token-do-webhook-com-bem-mais-de-trinta-e-dois-caracteres';

async function setup() {
  const world = newWorld();
  const f = fakeFetch(world);
  await getOrCreateCharge({ fetch: f, asaas: asaasConfig, supabase: supabaseConfig }, 'drv-1');
  world.calls.length = 0;
  const deps = { fetch: f, supabase: supabaseConfig, webhookToken: TOKEN };
  return { world, deps };
}

const payment = (event: string, id = 'pay_1') => ({ event, payment: { id, status: 'RECEIVED' } });
const dbCalls = (w: { calls: Call[] }) => w.calls.filter((c) => c.service === 'supabase');

test('token errado responde 401 e não toca no banco', async () => {
  const { world, deps } = await setup();
  const r = await handleWebhook(deps, { token: 'errado', body: payment('PAYMENT_RECEIVED') });
  assert.equal(r.status, 401);
  assert.equal(dbCalls(world).length, 0);
  assert.equal(world.periods[0].status, 'open');
});

test('sem token responde 401', async () => {
  const { world, deps } = await setup();
  const r = await handleWebhook(deps, { token: null, body: payment('PAYMENT_RECEIVED') });
  assert.equal(r.status, 401);
  assert.equal(world.periods[0].status, 'open');
});

test('PAYMENT_RECEIVED baixa o mês e responde 200', async () => {
  const { world, deps } = await setup();
  const r = await handleWebhook(deps, { token: TOKEN, body: payment('PAYMENT_RECEIVED') });
  assert.equal(r.status, 200);
  assert.equal(world.periods[0].status, 'paid');
  assert.deepEqual(dbCalls(world).map((c) => c.path), ['asaas_mark_paid']);
  assert.deepEqual(dbCalls(world)[0].body, { p_payment_id: 'pay_1' });
});

test('PAYMENT_CONFIRMED também baixa o mês', async () => {
  const { world, deps } = await setup();
  const r = await handleWebhook(deps, { token: TOKEN, body: payment('PAYMENT_CONFIRMED') });
  assert.equal(r.status, 200);
  assert.equal(world.periods[0].status, 'paid');
});

test('o mesmo pagamento avisado duas vezes baixa uma vez só e responde 200', async () => {
  const { world, deps } = await setup();
  const a = await handleWebhook(deps, { token: TOKEN, body: payment('PAYMENT_RECEIVED') });
  const b = await handleWebhook(deps, { token: TOKEN, body: payment('PAYMENT_CONFIRMED') });
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.equal(world.periods[0].status, 'paid');
});

test('evento que não paga responde 200 sem chamar o banco', async () => {
  const { world, deps } = await setup();
  const r = await handleWebhook(deps, { token: TOKEN, body: payment('PAYMENT_CREATED') });
  assert.equal(r.status, 200);
  assert.equal(dbCalls(world).length, 0);
});

test('corpo sem payment.id responde 400', async () => {
  const { deps } = await setup();
  assert.equal((await handleWebhook(deps, { token: TOKEN, body: { event: 'PAYMENT_RECEIVED' } })).status, 400);
  assert.equal((await handleWebhook(deps, { token: TOKEN, body: 'lixo' })).status, 400);
});

test('pagamento desconhecido responde 200', async () => {
  const { world, deps } = await setup();
  const r = await handleWebhook(deps, { token: TOKEN, body: payment('PAYMENT_RECEIVED', 'pay_que_nao_existe') });
  assert.equal(r.status, 200);
  assert.equal(world.periods[0].status, 'open');
});
