// Testes sem rede: node --experimental-strip-types supabase/functions/send-sms/test.mjs
import assert from 'node:assert/strict';

import { receiverFrom, sendViaComtele, smsText } from './index.ts';

let n = 0;
async function t(name, fn) {
  await fn();
  n += 1;
  console.log('ok -', name);
}

await t('telefone: tira o + e vira número', () => {
  assert.equal(receiverFrom('+5588988941408'), 5588988941408);
  assert.equal(receiverFrom('558832221111'), 558832221111);
});

await t('telefone: recusa o que não é brasileiro', () => {
  assert.throws(() => receiverFrom('+14155550100'));
  assert.throws(() => receiverFrom('88988941408'));
  assert.throws(() => receiverFrom(''));
});

await t('texto: cabe em 1 crédito (até 160) e não tem acento', () => {
  const text = smsText('123456');
  assert.ok(text.includes('123456'));
  assert.ok(text.length <= 160, `tem ${text.length} caracteres`);
  assert.ok(/^[\x20-\x7e]+$/.test(text));
});

await t('envio: monta o pedido certo', async () => {
  let seen;
  const fake = async (url, init) => {
    seen = { url, init };
    return { ok: true, status: 200, json: async () => ({ hasError: false, object: { requestId: 'x', status: 'queued' } }) };
  };
  await sendViaComtele(fake, 'CHAVE', 17, '+5588988941408', '654321');
  assert.equal(seen.url, 'https://api.comtele.com.br/messages/sms/send');
  assert.equal(seen.init.method, 'POST');
  assert.equal(seen.init.headers['x-api-key'], 'CHAVE');
  const body = JSON.parse(seen.init.body);
  assert.deepEqual(body.receivers, [5588988941408]);
  assert.equal(body.route, 17);
  assert.ok(body.message.includes('654321'));
});

await t('envio: HTTP de erro vira exceção', async () => {
  const fake = async () => ({ ok: false, status: 401, json: async () => ({ hasError: true, message: 'Unauthorized' }) });
  await assert.rejects(() => sendViaComtele(fake, 'x', 17, '+5588988941408', '1'), /HTTP 401/);
});

await t('envio: hasError mesmo com HTTP 200 vira exceção', async () => {
  const fake = async () => ({ ok: true, status: 200, json: async () => ({ hasError: true, message: 'Saldo insuficiente', errors: ['sem saldo'] }) });
  await assert.rejects(() => sendViaComtele(fake, 'x', 17, '+5588988941408', '1'), /Saldo insuficiente/);
});

await t('envio: resposta sem JSON usa o status', async () => {
  const ok = async () => ({ ok: true, status: 200, json: async () => { throw new Error('vazio'); } });
  await sendViaComtele(ok, 'x', 17, '+5588988941408', '1');
  const bad = async () => ({ ok: false, status: 503, json: async () => { throw new Error('vazio'); } });
  await assert.rejects(() => sendViaComtele(bad, 'x', 17, '+5588988941408', '1'), /HTTP 503/);
});

console.log(`${n} testes ok`);
