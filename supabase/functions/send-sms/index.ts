// Send SMS Hook do Supabase Auth: manda o código de login pela Comtele (painel novo).
// Arquivo único, para colar em Edge Functions > Deploy a new function > Via Editor (nome: send-sms).
// Desligue "Verify JWT": o Supabase Auth chama a função com a assinatura do hook, que é conferida aqui.
// Segredos (Edge Functions > Secrets):
//   COMTELE_API_KEY       chave do painel (Configurações > Chaves de API)
//   COMTELE_ROUTE         id da rota de SMS (GET https://api.comtele.com.br/routes)
//   SEND_SMS_HOOK_SECRET  o segredo "v1,whsec_..." que o Supabase mostra ao ativar o hook

const COMTELE_URL = 'https://api.comtele.com.br/messages/sms/send';

type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

// Texto sem acento e abaixo de 160 caracteres: acento faz o SMS valer só 70 por crédito.
export function smsText(otp: string): string {
  return `Simbora Car: seu codigo de acesso e ${otp}. Nao compartilhe com ninguem.`;
}

// O Supabase manda o telefone como +5588988941408; a Comtele quer só os dígitos, como número.
export function receiverFrom(phone: string): number {
  const digits = phone.replace(/\D/g, '');
  if (!/^55\d{10,11}$/.test(digits)) throw new Error('Telefone fora do formato brasileiro');
  return Number(digits);
}

export async function sendViaComtele(
  fetchImpl: Fetch,
  apiKey: string,
  route: number,
  phone: string,
  otp: string,
): Promise<void> {
  const res = await fetchImpl(COMTELE_URL, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      receivers: [receiverFrom(phone)],
      contactGroups: [],
      message: smsText(otp),
      route,
      tag: 'login-otp',
    }),
  });
  let body: { hasError?: boolean; message?: string; errors?: string[] } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    // resposta sem JSON: vale o status HTTP
  }
  if (!res.ok || body.hasError === true) {
    throw new Error(`Comtele recusou o envio (HTTP ${res.status}): ${body.message ?? ''} ${(body.errors ?? []).join('; ')}`.trim());
  }
}

function json(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function handle(req: Request): Promise<Response> {
  const { Webhook } = await import('https://esm.sh/standardwebhooks@1.0.0');
  const env = (globalThis as unknown as { Deno: { env: { get(k: string): string | undefined } } }).Deno.env;
  const hookSecret = env.get('SEND_SMS_HOOK_SECRET');
  const apiKey = env.get('COMTELE_API_KEY');
  const route = Number(env.get('COMTELE_ROUTE'));
  if (!hookSecret || !apiKey || !Number.isInteger(route) || route <= 0) {
    return json(500, { error: { http_code: 500, message: 'Envio de SMS sem configuração' } });
  }

  const payload = await req.text();
  let user: { phone: string };
  let sms: { otp: string };
  try {
    ({ user, sms } = new Webhook(hookSecret.replace('v1,whsec_', '')).verify(
      payload,
      Object.fromEntries(req.headers),
    ) as { user: { phone: string }; sms: { otp: string } });
  } catch {
    return json(401, { error: { http_code: 401, message: 'Assinatura inválida' } });
  }

  try {
    await sendViaComtele(fetch as unknown as Fetch, apiKey, route, user.phone, sms.otp);
  } catch (err) {
    // O código do SMS nunca vai para o log; o telefone, só o final.
    console.error('send-sms falhou', String(err), 'telefone ...' + String(user.phone).slice(-4));
    return json(500, { error: { http_code: 500, message: 'Não foi possível enviar o SMS' } });
  }
  return json(200, {});
}

if (typeof (globalThis as { Deno?: unknown }).Deno !== 'undefined') {
  (globalThis as unknown as { Deno: { serve(h: (r: Request) => Promise<Response>): void } }).Deno.serve(handle);
}
