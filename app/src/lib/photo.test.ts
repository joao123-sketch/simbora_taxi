import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fitWithin } from './photoSize';

test('fitWithin reduz foto larga mantendo a proporção', () => {
  assert.deepEqual(fitWithin(4000, 3000, 640), { width: 640, height: 480 });
});

test('fitWithin reduz foto em pé mantendo a proporção', () => {
  assert.deepEqual(fitWithin(3000, 4000, 640), { width: 480, height: 640 });
});

test('fitWithin nunca amplia uma foto pequena', () => {
  assert.deepEqual(fitWithin(300, 200, 640), { width: 300, height: 200 });
});

test('fitWithin deixa como está uma foto que já cabe no limite', () => {
  assert.deepEqual(fitWithin(640, 640, 640), { width: 640, height: 640 });
});
