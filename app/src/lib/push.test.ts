import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildPayload, delayMs, handle, isGone, isPushEvent, MAX_DELAY_SECONDS } from '../../../supabase/functions/push/index';
import { toStored, urlBase64ToUint8Array } from './pushHelpers';

test('chave VAPID: base64 url safe vira bytes (com e sem preenchimento)', () => {
  assert.deepEqual([...urlBase64ToUint8Array('AQID')], [1, 2, 3]);
  assert.deepEqual([...urlBase64ToUint8Array('-_8')], [251, 255]);
});

test('toStored: monta a inscrição e recusa se faltar chave', () => {
  const buf = (...n: number[]) => new Uint8Array(n).buffer;
  const ok = toStored({ endpoint: 'https://push.example/x', getKey: (k) => (k === 'p256dh' ? buf(251, 255) : buf(1, 2, 3)) });
  assert.deepEqual(ok, { endpoint: 'https://push.example/x', p256dh: '-_8', auth: 'AQID' });
  assert.equal(toStored({ endpoint: 'https://push.example/x', getKey: () => null }), null);
  assert.equal(toStored({ endpoint: '', getKey: () => buf(1) }), null);
});

test('payload: novo pedido usa o texto do aviso local do motorista', () => {
  assert.deepEqual(buildPayload('new_offer'), {
    title: 'Novo pedido de corrida',
    body: 'Toque para ver e aceitar.',
    tag: 'novo-pedido',
    url: '/',
  });
});

test('payload: tag leva o id da corrida, para o aviso novo trocar o antigo', () => {
  assert.equal(buildPayload('ride_arrived', 42).tag, 'corrida-42');
  assert.equal(buildPayload('ride_arrived', 42).title, 'O motorista chegou');
  assert.equal(buildPayload('ride_accepted', 42).body, 'Um motorista aceitou a sua corrida.');
  assert.equal(buildPayload('ride_completed').title, 'Corrida concluída');
});

test('payload: viagem entre cidades usa os textos de tripEvents', () => {
  assert.equal(buildPayload('trip_proposal', 7).title, 'Nova proposta');
  assert.equal(buildPayload('trip_proposal_chosen', 7).title, 'Sua proposta foi escolhida');
  assert.equal(buildPayload('trip_void_driver').body, 'O passageiro não confirmou a viagem. Seu horário foi liberado.');
  assert.equal(buildPayload('trip_confirm_reminder').title, 'Confirme sua viagem');
});

test('isPushEvent: só aceita evento conhecido', () => {
  assert.ok(isPushEvent('chat_message'));
  assert.ok(!isPushEvent('toString'));
  assert.ok(!isPushEvent(undefined));
});

test('delayMs: espera a vez do motorista, com teto', () => {
  assert.equal(delayMs(0), 0);
  assert.equal(delayMs(-5), 0);
  assert.equal(delayMs('abc'), 0);
  assert.equal(delayMs(15), 15000);
  assert.equal(delayMs(9999), MAX_DELAY_SECONDS * 1000);
});

test('isGone: só 404 e 410 apagam a inscrição', () => {
  assert.ok(isGone(404));
  assert.ok(isGone(410));
  assert.ok(!isGone(500));
  assert.ok(!isGone(undefined));
});

const env = (extra: Record<string, string> = {}) => {
  const all: Record<string, string> = {
    PUSH_SECRET: 's3',
    VAPID_PUBLIC_KEY: 'pub',
    VAPID_PRIVATE_KEY: 'priv',
    VAPID_SUBJECT: 'mailto:a@b.c',
    ...extra,
  };
  return { get: (k: string) => all[k] };
};
const call = (headers: Record<string, string>, body: unknown, e = env()) =>
  handle(new Request('https://x/push', { method: 'POST', headers, body: JSON.stringify(body) }), e, async () => {});

test('handle: sem configuração responde 500', async () => {
  const res = await call({}, {}, { get: () => undefined });
  assert.equal(res.status, 500);
});

test('handle: segredo errado responde 401', async () => {
  const res = await call({ 'x-push-secret': 'errado' }, { event: 'new_offer', user_id: '11111111-1111-1111-1111-111111111111' });
  assert.equal(res.status, 401);
});

test('handle: evento ou usuário inválido responde 400', async () => {
  const h = { 'x-push-secret': 's3' };
  assert.equal((await call(h, { event: 'nada', user_id: '11111111-1111-1111-1111-111111111111' })).status, 400);
  assert.equal((await call(h, { event: 'new_offer', user_id: 'x; drop table' })).status, 400);
});

test('payload: aviso de teste existe e diz que veio do servidor', () => {
  assert.equal(isPushEvent('test'), true);
  const p = buildPayload('test');
  assert.equal(p.title, 'Teste de aviso');
  assert.match(p.body, /servidor/);
  assert.equal(p.tag, 'teste');
});
