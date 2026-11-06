import assert from 'node:assert/strict';
import { test } from 'node:test';

import { searchBoxDegrees } from './geo';

test('searchBoxDegrees: raio 8 km vira ~0,094 grau (raio x 1,3 / 111)', () => {
  assert.ok(Math.abs(searchBoxDegrees({ radius_km: 8 }) - 0.0937) < 0.0005);
});

test('searchBoxDegrees: cidade muito pequena não passa do piso de 0,03 grau', () => {
  assert.equal(searchBoxDegrees({ radius_km: 1 }), 0.03);
});

test('searchBoxDegrees cresce com o raio', () => {
  assert.ok(searchBoxDegrees({ radius_km: 20 }) > searchBoxDegrees({ radius_km: 8 }));
});
