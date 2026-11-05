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

// Número liberado pela equipe no painel: o código não vai por SMS, fica guardado para a equipe passar à pessoa.
// Devolve true se o número estava liberado (e o código foi guardado).
export async function storeReleasedCode(
  fetchImpl: Fetch,
  supabaseUrl: string,
  serviceKey: string,
  phone: string,
  otp: string,
): Promise<boolean> {
  const res = await fetchImpl(`${supabaseUrl}/rest/v1/rpc/hook_store_release_code`, {
    method: 'POST',
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_phone: phone, p_code: otp }),
  });
  if (!res.ok) return false;
  return (await res.json()) === true;
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

  // Número liberado pela equipe: guarda o código para o painel em vez de mandar o SMS. Se falhar, segue o envio normal.
  const supabaseUrl = env.get('SUPABASE_URL');
  const serviceKey = env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (supabaseUrl && serviceKey) {
    try {
      if (await storeReleasedCode(fetch as unknown as Fetch, supabaseUrl, serviceKey, user.phone, sms.otp)) return json(200, {});
    } catch {
      // sem a liberação, o SMS sai como sempre
    }
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
