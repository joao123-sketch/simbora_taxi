import type { Fetch } from './asaas.ts';

export type SupabaseConfig = { url: string; serviceKey: string };

// Erro com a mensagem em português escrita de propósito no banco (raise exception).
export class DbError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DbError';
  }
}

// Chama uma função do banco com a chave de serviço (só ela executa as funções asaas_*).
export async function rpc<T>(f: Fetch, cfg: SupabaseConfig, name: string, args: object): Promise<T> {
  const response = await f(`${cfg.url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: cfg.serviceKey,
      Authorization: `Bearer ${cfg.serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  if (response.status === 204) return undefined as T;
  const data = (await response.json().catch(() => null)) as { message?: string } | T | null;
  if (!response.ok) {
    throw new DbError((data as { message?: string } | null)?.message ?? `Banco respondeu ${response.status}`);
  }
  return data as T;
}

// Quem é o dono deste login? Devolve o id do usuário ou null se o token não vale.
export async function userFromJwt(f: Fetch, cfg: SupabaseConfig, jwt: string): Promise<string | null> {
  const response = await f(`${cfg.url}/auth/v1/user`, {
    headers: { apikey: cfg.serviceKey, Authorization: `Bearer ${jwt}` },
  });
  if (!response.ok) return null;
  const user = (await response.json().catch(() => null)) as { id?: string } | null;
  return user?.id ?? null;
}
