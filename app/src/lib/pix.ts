// Monta o Pix "copia e cola" (BR Code estático) com chave, valor e nome da
// empresa. O mesmo texto vira o QR. Sem dependências, para rodar em qualquer lugar.

export type PixInfo = {
  key: string;
  name: string;
  city: string;
  description: string;
};

// Campo do padrão: id (2 dígitos) + tamanho (2 dígitos) + valor.
function field(id: string, value: string): string {
  return `${id}${String(value.length).padStart(2, '0')}${value}`;
}

// O padrão só aceita letras sem acento e maiúsculas no nome e na cidade.
function plain(text: string, max: number): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .toUpperCase()
    .trim()
    .slice(0, max);
}

// CRC16-CCITT (polinômio 0x1021, início 0xFFFF), como o padrão do Pix pede.
export function crc16(text: string): string {
  let crc = 0xffff;
  for (let i = 0; i < text.length; i++) {
    crc ^= text.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function pixPayload(info: PixInfo, amount: number): string {
  const account =
    field('00', 'br.gov.bcb.pix') + field('01', info.key.trim()) + field('02', info.description.trim().slice(0, 25));

  const body =
    field('00', '01') +
    field('01', '11') +
    field('26', account) +
    field('52', '0000') +
    field('53', '986') +
    field('54', amount.toFixed(2)) +
    field('58', 'BR') +
    field('59', plain(info.name, 25)) +
    field('60', plain(info.city, 15)) +
    field('62', field('05', '***')) +
    '6304';

  return body + crc16(body);
}
