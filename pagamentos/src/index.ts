import { AsaasError, type Fetch } from './asaas.ts';
import { getOrCreateCharge } from './charge.ts';
import { DbError, userFromJwt } from './supabase.ts';
import { handleWebhook } from './webhook.ts';

export type Env = {
  ASAAS_API_KEY: string;
  ASAAS_BASE_URL: string;
  ASAAS_WEBHOOK_TOKEN: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  // Endereços do app que podem chamar o Worker, separados por vírgula.
  ALLOWED_ORIGINS: string;
};

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin');
  const allowed = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
    vary: 'Origin',
  };
}

function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...extra } });
}

export function makeHandler(f: Fetch) {
  return async function handle(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);
    const supabase = { url: env.SUPABASE_URL, serviceKey: env.SUPABASE_SERVICE_KEY };

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method === 'GET' && url.pathname === '/health') return new Response('ok');

    // O motorista pede a cobrança do mês dele.
    if (request.method === 'POST' && url.pathname === '/fee/charge') {
      const bearer = request.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];
      const driverId = bearer ? await userFromJwt(f, supabase, bearer) : null;
      if (!driverId) return json(401, { error: 'Entre no app para ver a cobrança' }, cors);

      try {
        const charge = await getOrCreateCharge(
          { fetch: f, asaas: { baseUrl: env.ASAAS_BASE_URL, apiKey: env.ASAAS_API_KEY }, supabase },
          driverId,
        );
        return json(200, charge, cors);
      } catch (e) {
        // Recusa escrita de propósito no banco (ex.: "Você não tem mensalidade para pagar agora").
        if (e instanceof DbError) return json(409, { error: e.message }, cors);
        // Asaas fora do ar, chave inválida etc.: a causa fica no log do Worker, nunca na resposta.
        console.error('cobrança falhou', e instanceof AsaasError ? `${e.status} ${e.message}` : e);
        return json(502, { error: 'Não conseguimos gerar a cobrança agora' }, cors);
      }
    }

    // O Asaas avisa que um pagamento caiu.
    if (request.method === 'POST' && url.pathname === '/asaas/webhook') {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        // Sem token certo nem corpo válido: não revela nada.
        return new Response('corpo inválido', { status: 400 });
      }
      try {
        const result = await handleWebhook(
          { fetch: f, supabase, webhookToken: env.ASAAS_WEBHOOK_TOKEN },
          { token: request.headers.get('asaas-access-token'), body },
        );
        return new Response(null, { status: result.status });
      } catch (e) {
        // Falha ao gravar: 500 faz o Asaas tentar de novo mais tarde.
        console.error('webhook falhou', e);
        return new Response(null, { status: 500 });
      }
    }

    return new Response('não encontrado', { status: 404 });
  };
}

export default {
  fetch: (request: Request, env: Env) => makeHandler(fetch)(request, env),
};
