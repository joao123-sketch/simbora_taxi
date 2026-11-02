import assert from 'node:assert/strict';
import { test } from 'node:test';

import { rpc } from '../src/supabase.ts';

function capture(): { f: typeof fetch; headers: () => Record<string, string> } {
  let seen: Record<string, string> = {};
  const f = (async (_url: string | URL | Request, init?: RequestInit) => {
    seen = { ...(init?.headers as Record<string, string>) };
    return new Response(JSON.stringify(true), { status: 200 });
  }) as typeof fetch;
  return { f, headers: () => seen };
}

test('chave secreta nova (sb_secret_) vai só no cabeçalho apikey', async () => {
  const { f, headers } = capture();
  await rpc(f, { url: 'https://x.supabase.co', serviceKey: 'sb_secret_abc' }, 'asaas_mark_paid', {});
  assert.equal(headers().apikey, 'sb_secret_abc');
  assert.equal(headers().Authorization, undefined);
});

test('chave antiga (JWT eyJ...) vai também no Authorization', async () => {
  const { f, headers } = capture();
  await rpc(f, { url: 'https://x.supabase.co', serviceKey: 'eyJhbGciOi.payload.assinatura' }, 'asaas_mark_paid', {});
  assert.equal(headers().apikey, 'eyJhbGciOi.payload.assinatura');
  assert.equal(headers().Authorization, 'Bearer eyJhbGciOi.payload.assinatura');
});
