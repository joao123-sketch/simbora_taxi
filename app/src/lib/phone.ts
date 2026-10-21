// Telefones brasileiros: a pessoa digita DDD + número, o app cuida do +55.

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, 11);
}

// "88999990000" -> "(88) 99999-0000"
export function formatPhone(digits: string): string {
  const d = onlyDigits(digits);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function isValidPhone(digits: string): boolean {
  return onlyDigits(digits).length === 11;
}

export function toE164(digits: string): string {
  return `+55${onlyDigits(digits)}`;
}
