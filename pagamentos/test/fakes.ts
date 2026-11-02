// Banco e Asaas falsos, em memória, para testar o Worker sem rede. O banco imita as 4 funções
// asaas_* do SQL (mesmas regras: um pagamento por mês, baixa idempotente).

export type Call = { service: 'asaas' | 'supabase'; method: string; path: string; body: unknown };

type Period = { id: number; driverId: string; amount: number; dueOn: string; periodStart: string; status: 'open' | 'paid' };

export type World = {
  calls: Call[];
  periods: Period[];
  customers: Map<string, string>;
  charges: Map<number, { paymentId: string; invoiceUrl: string; pixPayload: string | null }>;
  driver: { id: string; name: string; cpf: string | null; phone: string; approved: boolean };
  // Faz o Asaas responder erro em POST /v3/payments.
  asaasFails: boolean;
  nextPayment: number;
  // Uma pausa antes de criar o pagamento, para simular pedidos ao mesmo tempo.
  paymentDelayMs: number;
};

export function newWorld(overrides: Partial<World> = {}): World {
  return {
    calls: [],
    periods: [{ id: 42, driverId: 'drv-1', amount: 200, dueOn: '2026-11-05', periodStart: '2026-11-01', status: 'open' }],
    customers: new Map(),
    charges: new Map(),
    driver: { id: 'drv-1', name: 'João Motorista', cpf: '12345678909', phone: '88999990000', approved: true },
    asaasFails: false,
    nextPayment: 1,
    paymentDelayMs: 0,
    ...overrides,
  };
}

function json(status: number, body: unknown): Response {
  if (status === 204) return new Response(null, { status });
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

export function fakeFetch(world: World): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;

    if (url.host === 'api-sandbox.asaas.com') {
      world.calls.push({ service: 'asaas', method, path: url.pathname, body });
      if (url.pathname === '/v3/customers' && method === 'POST') {
        return json(200, { id: `cus_${world.customers.size + 1}`, name: body.name });
      }
      if (url.pathname === '/v3/payments' && method === 'POST') {
        if (world.paymentDelayMs) await new Promise((r) => setTimeout(r, world.paymentDelayMs));
        if (world.asaasFails) return json(400, { errors: [{ code: 'invalid_action', description: 'Chave inválida' }] });
        const n = world.nextPayment++;
        return json(200, { id: `pay_${n}`, status: 'PENDING', invoiceUrl: `https://sandbox.asaas.com/i/${n}` });
      }
      const qr = url.pathname.match(/^\/v3\/payments\/(pay_\d+)\/pixQrCode$/);
      if (qr && method === 'GET') {
        return json(200, { payload: `PIX-${qr[1]}`, encodedImage: `IMG-${qr[1]}`, expirationDate: '2027-11-05 23:59:59' });
      }
      return json(404, { errors: [{ description: 'não existe' }] });
    }

    // Supabase: /rest/v1/rpc/<função>
    const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/(\w+)$/);
    if (url.host === 'supabase.test' && rpc) {
      world.calls.push({ service: 'supabase', method, path: rpc[1], body });
      const name = rpc[1];
      if (name === 'asaas_charge_context') {
        if (!world.driver.approved) return json(400, { message: 'Só motorista aprovado paga mensalidade' });
        const p = world.periods.find((x) => x.driverId === body.p_driver && x.status === 'open');
        if (!p) return json(400, { message: 'Você não tem mensalidade para pagar agora' });
        const c = world.charges.get(p.id);
        return json(200, [
          {
            period_id: p.id,
            amount: p.amount,
            due_on: p.dueOn,
            period_start: p.periodStart,
            full_name: world.driver.name,
            cpf: world.driver.cpf,
            phone: world.driver.phone,
            asaas_customer_id: world.customers.get(body.p_driver) ?? null,
            asaas_payment_id: c?.paymentId ?? null,
            invoice_url: c?.invoiceUrl ?? null,
            pix_payload: c?.pixPayload ?? null,
          },
        ]);
      }
      if (name === 'asaas_save_customer') {
        if (!world.customers.has(body.p_driver)) world.customers.set(body.p_driver, body.p_customer_id);
        return json(204, null);
      }
      if (name === 'asaas_save_charge') {
        if (!world.charges.has(body.p_period_id)) {
          world.charges.set(body.p_period_id, { paymentId: body.p_payment_id, invoiceUrl: body.p_invoice_url, pixPayload: body.p_pix_payload });
        }
        return json(204, null);
      }
      if (name === 'asaas_mark_paid') {
        const entry = [...world.charges.entries()].find(([, c]) => c.paymentId === body.p_payment_id);
        const period = entry && world.periods.find((p) => p.id === entry[0]);
        if (!period || period.status !== 'open') return json(200, false);
        period.status = 'paid';
        return json(200, true);
      }
    }
    if (url.host === 'supabase.test' && url.pathname === '/auth/v1/user') {
      world.calls.push({ service: 'supabase', method, path: 'auth/user', body: undefined });
      const token = (init?.headers as Record<string, string> | undefined)?.Authorization;
      return token === 'Bearer jwt-do-joao' ? json(200, { id: 'drv-1' }) : json(401, { message: 'invalid' });
    }
    return json(404, { message: 'rota desconhecida no teste' });
  }) as typeof fetch;
}

export const asaasConfig = { baseUrl: 'https://api-sandbox.asaas.com', apiKey: 'chave-de-teste' };
export const supabaseConfig = { url: 'https://supabase.test', serviceKey: 'service-de-teste' };
