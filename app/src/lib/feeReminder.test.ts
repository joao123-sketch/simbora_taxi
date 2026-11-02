import assert from 'node:assert/strict';
import { test } from 'node:test';

import { daysUntil, reminderText } from './feeReminder';

const today = '2026-11-02';

test('daysUntil conta os dias até a data', () => {
  assert.equal(daysUntil('2026-11-02', today), 0);
  assert.equal(daysUntil('2026-11-05', today), 3);
  assert.equal(daysUntil('2026-11-01', today), -1);
  assert.equal(daysUntil('2026-12-02', today), 30);
});

test('lembrete aparece nos 5 dias antes do vencimento', () => {
  const text = reminderText({ state: 'pending', due_on: '2026-11-05', amount: 200 }, today);
  assert.equal(text, 'Sua mensalidade de R$ 200,00 vence em 3 dias (05/11). Pague pelo Pix para não ficar sem pedidos.');
});

test('lembrete diz "amanhã" e "hoje" nos últimos dias', () => {
  assert.match(reminderText({ state: 'pending', due_on: '2026-11-03', amount: 200 }, today) ?? '', /vence amanhã \(03\/11\)/);
  assert.match(reminderText({ state: 'pending', due_on: '2026-11-02', amount: 200 }, today) ?? '', /vence hoje \(02\/11\)/);
});

test('o primeiro dia da janela são 5 dias', () => {
  assert.match(reminderText({ state: 'pending', due_on: '2026-11-07', amount: 300 }, today) ?? '', /R\$ 300,00 vence em 5 dias/);
});

test('sem lembrete antes da janela, depois de vencida ou sem mês aberto', () => {
  assert.equal(reminderText({ state: 'pending', due_on: '2026-11-08', amount: 200 }, today), null);
  assert.equal(reminderText({ state: 'due', due_on: '2026-11-01', amount: 200 }, today), null);
  assert.equal(reminderText({ state: 'ok', due_on: null, amount: null }, today), null);
  assert.equal(reminderText(null, today), null);
});
