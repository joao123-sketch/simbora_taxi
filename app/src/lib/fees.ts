import { formatMoney } from './rides';
import type { PixInfo } from './pix';
import { supabase } from './supabase';

// Mensalidade do motorista. O banco diz em que pé está (fee_state): pago o mês
// antes de começar, 5 dias de tolerância e, passado isso, o motorista deixa de
// receber pedidos. O app só mostra e leva o motorista até o Pix.

export type FeeState = 'ok' | 'pending' | 'due' | 'overdue';
export type FeeKind = 'free' | 'entry' | 'standard';

export type FeeHistoryItem = {
  period_start: string;
  period_end: string;
  kind: FeeKind;
  amount: number;
  status: 'open' | 'paid' | 'waived';
  paid_at: string | null;
};

export type FeeStatus = {
  state: FeeState;
  due_on: string | null;
  days_late: number;
  grace_days: number;
  period_id: number | null;
  kind: FeeKind | null;
  amount: number | null;
  period_start: string | null;
  period_end: string | null;
  // O mês acabou e o motorista ainda não abriu o próximo.
  needs_renewal: boolean;
  claimed_at: string | null;
  receipt_path: string | null;
  pix: PixInfo | null;
  history: FeeHistoryItem[];
};

export const kindLabel: Record<FeeKind, string> = {
  free: 'Mês grátis',
  entry: 'Mês de entrada',
  standard: 'Mensalidade',
};

// "2026-10-25" -> "25/10".
export function formatDay(iso: string | null): string {
  if (!iso) return '';
  const [, month, day] = iso.split('-');
  return `${day}/${month}`;
}

export function moneyLabel(value: number | null): string {
  return value === null ? '' : formatMoney(value);
}

// "2026-10-25" + 5 dias -> "2026-10-30".
export function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

// Até que dia o motorista ainda recebe pedidos sem ter pago.
export function lastDayBeforeBlock(status: FeeStatus): string | null {
  return status.due_on ? addDays(status.due_on, status.grace_days) : null;
}

// A frase que cobra o motorista: quanto tempo de atraso e o que acontece em seguida.
export function nagText(status: FeeStatus): string {
  const days = status.days_late;
  const late = `Sua mensalidade está vencida há ${days} dia${days > 1 ? 's' : ''}.`;
  if (status.state === 'overdue') {
    return `${late} Você está sem receber pedidos até pagar.`;
  }
  return `${late} Pague hoje: você deixa de receber pedidos depois de ${formatDay(lastDayBeforeBlock(status))}.`;
}

// Se o app precisa parar o motorista para falar da mensalidade ao abrir.
export function feeNeedsAttention(status: FeeStatus | null): boolean {
  return !!status && (status.state === 'due' || status.state === 'overdue');
}

export async function fetchFeeStatus(): Promise<FeeStatus | null> {
  const { data, error } = await supabase.rpc('my_fee_status');
  if (error) throw error;
  return (data as FeeStatus | null) ?? null;
}

// Abre o próximo mês (aceita o contrato). Só vale quando o mês anterior acabou.
export async function continueContract(version: string): Promise<void> {
  const { error } = await supabase.rpc('continue_contract', { p_contract_version: version });
  if (error) throw error;
}

// A cobrança do mês (Pix e cartão) gerada pelo Asaas, pedida ao Worker simbora-pagamentos.
export type FeeCharge = {
  amount: number;
  dueOn: string;
  invoiceUrl: string;
  pixPayload: string | null;
  pixQrImage: string | null;
};

// Recusa que o Worker escreve em português (ex.: "A cobrança abre 5 dias antes do vencimento").
export class FeeChargeError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function fetchFeeCharge(): Promise<FeeCharge> {
  const base = process.env.EXPO_PUBLIC_PAGAMENTOS_URL;
  if (!base) throw new FeeChargeError('O pagamento ainda não está configurado. Fale com o suporte do Simbora Car.', 0);
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new FeeChargeError('Entre no app para ver a cobrança.', 401);

  let response: Response;
  try {
    response = await fetch(`${base.replace(/\/$/, '')}/fee/charge`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new FeeChargeError('Sem conexão com o Simbora Car. Confira a internet.', 0);
  }
  const body = (await response.json().catch(() => null)) as (FeeCharge & { error?: string }) | null;
  if (!response.ok) {
    throw new FeeChargeError(body?.error ?? 'Não conseguimos gerar a cobrança agora. Tente de novo.', response.status);
  }
  return body as FeeCharge;
}
