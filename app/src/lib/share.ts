import type { Ride } from './rides';
import { supabase } from './supabase';

// Endereço das páginas públicas (trajeto compartilhado e convite do motorista),
// que moram no mesmo site do painel. Fica em configuração: depois de ter o
// domínio próprio, troque EXPO_PUBLIC_SHARE_BASE_URL no .env.local.
export const SHARE_BASE_URL = (
  process.env.EXPO_PUBLIC_SHARE_BASE_URL || 'https://simbora-taxi.joaovictordesouza123-9.workers.dev'
).replace(/\/+$/, '');

export function tripUrl(code: string): string {
  return `${SHARE_BASE_URL}/t/${code}`;
}

export function driverInviteUrl(code: string): string {
  return `${SHARE_BASE_URL}/m/${code}`;
}

// O link do trajeto da corrida (cria na primeira vez, depois devolve o mesmo).
export async function createRideShare(rideId: number): Promise<string> {
  const { data, error } = await supabase.rpc('create_ride_share', { p_ride_id: rideId });
  if (error) throw error;
  return tripUrl(data as string);
}

export function tripShareMessage(ride: Pick<Ride, 'kind'>, url: string): string {
  return ride.kind === 'delivery'
    ? `Acompanhe a entrega pelo Simbora Car: ${url}`
    : `Estou numa corrida pelo Simbora Car. Acompanhe o meu trajeto ao vivo: ${url}`;
}

// Mensagem para o lojista mandar a quem recebe o pacote: o link para ver onde
// está a entrega, o código que o entregador vai pedir e o convite para baixar.
export function recipientMessage(name: string, code: string, url: string): string {
  const first = name.trim().split(' ')[0];
  return [
    `Olá, ${first}! Uma entrega está a caminho pelo Simbora Car.`,
    `Acompanhe aqui: ${url}`,
    `Quando o entregador chegar, diga a ele o código ${code}. Sem o código, ele não consegue finalizar a entrega.`,
    `Quer pedir corridas e entregas? Conheça o Simbora Car: ${SHARE_BASE_URL}`,
  ].join('\n');
}
