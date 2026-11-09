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
  assert.ok(searchBoxDegrees({ radius_km: 6 }) > searchBoxDegrees({ radius_km: 3 }));
});

test('searchBoxDegrees: raio grande (folga de GPS) não alarga a busca além de 0,1 grau', () => {
  // Mais que ~11 km traz as cidades vizinhas na frente dos lugares da própria cidade.
  assert.equal(searchBoxDegrees({ radius_km: 20 }), 0.1);
  assert.equal(searchBoxDegrees({ radius_km: 50 }), 0.1);
});
