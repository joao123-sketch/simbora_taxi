export function money(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// "12,5" ou "12.5" -> 12.5; vazio ou lixo -> null.
export function parseDecimal(text: string): number | null {
  const clean = text.trim().replace(/\./g, '').replace(',', '.');
  if (clean === '') return null;
  const value = Number(clean);
  return Number.isFinite(value) ? value : null;
}

// 12.5 -> "12,5" (para mostrar dentro de um campo de texto).
export function toField(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value).replace('.', ',');
}

export function formatCpf(cpf: string | null): string {
  if (!cpf || cpf.length !== 11) return cpf ?? '—';
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}

// "2026-10-24" ou "2026-10-24T17:00:00Z" -> "24/10/2026"
export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return d.toLocaleDateString('pt-BR');
}

export function todayIso(): string {
  const d = new Date();
  const two = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

export const vehicleLabel: Record<string, string> = { car: 'Carro', moto: 'Moto' };
