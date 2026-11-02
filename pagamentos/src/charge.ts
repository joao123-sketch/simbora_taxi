import { createCustomer, createPayment, getPixQr, type AsaasConfig, type Fetch } from './asaas.ts';
import { paymentBody } from './rules.ts';
import { DbError, rpc, type SupabaseConfig } from './supabase.ts';

export type FeeCharge = {
  amount: number;
  dueOn: string;
  invoiceUrl: string;
  pixPayload: string | null;
  pixQrImage: string | null;
};

type Deps = { fetch: Fetch; asaas: AsaasConfig; supabase: SupabaseConfig };

type Context = {
  period_id: number;
  amount: number;
  due_on: string;
  period_start: string;
  full_name: string | null;
  cpf: string | null;
  phone: string | null;
  asaas_customer_id: string | null;
  asaas_payment_id: string | null;
  invoice_url: string | null;
  pix_payload: string | null;
};

async function readContext(deps: Deps, driverId: string): Promise<Context> {
  const rows = await rpc<Context[]>(deps.fetch, deps.supabase, 'asaas_charge_context', { p_driver: driverId });
  return rows[0];
}

// A cobrança do mês aberto do motorista: devolve a que já existe ou cria uma no Asaas.
// Quem grava primeiro vence (um pagamento por mês, garantido no banco); se dois pedidos chegam
// juntos, os dois devolvem a cobrança gravada.
export async function getOrCreateCharge(deps: Deps, driverId: string): Promise<FeeCharge> {
  let ctx = await readContext(deps, driverId);

  if (!ctx.asaas_payment_id) {
    let customerId = ctx.asaas_customer_id;
    if (!customerId) {
      if (!ctx.cpf) throw new DbError('Seu cadastro está sem CPF. Fale com a equipe do Simbora Car.');
      customerId = await createCustomer(deps.fetch, deps.asaas, {
        name: ctx.full_name ?? 'Motorista Simbora Car',
        cpfCnpj: ctx.cpf,
        mobilePhone: ctx.phone ?? undefined,
        externalReference: driverId,
      });
      await rpc(deps.fetch, deps.supabase, 'asaas_save_customer', { p_driver: driverId, p_customer_id: customerId });
    }

    const payment = await createPayment(
      deps.fetch,
      deps.asaas,
      paymentBody({
        customerId,
        amount: ctx.amount,
        dueOn: ctx.due_on,
        periodId: ctx.period_id,
        periodStart: ctx.period_start,
      }),
    );
    const qr = await getPixQr(deps.fetch, deps.asaas, payment.id);
    await rpc(deps.fetch, deps.supabase, 'asaas_save_charge', {
      p_period_id: ctx.period_id,
      p_payment_id: payment.id,
      p_invoice_url: payment.invoiceUrl,
      p_pix_payload: qr?.payload ?? null,
    });
    // Relê: se outro pedido gravou antes, vale o dele.
    ctx = await readContext(deps, driverId);
  }

  const qr = await getPixQr(deps.fetch, deps.asaas, ctx.asaas_payment_id as string);
  return {
    amount: ctx.amount,
    dueOn: ctx.due_on,
    invoiceUrl: ctx.invoice_url as string,
    pixPayload: qr?.payload ?? ctx.pix_payload,
    pixQrImage: qr?.encodedImage ?? null,
  };
}
