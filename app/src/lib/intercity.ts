import { distanceKm } from './geo';
import type { City } from './rides';

// Acréscimo máximo que o motorista pode propor, em reais: o teto do painel sobre o valor calculado.
export function proposalLimit(estimatedPrice: number, cap: number): number {
  return Math.round(estimatedPrice * cap * 100) / 100;
}

// Valores que o motorista pode pedir no total: o teto do painel para cima e para baixo do valor calculado.
export function proposalRange(estimatedPrice: number, cap: number): { min: number; max: number } {
  const limit = proposalLimit(estimatedPrice, cap);
  return {
    min: Math.max(Math.round((estimatedPrice - limit) * 100) / 100, 0.01),
    max: Math.round((estimatedPrice + limit) * 100) / 100,
  };
}

// Quanto o valor pedido difere do calculado (negativo = desconto). É isso que o banco guarda na proposta.
export function extraFromTotal(estimatedPrice: number, total: number): number {
  return Math.round((total - estimatedPrice) * 100) / 100;
}

// A confirmação da viagem agendada: libera 12 horas antes e o prazo vai até 2 horas antes.
export type ConfirmState = 'not_needed' | 'too_early' | 'open' | 'expired';

const HOUR_MS = 3600_000;

export function confirmState(scheduledFor: string, confirmedAt: string | null, now: Date): ConfirmState {
  if (confirmedAt) return 'not_needed';
  const hoursLeft = (new Date(scheduledFor).getTime() - now.getTime()) / HOUR_MS;
  if (hoursLeft > 12) return 'too_early';
  if (hoursLeft > 2) return 'open';
  return 'expired';
}

// A cidade (entre as recebidas) mais perto do ponto. Serve para marcar a viagem como entre cidades
// e mostrar o nome ao motorista; o preço vem da distância do endereço, não daqui.
// A cidade ativa onde o ponto está: a mais próxima entre as que têm o ponto dentro do raio.
// Devolve null quando nenhuma cidade aberta cobre o ponto.
export function cityAt(point: { lat: number; lng: number }, cities: City[]): City | null {
  let best: City | null = null;
  let bestKm = Infinity;
  for (const city of cities) {
    if (!city.active) continue;
    const km = distanceKm(point, city);
    if (km <= city.radius_km && km < bestKm) {
      best = city;
      bestKm = km;
    }
  }
  return best;
}

// Onde a pessoa está, levando em conta o erro da posição (accuracyKm; null = desconhecido).
// O celular sem GPS fino (posição pela rede) erra por vários km: só é "fora" (outside) quem
// continua fora do raio de todas as cidades abertas mesmo descontando esse erro. Na dúvida,
// fica a cidade aberta mais próxima entre as que o erro alcança.
export function locateCity(
  point: { lat: number; lng: number },
  accuracyKm: number | null,
  cities: City[],
): { city: City | null; outside: boolean } {
  const exact = cityAt(point, cities);
  if (exact) return { city: exact, outside: false };
  const slack = accuracyKm ?? 0;
  let best: City | null = null;
  let bestKm = Infinity;
  for (const city of cities) {
    if (!city.active) continue;
    const km = distanceKm(point, city);
    if (km - slack <= city.radius_km && km < bestKm) {
      best = city;
      bestKm = km;
    }
  }
  return { city: best, outside: best === null };
}

export function nearestCity(point: { lat: number; lng: number }, cities: City[]): City | null {
  let best: City | null = null;
  let bestKm = Infinity;
  for (const city of cities) {
    const km = distanceKm(point, city);
    if (km < bestKm) {
      best = city;
      bestKm = km;
    }
  }
  return best;
}

// O que mudou numa viagem entre cidades, para o aviso local.
export type TripSnapshot = {
  status: string;
  proposals: number;
  confirmedAt: string | null;
  // Ficou sem efeito porque o passageiro não confirmou.
  voided: boolean;
};

export type TripEvent = { title: string; body: string; tag: string };

export function tripEvents(prev: TripSnapshot | null, next: TripSnapshot, role: 'passenger' | 'driver'): TripEvent[] {
  if (!prev) return [];
  const events: TripEvent[] = [];

  if (next.status === 'cancelled' && prev.status !== 'cancelled') {
    if (next.voided) {
      events.push({
        title: 'Viagem sem efeito',
        body:
          role === 'driver'
            ? 'O passageiro não confirmou a viagem. Seu horário foi liberado.'
            : 'Você não confirmou a viagem a tempo, então ela ficou sem efeito.',
        tag: 'trip-void',
      });
    } else if (role === 'passenger' && prev.status === 'requested') {
      events.push({
        title: 'Ninguém aceitou sua viagem',
        body: 'Nenhum motorista aceitou até a hora marcada. Você pode pedir de novo.',
        tag: 'trip-expired',
      });
    } else {
      events.push({
        title: 'Viagem cancelada',
        body: role === 'driver' ? 'O passageiro cancelou a viagem.' : 'O motorista cancelou a viagem.',
        tag: 'trip-cancelled',
      });
    }
    return events;
  }

  if (role === 'passenger' && next.proposals > prev.proposals) {
    events.push({
      title: 'Nova proposta',
      body: 'Um motorista fez uma proposta para a sua viagem. Toque para ver.',
      tag: 'trip-proposal',
    });
  }

  if (role === 'driver' && prev.status === 'requested' && next.status === 'accepted') {
    events.push({
      title: 'Sua proposta foi escolhida',
      body: 'O passageiro escolheu a sua proposta. Toque para ver a viagem.',
      tag: 'trip-accepted',
    });
  }

  if (role === 'driver' && !prev.confirmedAt && next.confirmedAt && next.status === 'accepted') {
    events.push({
      title: 'Viagem confirmada',
      body: 'O passageiro confirmou a viagem.',
      tag: 'trip-confirmed',
    });
  }

  return events;
}
