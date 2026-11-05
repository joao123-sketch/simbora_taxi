import assert from 'node:assert/strict';
import test from 'node:test';

import { supportWhatsappUrl } from './supportLink';

test('supportWhatsappUrl abre o WhatsApp do suporte com o número da pessoa na mensagem', () => {
  const url = supportWhatsappUrl('88999990000');
  assert.ok(url.startsWith('https://wa.me/5588988941408?text='));
  const text = decodeURIComponent(url.split('text=')[1]);
  assert.match(text, /código/);
  assert.match(text, /\(88\) 99999-0000/);
});

test('supportWhatsappUrl funciona sem número digitado', () => {
  const url = supportWhatsappUrl('');
  const text = decodeURIComponent(url.split('text=')[1]);
  assert.doesNotMatch(text, /\(\)/);
  assert.match(text, /não chegou/);
});

test('supportWhatsappUrl ignora número incompleto', () => {
  const text = decodeURIComponent(supportWhatsappUrl('889').split('text=')[1]);
  assert.doesNotMatch(text, /889/);
});
