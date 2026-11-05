import { formatPhone, isValidPhone, onlyDigits } from './phone';

// WhatsApp do suporte (o mesmo número de SUPPORT_PHONE_LABEL em drivers.ts).
const SUPPORT_WHATSAPP = '5588988941408';

// Link do WhatsApp para quem não recebeu o código: já leva o número digitado, se estiver completo.
export function supportWhatsappUrl(phoneDigits: string): string {
  const digits = onlyDigits(phoneDigits);
  const who = isValidPhone(digits) ? ` Meu número é ${formatPhone(digits)}.` : '';
  const text = `Oi! O código de entrada do Simbora Car não chegou.${who}`;
  return `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(text)}`;
}
