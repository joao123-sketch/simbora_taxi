import assert from 'node:assert/strict';
import test from 'node:test';

import { decodePolyline, shouldRefetchRoute } from './routeGeometry';

test('decodePolyline lê o exemplo oficial do Google', () => {
  const points = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
  assert.equal(points.length, 3);
  assert.deepEqual(points[0], { lat: 38.5, lng: -120.2 });
  assert.deepEqual(points[1], { lat: 40.7, lng: -120.95 });
  assert.deepEqual(points[2], { lat: 43.252, lng: -126.453 });
});

test('decodePolyline devolve lista vazia para texto vazio', () => {
  assert.deepEqual(decodePolyline(''), []);
});

const here = { lat: -4.0, lng: -40.0 };
// ~0,0045 grau de latitude = ~500 m
const farther = { lat: -4.0055, lng: -40.0 };
const near = { lat: -4.001, lng: -40.0 };

test('shouldRefetchRoute busca na primeira vez', () => {
  assert.equal(shouldRefetchRoute(null, here, 1000), true);
});

test('shouldRefetchRoute espera 60 s mesmo com o motorista longe', () => {
  assert.equal(shouldRefetchRoute({ from: here, at: 0 }, farther, 30_000), false);
});

test('shouldRefetchRoute busca de novo depois de 60 s e mais de 500 m', () => {
  assert.equal(shouldRefetchRoute({ from: here, at: 0 }, farther, 61_000), true);
});

test('shouldRefetchRoute não busca de novo se o motorista quase não saiu do lugar', () => {
  assert.equal(shouldRefetchRoute({ from: here, at: 0 }, near, 600_000), false);
});
