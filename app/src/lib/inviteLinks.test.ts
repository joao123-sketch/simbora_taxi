import assert from 'node:assert/strict';
import { test } from 'node:test';

import { driverRecruitMessage, driverSignupUrl, whatsappUrl } from './inviteLinks';

test('driverRecruitMessage com cidade cita a cidade e o link do cadastro', () => {
  const message = driverRecruitMessage('Ipu');
  assert.ok(message.includes('dirigindo em Ipu?'));
  assert.ok(message.includes(driverSignupUrl()));
  assert.ok(driverSignupUrl().endsWith('/motorista'));
});

test('driverRecruitMessage sem cidade não cita nenhuma cidade fixa', () => {
  const message = driverRecruitMessage();
  assert.ok(!message.includes('Guaraciaba'));
  assert.ok(message.includes('primeiro mês é grátis'));
});

test('whatsappUrl codifica a mensagem', () => {
  assert.equal(whatsappUrl('oi, tudo bem?'), 'https://wa.me/?text=oi%2C%20tudo%20bem%3F');
});
