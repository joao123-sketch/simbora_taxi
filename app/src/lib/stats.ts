import type { Coord } from '../components/PinMap.types';
import { suggestPlaces, type SuggestedPlace } from './favorites';
import { supabase } from './supabase';

// Números do dashboard de "Minhas corridas": calculados no app a partir das
// corridas concluídas dos últimos 30 dias (o banco só entrega as do próprio
// usuário). Tempo online, nota média e taxa de aceite do motorista dependem de
// dados novos no banco e entram depois.

export type Period = 'today' | 'week' | 'month';

export const PERIODS: { key: Period; label: string }[] = [
  { key: 'today', label: 'Hoje' },
  { key: 'week', label: '7 dias' },
  { key: 'month', label: '30 dias' },
];

export type FinishedRide = {
  id: number;
  price: number;
  km: number;
  finishedAt: Date;
  destinationAddress: string;
} & { destination: Coord };

export type Summary = {
  rides: number;
  money: number;
  km: number;
  average: number;
  // Os lugares mais usados como destino (só passageiro vê isso).
  topPlaces: SuggestedPlace[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function periodStart(period: Period, now: Date = new Date()): Date {
  if (period === 'today') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  return new Date(now.getTime() - (period === 'week' ? 7 : 30) * DAY_MS);
}

type Row = {
  id: number;
  final_price: number | null;
  estimated_price: number;
  distance_km: number | null;
  completed_at: string | null;
  destination_address: string;
  destination_lat: number;
  destination_lng: number;
};

// Corridas concluídas dos últimos 30 dias do usuário, como motorista ou passageiro.
export async function fetchFinishedRides(role: 'passenger' | 'driver', userId: string): Promise<FinishedRide[]> {
  const since = periodStart('month').toISOString();
  const { data, error } = await supabase
    .from('ride_details')
    .select('id, final_price, estimated_price, distance_km, completed_at, destination_address, destination_lat, destination_lng')
    .eq(role === 'passenger' ? 'passenger_id' : 'driver_id', userId)
    .eq('status', 'completed')
    .gte('completed_at', since)
    .order('completed_at', { ascending: false })
    .limit(1000);
  if (error) throw error;
  return (data as Row[]).map((r) => ({
    id: r.id,
    price: r.final_price ?? r.estimated_price,
    km: r.distance_km ?? 0,
    finishedAt: new Date(r.completed_at ?? Date.now()),
    destinationAddress: r.destination_address,
    destination: { lat: r.destination_lat, lng: r.destination_lng },
  }));
}

export function summarize(rides: FinishedRide[], period: Period, now: Date = new Date()): Summary {
  const start = periodStart(period, now).getTime();
  const inPeriod = rides.filter((r) => r.finishedAt.getTime() >= start);
  const money = inPeriod.reduce((total, r) => total + r.price, 0);
  const km = inPeriod.reduce((total, r) => total + r.km, 0);
  return {
    rides: inPeriod.length,
    money,
    km,
    average: inPeriod.length > 0 ? money / inPeriod.length : 0,
    topPlaces: suggestPlaces(
      inPeriod.map((r) => ({ address: r.destinationAddress, lat: r.destination.lat, lng: r.destination.lng })),
      1,
    ).slice(0, 3),
  };
}

// Quanto tempo o motorista ficou online desde `since`; nulo se o banco ainda
// não tem essa função (o dashboard simplesmente não mostra o card).
export async function fetchOnlineSeconds(since: Date): Promise<number | null> {
  const { data, error } = await supabase.rpc('driver_online_seconds', { p_since: since.toISOString() });
  if (error) return null;
  return Number(data ?? 0);
}

export type RatingSummary = {
  // Média das estrelas (nulo sem nenhuma avaliação) e quantas foram.
  ratingAvg: number | null;
  ratingCount: number;
  // Aceitou ÷ (aceitou + recusou), de 0 a 1; nulo se ainda não decidiu nenhum pedido.
  acceptRate: number | null;
};

// Nota média e taxa de aceite do motorista desde `since`; nulo se o banco ainda
// não tem essa função (o dashboard simplesmente não mostra os cards).
export async function fetchRatingSummary(since: Date): Promise<RatingSummary | null> {
  const { data, error } = await supabase.rpc('driver_rating_summary', { p_since: since.toISOString() });
  if (error) return null;
  const row = (data as { rating_avg: number | null; rating_count: number; accept_rate: number | null }[])[0];
  if (!row) return null;
  return {
    ratingAvg: row.rating_avg === null ? null : Number(row.rating_avg),
    ratingCount: Number(row.rating_count),
    acceptRate: row.accept_rate === null ? null : Number(row.accept_rate),
  };
}

// 4.5 -> "4,5"; 0.857 -> "86%".
export function formatRating(avg: number): string {
  return avg.toFixed(1).replace('.', ',');
}

export function formatPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

// 12300 s -> "3 h 25 min"; menos de uma hora -> "42 min".
export function formatDuration(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours} h ${String(minutes).padStart(2, '0')} min` : `${minutes} min`;
}

export function formatKmTotal(km: number): string {
  return `${km.toFixed(1).replace('.', ',')} km`;
}
