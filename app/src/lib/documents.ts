// CPF e data de nascimento: máscara, validação e conversão, iguais às do banco.

export function onlyDigits(value: string, max = 11): string {
  return value.replace(/\D/g, '').slice(0, max);
}

// "52998224725" -> "529.982.247-25"
export function formatCpf(value: string): string {
  const d = onlyDigits(value, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function isValidCpf(value: string): boolean {
  const d = onlyDigits(value, 11);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const digit = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return digit(9) === Number(d[9]) && digit(10) === Number(d[10]);
}

// "15031990" -> "15/03/1990"
export function formatBirthDate(value: string): string {
  const d = onlyDigits(value, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

export type BirthDate = { iso: string; age: number };

// Devolve a data (AAAA-MM-DD) e a idade, ou null se não for uma data de verdade.
export function parseBirthDate(value: string): BirthDate | null {
  const d = onlyDigits(value, 8);
  if (d.length !== 8) return null;
  const day = Number(d.slice(0, 2));
  const month = Number(d.slice(2, 4));
  const year = Number(d.slice(4, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;

  const today = new Date();
  let age = today.getFullYear() - year;
  if (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day)) age -= 1;
  if (age < 0 || age > 100) return null;

  return { iso: `${d.slice(4, 8)}-${d.slice(2, 4)}-${d.slice(0, 2)}`, age };
}
