import type { AsaasPaymentBody } from './rules.ts';

export type Fetch = typeof fetch;
export type AsaasConfig = { baseUrl: string; apiKey: string };

export class AsaasError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'AsaasError';
  }
}

async function call<T>(f: Fetch, cfg: AsaasConfig, method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const response = await f(`${cfg.baseUrl}${path}`, {
    method,
    headers: {
      access_token: cfg.apiKey,
      'User-Agent': 'SimboraCar/1.0',
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await response.json().catch(() => null)) as { errors?: { description?: string }[] } | null;
  if (!response.ok) {
    throw new AsaasError(response.status, data?.errors?.[0]?.description ?? `Asaas respondeu ${response.status}`);
  }
  return data as T;
}

export async function createCustomer(
  f: Fetch,
  cfg: AsaasConfig,
  customer: { name: string; cpfCnpj: string; mobilePhone?: string; externalReference: string },
): Promise<string> {
  const created = await call<{ id: string }>(f, cfg, 'POST', '/v3/customers', {
    ...customer,
    // O aviso por e-mail e SMS do Asaas é desligado: o app mostra a cobrança.
    notificationDisabled: true,
  });
  return created.id;
}

export async function createPayment(f: Fetch, cfg: AsaasConfig, body: AsaasPaymentBody): Promise<{ id: string; invoiceUrl: string }> {
  const created = await call<{ id: string; invoiceUrl: string }>(f, cfg, 'POST', '/v3/payments', body);
  return { id: created.id, invoiceUrl: created.invoiceUrl };
}

// Código "copia e cola" e imagem do QR. Sem QR (ex.: Pix ainda não disponível) devolve null.
export async function getPixQr(f: Fetch, cfg: AsaasConfig, paymentId: string): Promise<{ payload: string; encodedImage: string } | null> {
  try {
    const qr = await call<{ payload: string; encodedImage: string }>(f, cfg, 'GET', `/v3/payments/${paymentId}/pixQrCode`);
    return { payload: qr.payload, encodedImage: qr.encodedImage };
  } catch (e) {
    if (e instanceof AsaasError) return null;
    throw e;
  }
}
