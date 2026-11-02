import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isPayingEvent, paymentBody } from '../src/rules.ts';

test('isPayingEvent aceita recebido e confirmado', () => {
  assert.equal(isPayingEvent('PAYMENT_RECEIVED'), true);
  assert.equal(isPayingEvent('PAYMENT_CONFIRMED'), true);
});

test('isPayingEvent recusa outros eventos', () => {
  assert.equal(isPayingEvent('PAYMENT_CREATED'), false);
  assert.equal(isPayingEvent('PAYMENT_OVERDUE'), false);
  assert.equal(isPayingEvent(''), false);
});

const base = { customerId: 'cus_1', amount: 200, periodId: 42, periodStart: '2026-11-01' };

test('paymentBody cobra só por Pix, mantém o vencimento futuro e usa os campos do plano', () => {
  const body = paymentBody({ ...base, dueOn: '2026-11-05' }, '2026-11-02');
  assert.deepEqual(body, {
    customer: 'cus_1',
    billingType: 'PIX',
    value: 200,
    dueDate: '2026-11-05',
    externalReference: 'fee:42',
    description: 'Mensalidade Simbora Car 2026-11',
  });
});

test('paymentBody usa hoje quando o vencimento já passou', () => {
  const body = paymentBody({ ...base, dueOn: '2026-10-20' }, '2026-11-02');
  assert.equal(body.dueDate, '2026-11-02');
});
