import assert from 'node:assert/strict';
import { test } from 'node:test';

import { makeHandler, type Env } from '../src/index.ts';
import { fakeFetch, newWorld } from './fakes.ts';

const TOKEN = 'token-do-webhook-com-bem-mais-de-trinta-e-dois-caracteres';
const env: Env = {
  ASAAS_API_KEY: 'chave-de-teste',
  ASAAS_BASE_URL: 'https://api-sandbox.asaas.com',
  ASAAS_WEBHOOK_TOKEN: TOKEN,
  SUPABASE_URL: 'https://supabase.test',
  SUPABASE_SERVICE_KEY: 'service-de-teste',
  ALLOWED_ORIGINS: 'https://app.exemplo.com',
};

function app(world = newWorld()) {
  const handler = makeHandler(fakeFetch(world));
  const call = (path: string, init: RequestInit = {}) => handler(new Request(`https://pagamentos.test${path}`, init), env);
  return { world, call };
}

const withJwt = (jwt: string, origin = 'https://app.exemplo.com'): RequestInit => ({
  method: 'POST',
  headers: { Authorization: `Bearer ${jwt}`, Origin: origin },
});

test('GET /health responde 200', async () => {
  const { call } = app();
  assert.equal((await call('/health')).status, 200);
});

test('/fee/charge sem Authorization responde 401', async () => {
  const { call } = app();
  assert.equal((await call('/fee/charge', { method: 'POST' })).status, 401);
});

test('/fee/charge com login inválido responde 401', async () => {
  const { call } = app();
  assert.equal((await call('/fee/charge', withJwt('jwt-falso'))).status, 401);
});

test('/fee/charge com login válido devolve a cobrança e libera a origem do app', async () => {
  const { call } = app();
  const r = await call('/fee/charge', withJwt('jwt-do-joao'));
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('access-control-allow-origin'), 'https://app.exemplo.com');
  const body = (await r.json()) as { amount: number; invoiceUrl: string; pixPayload: string };
  assert.equal(body.amount, 200);
  assert.match(body.invoiceUrl, /^https:\/\/sandbox\.asaas\.com\/i\//);
  assert.equal(body.pixPayload, 'PIX-pay_1');
});

test('/fee/charge: recusa do banco vira 409 com a mensagem', async () => {
  const world = newWorld();
  world.driver.approved = false;
  const { call } = app(world);
  const r = await call('/fee/charge', withJwt('jwt-do-joao'));
  assert.equal(r.status, 409);
  assert.deepEqual(await r.json(), { error: 'Só motorista aprovado paga mensalidade' });
});

test('/fee/charge: erro do Asaas vira 502 sem vazar a chave', async () => {
  const { call } = app(newWorld({ asaasFails: true }));
  const r = await call('/fee/charge', withJwt('jwt-do-joao'));
  assert.equal(r.status, 502);
  const text = await r.text();
  assert.equal(text.includes('chave-de-teste'), false);
  assert.deepEqual(JSON.parse(text), { error: 'Não conseguimos gerar a cobrança agora' });
});

test('OPTIONS libera só as origens da lista', async () => {
  const { call } = app();
  const ok = await call('/fee/charge', { method: 'OPTIONS', headers: { Origin: 'https://app.exemplo.com' } });
  const bad = await call('/fee/charge', { method: 'OPTIONS', headers: { Origin: 'https://outro-site.com' } });
  assert.equal(ok.headers.get('access-control-allow-origin'), 'https://app.exemplo.com');
  assert.equal(bad.headers.get('access-control-allow-origin'), null);
});

test('/asaas/webhook com token errado responde 401', async () => {
  const { world, call } = app();
  await call('/fee/charge', withJwt('jwt-do-joao'));
  const r = await call('/asaas/webhook', {
    method: 'POST',
    headers: { 'asaas-access-token': 'errado', 'content-type': 'application/json' },
    body: JSON.stringify({ event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1' } }),
  });
  assert.equal(r.status, 401);
  assert.equal(world.periods[0].status, 'open');
});

test('/asaas/webhook com token certo baixa o mês', async () => {
  const { world, call } = app();
  await call('/fee/charge', withJwt('jwt-do-joao'));
  const r = await call('/asaas/webhook', {
    method: 'POST',
    headers: { 'asaas-access-token': TOKEN, 'content-type': 'application/json' },
    body: JSON.stringify({ event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1' } }),
  });
  assert.equal(r.status, 200);
  assert.equal(world.periods[0].status, 'paid');
});

test('/asaas/webhook com corpo que não é JSON responde 400', async () => {
  const { call } = app();
  const r = await call('/asaas/webhook', {
    method: 'POST',
    headers: { 'asaas-access-token': TOKEN },
    body: 'isto não é json',
  });
  assert.equal(r.status, 400);
});

test('segredo colado com espaço ou quebra de linha é limpo antes de ir no cabeçalho', async () => {
  const world = newWorld();
  const seen: Record<string, string>[] = [];
  const inner = fakeFetch(world);
  const spy = ((url: string | URL | Request, init?: RequestInit) => {
    seen.push({ ...(init?.headers as Record<string, string>) });
    return inner(url, init);
  }) as typeof fetch;
  const handler = makeHandler(spy);
  const dirty: Env = { ...env, SUPABASE_SERVICE_KEY: ' service-de-teste\n', ASAAS_API_KEY: 'chave-de-teste \r\n' };
  const r = await handler(new Request('https://pagamentos.test/fee/charge', withJwt('jwt-do-joao')), dirty);
  assert.equal(r.status, 200);
  for (const headers of seen) {
    for (const value of Object.values(headers)) assert.equal(value, value.trim());
  }
});

test('erro inesperado vira 502 em JSON e nunca derruba o Worker', async () => {
  const boom = (async () => {
    throw new TypeError('Invalid header value');
  }) as unknown as typeof fetch;
  const handler = makeHandler(boom);
  const r = await handler(new Request('https://pagamentos.test/fee/charge', withJwt('jwt-do-joao')), env);
  assert.equal(r.status, 502);
  assert.deepEqual(await r.json(), { error: 'Não conseguimos gerar a cobrança agora' });
});

// Na Edge Function do Supabase o caminho vem com o nome da função na frente.
test('Edge: /functions/v1/asaas/health responde 200', async () => {
  const { call } = app();
  assert.equal((await call('/functions/v1/asaas/health')).status, 200);
});

test('Edge: /asaas/fee/charge sem login responde 401', async () => {
  const { call } = app();
  assert.equal((await call('/asaas/fee/charge', { method: 'POST' })).status, 401);
});

test('Edge: /asaas/fee/charge com login válido devolve a cobrança', async () => {
  const { call } = app();
  const r = await call('/asaas/fee/charge', withJwt('jwt-do-joao'));
  assert.equal(r.status, 200);
});

test('Edge: /asaas/webhook com token certo baixa o mês e com token errado dá 401', async () => {
  const { world, call } = app();
  await call('/asaas/fee/charge', withJwt('jwt-do-joao'));
  const bad = await call('/functions/v1/asaas/webhook', {
    method: 'POST',
    headers: { 'asaas-access-token': 'errado', 'content-type': 'application/json' },
    body: JSON.stringify({ event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1' } }),
  });
  assert.equal(bad.status, 401);
  assert.equal(world.periods[0].status, 'open');
  const ok = await call('/functions/v1/asaas/webhook', {
    method: 'POST',
    headers: { 'asaas-access-token': TOKEN, 'content-type': 'application/json' },
    body: JSON.stringify({ event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1' } }),
  });
  assert.equal(ok.status, 200);
  assert.equal(world.periods[0].status, 'paid');
});

test('rota desconhecida responde 404', async () => {
  const { call } = app();
  assert.equal((await call('/qualquer/coisa')).status, 404);
});
