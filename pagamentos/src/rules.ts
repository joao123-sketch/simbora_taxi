// Eventos do Asaas que significam "o dinheiro entrou".
export const PAYING_EVENTS = ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'] as const;

export function isPayingEvent(event: string): boolean {
  return (PAYING_EVENTS as readonly string[]).includes(event);
}

export type AsaasPaymentBody = {
  customer: string;
  // UNDEFINED deixa quem paga escolher entre Pix e cartão na página do Asaas.
  billingType: 'UNDEFINED';
  value: number;
  dueDate: string;
  externalReference: string;
  description: string;
};

export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

// Corpo da cobrança do mês. O Asaas não aceita vencimento no passado: mês já vencido vence hoje.
export function paymentBody(
  input: { customerId: string; amount: number; dueOn: string; periodId: number; periodStart: string },
  today: string = todayIso(),
): AsaasPaymentBody {
  return {
    customer: input.customerId,
    billingType: 'UNDEFINED',
    value: input.amount,
    dueDate: input.dueOn < today ? today : input.dueOn,
    externalReference: `fee:${input.periodId}`,
    description: `Mensalidade Simbora Car ${input.periodStart.slice(0, 7)}`,
  };
}
