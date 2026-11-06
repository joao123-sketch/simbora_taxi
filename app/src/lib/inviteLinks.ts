// Links e textos de convite. Sem nenhuma importação de rede, para testar à parte.

// Endereço do próprio app (PWA). Com domínio próprio, troque EXPO_PUBLIC_APP_URL.
export const APP_URL = (
  process.env.EXPO_PUBLIC_APP_URL || 'https://simbora-app.joaovictordesouza123-9.workers.dev'
).replace(/\/+$/, '');

// Link que cai direto no cadastro de motorista (depois do login, se a pessoa ainda não entrou).
export function driverSignupUrl(): string {
  return `${APP_URL}/motorista`;
}

// Convite para um conhecido virar motorista, para mandar pelo WhatsApp.
// Com o nome da cidade onde a pessoa está; sem ele, a frase fica sem cidade.
export function driverRecruitMessage(cityName?: string): string {
  const where = cityName ? ` em ${cityName}` : '';
  return `Quer ganhar dinheiro dirigindo${where}? No Simbora Car o primeiro mês é grátis. Cadastre-se como motorista: ${driverSignupUrl()}`;
}

export function whatsappUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
