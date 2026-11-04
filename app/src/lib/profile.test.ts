import assert from 'node:assert/strict';
import test from 'node:test';

import { cleanName } from './profileName';

test('cleanName tira espaços das pontas e junta os do meio', () => {
  assert.equal(cleanName('  João   Victor  '), 'João Victor');
});

test('cleanName recusa nome curto ou vazio', () => {
  assert.equal(cleanName(''), null);
  assert.equal(cleanName('   '), null);
  assert.equal(cleanName('J'), null);
});

test('cleanName aceita nome de 2 letras', () => {
  assert.equal(cleanName('Jo'), 'Jo');
});

test('cleanName corta nome acima de 60 letras', () => {
  const result = cleanName('a'.repeat(80));
  assert.equal(result?.length, 60);
});
