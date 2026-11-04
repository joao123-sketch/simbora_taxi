// Envio de Web Push (VAPID): avisa motorista e passageiro com o app em segundo plano ou fechado.
// Arquivo único, para colar em Edge Functions > Deploy a new function > Via Editor (nome: push).
// Desligue "Verify JWT": quem chama é o banco (pg_net), que prova quem é pelo segredo PUSH_SECRET.
// Segredos (Edge Functions > Secrets):
//   VAPID_PUBLIC_KEY   chave pública (a mesma que vai em EXPO_PUBLIC_VAPID_PUBLIC_KEY no app)
//   VAPID_PRIVATE_KEY  chave privada (só aqui, nunca no código nem no chat)
//   VAPID_SUBJECT      contato, ex.: mailto:equipe@seudominio.com.br
//   PUSH_SECRET        senha combinada com o banco (a mesma gravada em private.push_config)
// O Supabase já entrega SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY para a função.

export type PushEvent =
  | 'new_offer'
  | 'ride_accepted'
  | 'ride_arrived'
  | 'ride_started'
  | 'ride_completed'
  | 'ride_cancelled_by_driver'
  | 'ride_cancelled_by_passenger'
  | 'trip_proposal'
  | 'trip_proposal_chosen'
  | 'trip_confirmed'
  | 'trip_void_driver'
  | 'trip_void_passenger'
  | 'trip_expired'
  | 'trip_cancelled_by_driver'
  | 'trip_cancelled_by_passenger'
  | 'trip_confirm_reminder'
  | 'chat_message'
  | 'test';

export type PushPayload = { title: string; body: string; tag: string; url: string };

// Mesmos textos que o app mostra como aviso local (notify): DriverHomeScreen, RideStatusScreen e intercity.ts.
const TEXTS: Record<PushEvent, [title: string, body: string, tag: string]> = {
  new_offer: ['Novo pedido de corrida', 'Toque para ver e aceitar.', 'novo-pedido'],
  ride_accepted: ['Motorista a caminho', 'Um motorista aceitou a sua corrida.', 'corrida'],
  ride_arrived: ['O motorista chegou', 'Ele está esperando você.', 'corrida'],
  ride_started: ['Corrida iniciada', 'Boa viagem!', 'corrida'],
  ride_completed: ['Corrida concluída', 'Obrigado por andar com o Simbora Car.', 'corrida'],
  ride_cancelled_by_driver: ['Corrida cancelada', 'Toque para voltar ao início.', 'corrida'],
  ride_cancelled_by_passenger: ['Corrida cancelada', 'O passageiro cancelou a corrida.', 'corrida'],
  trip_proposal: ['Nova proposta', 'Um motorista fez uma proposta para a sua viagem. Toque para ver.', 'trip-proposal'],
  trip_proposal_chosen: ['Sua proposta foi escolhida', 'O passageiro escolheu a sua proposta. Toque para ver a viagem.', 'trip-accepted'],
  trip_confirmed: ['Viagem confirmada', 'O passageiro confirmou a viagem.', 'trip-confirmed'],
  trip_void_driver: ['Viagem sem efeito', 'O passageiro não confirmou a viagem. Seu horário foi liberado.', 'trip-void'],
  trip_void_passenger: ['Viagem sem efeito', 'Você não confirmou a viagem a tempo, então ela ficou sem efeito.', 'trip-void'],
  trip_expired: ['Ninguém aceitou sua viagem', 'Nenhum motorista aceitou até a hora marcada. Você pode pedir de novo.', 'trip-expired'],
  trip_cancelled_by_driver: ['Viagem cancelada', 'O motorista cancelou a viagem.', 'trip-cancelled'],
  trip_cancelled_by_passenger: ['Viagem cancelada', 'O passageiro cancelou a viagem.', 'trip-cancelled'],
  trip_confirm_reminder: ['Confirme sua viagem', 'Toque para confirmar a viagem agendada.', 'confirm'],
  chat_message: ['Nova mensagem', 'Toque para ler a mensagem.', 'chat'],
  test: ['Teste de aviso', 'Está funcionando! Este aviso chegou pelo servidor, com o app fechado.', 'teste'],
};

export function isPushEvent(value: unknown): value is PushEvent {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(TEXTS, value);
}

// Monta o aviso: o tag inclui a corrida, para o aviso novo trocar o antigo da mesma corrida.
export function buildPayload(event: PushEvent, rideId?: number | null): PushPayload {
  const [title, body, tag] = TEXTS[event];
  return { title, body, tag: rideId ? `${tag}-${rideId}` : tag, url: '/' };
}

// Quantos segundos esperar antes de enviar: o despacho em ondas libera o pedido a cada motorista
// em um horário, e o aviso não pode chegar antes da vez dele. Limite de 100 s (tempo da função).
export const MAX_DELAY_SECONDS = 100;
export function delayMs(seconds: unknown): number {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, MAX_DELAY_SECONDS) * 1000;
}

// Erro 404 ou 410 do serviço de push: a inscrição não vale mais e deve ser apagada.
export function isGone(statusCode: unknown): boolean {
  return statusCode === 404 || statusCode === 410;
}

type Env = { get(k: string): string | undefined };
type Sub = { endpoint: string; p256dh: string; auth: string };

function json(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function rest(env: Env, path: string, init: { method?: string } = {}): Promise<Response> {
  const base = env.get('SUPABASE_URL');
  const key = env.get('SUPABASE_SERVICE_ROLE_KEY');
  return fetch(`${base}/rest/v1/${path}`, {
    method: init.method ?? 'GET',
    headers: { apikey: key as string, Authorization: `Bearer ${key}` },
  });
}

// Depois da espera, o pedido pode ter sido aceito ou cancelado: aí o aviso não faz mais sentido.
async function offerStillOpen(env: Env, offerId: number): Promise<boolean> {
  const res = await rest(env, `ride_offers?id=eq.${offerId}&status=eq.pending&select=ride:rides!inner(status)`);
  if (!res.ok) return true;
  const rows = (await res.json()) as { ride: { status: string } | { status: string }[] }[];
  if (rows.length === 0) return false;
  const ride = Array.isArray(rows[0].ride) ? rows[0].ride[0] : rows[0].ride;
  return ride?.status === 'requested';
}

export async function handle(req: Request, env: Env, wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): Promise<Response> {
  const secret = env.get('PUSH_SECRET');
  const publicKey = env.get('VAPID_PUBLIC_KEY');
  const privateKey = env.get('VAPID_PRIVATE_KEY');
  const subject = env.get('VAPID_SUBJECT');
  if (!secret || !publicKey || !privateKey || !subject) return json(500, { error: 'Push sem configuração' });
  if (req.method !== 'POST') return json(405, { error: 'Método não permitido' });
  if (!sameSecret(req.headers.get('x-push-secret') ?? '', secret)) return json(401, { error: 'Não autorizado' });

  let body: { event?: unknown; user_id?: unknown; ride_id?: unknown; offer_id?: unknown; delay_seconds?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Corpo inválido' });
  }
  if (!isPushEvent(body.event) || typeof body.user_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.user_id)) {
    return json(400, { error: 'Evento ou usuário inválido' });
  }
  const rideId = typeof body.ride_id === 'number' ? body.ride_id : null;

  const ms = delayMs(body.delay_seconds);
  if (ms > 0) await wait(ms);
  if (body.event === 'new_offer' && typeof body.offer_id === 'number' && !(await offerStillOpen(env, body.offer_id))) {
    return json(200, { sent: 0, skipped: 'pedido não está mais aberto' });
  }

  const subsRes = await rest(env, `push_subscriptions?user_id=eq.${body.user_id}&select=endpoint,p256dh,auth`);
  if (!subsRes.ok) return json(500, { error: 'Não foi possível ler as inscrições' });
  const subs = (await subsRes.json()) as Sub[];
  if (subs.length === 0) return json(200, { sent: 0 });

  const webpush = (await import('npm:web-push@3.6.7')).default;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  const message = JSON.stringify(buildPayload(body.event, rideId));

  let sent = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, message, {
        TTL: 60 * 60,
        urgency: 'high',
      });
      sent += 1;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (isGone(status)) {
        await rest(env, `push_subscriptions?endpoint=eq.${encodeURIComponent(sub.endpoint)}`, { method: 'DELETE' }).catch(() => {});
      } else {
        // Sem o endereço da inscrição no log: ele é segredo de quem recebe.
        console.error('push falhou', body.event, String(status ?? err));
      }
    }
  }
  return json(200, { sent });
}

if (typeof (globalThis as { Deno?: unknown }).Deno !== 'undefined') {
  const deno = (globalThis as unknown as { Deno: { env: Env; serve(h: (r: Request) => Promise<Response>): void } }).Deno;
  deno.serve((req) => handle(req, deno.env));
}
