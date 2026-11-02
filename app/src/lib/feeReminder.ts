// Lembrete da mensalidade nos dias que antecedem o vencimento. Sem imports: roda no Node nos testes.

// Quantos dias antes do vencimento o lembrete começa.
export const REMINDER_DAYS = 5;

type Reminder = { state: string; due_on: string | null; amount: number | null };

function parse(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

// "2026-11-02" local de hoje.
export function todayLocal(now: Date = new Date()): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}

// Dias de hoje até a data (negativo se já passou).
export function daysUntil(iso: string, today: string = todayLocal()): number {
  return Math.round((parse(iso) - parse(today)) / 86400000);
}

function brl(value: number): string {
  return `R$ ${value.toFixed(2).replace('.', ',')}`;
}

function shortDay(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

// A frase do lembrete, ou null quando não é hora (mês longe, já vencido ou nada a pagar).
export function reminderText(status: Reminder | null, today: string = todayLocal()): string | null {
  if (!status || status.state !== 'pending' || !status.due_on || status.amount === null) return null;
  const days = daysUntil(status.due_on, today);
  if (days < 0 || days > REMINDER_DAYS) return null;
  const when = days === 0 ? 'vence hoje' : days === 1 ? 'vence amanhã' : `vence em ${days} dias`;
  return `Sua mensalidade de ${brl(status.amount)} ${when} (${shortDay(status.due_on)}). Pague pelo Pix para não ficar sem pedidos.`;
}
