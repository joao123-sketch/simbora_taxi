const MIN_NAME = 2;
const MAX_NAME = 60;

// Arruma o nome digitado: tira espaços das pontas, junta os do meio e corta em 60 letras.
// Devolve null se ficar curto demais para ser um nome.
export function cleanName(raw: string): string | null {
  const name = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME).trim();
  return name.length >= MIN_NAME ? name : null;
}
