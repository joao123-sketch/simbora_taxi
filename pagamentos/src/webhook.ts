import type { Fetch } from './asaas.ts';
import { isPayingEvent } from './rules.ts';
import { rpc, type SupabaseConfig } from './supabase.ts';

type Deps = { fetch: Fetch; supabase: SupabaseConfig; webhookToken: string };

// Compara sem parar no primeiro caractere diferente.
function sameToken(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Aviso do Asaas. Token errado: 401 e nada muda. Token certo: sempre 200 (mesmo para pagamento
// desconhecido ou evento que não paga), senão o Asaas pausa a fila de avisos.
export async function handleWebhook(
  deps: Deps,
  input: { token: string | null; body: unknown },
): Promise<{ status: 200 | 400 | 401 }> {
  if (!input.token || !deps.webhookToken || !sameToken(input.token, deps.webhookToken)) {
    return { status: 401 };
  }

  const body = input.body as { event?: unknown; payment?: { id?: unknown } } | null;
  const paymentId = body && typeof body === 'object' ? body.payment?.id : undefined;
  if (typeof paymentId !== 'string' || paymentId.length === 0) {
    return { status: 400 };
  }

  if (typeof body?.event === 'string' && isPayingEvent(body.event)) {
    await rpc<boolean>(deps.fetch, deps.supabase, 'asaas_mark_paid', { p_payment_id: paymentId });
  }
  return { status: 200 };
}
