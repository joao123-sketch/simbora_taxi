import { supabase } from './supabase';
import type { Ride } from './rides';

// Viagens agendadas entre cidades: o passageiro marca dia e horário (de 1 hora a
// 7 dias à frente), os motoristas veem numa lista (mesmo offline) e a viagem fica
// agendada para os dois. Todas as horas são do fuso de Fortaleza (UTC-3, sem
// horário de verão), não importa o fuso do aparelho.

export const MIN_AHEAD_MS = 60 * 60 * 1000;
export const MAX_AHEAD_MS = 7 * 24 * 60 * 60 * 1000;
// A viagem passa a ser uma corrida normal (cheguei, iniciar...) a menos de 1 hora da hora marcada.
export const LIVE_WINDOW_MS = 60 * 60 * 1000;

const FORTALEZA_MS = 3 * 60 * 60 * 1000;
const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const two = (n: number) => String(n).padStart(2, '0');

// Campos de data e hora de Fortaleza para um instante (lidos em UTC depois de tirar 3 h).
export function fortalezaParts(at: Date) {
  const f = new Date(at.getTime() - FORTALEZA_MS);
  return {
    year: f.getUTCFullYear(),
    month: f.getUTCMonth(),
    day: f.getUTCDate(),
    hour: f.getUTCHours(),
    minute: f.getUTCMinutes(),
    weekday: f.getUTCDay(),
  };
}

// O instante em que são `hour:minute` do dia `day` (0 = hoje, em Fortaleza).
export function instantFor(dayOffset: number, hour: number, minute: number, now: Date = new Date()): Date {
  const p = fortalezaParts(now);
  return new Date(Date.UTC(p.year, p.month, p.day + dayOffset, hour, minute) + FORTALEZA_MS);
}

export function dayLabel(dayOffset: number, now: Date = new Date()): string {
  if (dayOffset === 0) return 'Hoje';
  if (dayOffset === 1) return 'Amanhã';
  const p = fortalezaParts(instantFor(dayOffset, 12, 0, now));
  return `${WEEKDAYS[p.weekday]} ${two(p.day)}/${two(p.month + 1)}`;
}

// "amanhã, 08:00", "sex 30/10, 14:30"
export function formatScheduled(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '';
  const at = new Date(iso);
  const p = fortalezaParts(at);
  const today = fortalezaParts(now);
  const diffDays = Math.round(
    (Date.UTC(p.year, p.month, p.day) - Date.UTC(today.year, today.month, today.day)) / (24 * 60 * 60 * 1000),
  );
  const day =
    diffDays === 0
      ? 'hoje'
      : diffDays === 1
        ? 'amanhã'
        : `${WEEKDAYS[p.weekday]} ${two(p.day)}/${two(p.month + 1)}`;
  return `${day}, ${two(p.hour)}:${two(p.minute)}`;
}

// Valor aceito pelo banco? De 1 hora a 7 dias à frente.
export function scheduleError(at: Date, now: Date = new Date()): string | null {
  const ahead = at.getTime() - now.getTime();
  if (ahead < MIN_AHEAD_MS) return 'Escolha um horário daqui a pelo menos 1 hora.';
  if (ahead > MAX_AHEAD_MS) return 'Dá para agendar até 7 dias à frente.';
  return null;
}

// Agendada e ainda longe da hora (mais de 1 hora): não conta como corrida em andamento.
export function isScheduledWait(ride: Pick<Ride, 'scheduled_for'>, now: Date = new Date()): boolean {
  return !!ride.scheduled_for && new Date(ride.scheduled_for).getTime() > now.getTime() + LIVE_WINDOW_MS;
}

// Filtro (PostgREST) das corridas "em andamento": as agendadas só entram perto da hora.
export function liveFilter(now: Date = new Date()): string {
  return `scheduled_for.is.null,scheduled_for.lte.${new Date(now.getTime() + LIVE_WINDOW_MS).toISOString()}`;
}

// Pedido agendado que ninguém aceitou até 15 minutos depois da hora marcada vence.
export async function expireScheduled(): Promise<void> {
  await supabase.rpc('expire_scheduled_rides');
}

// As viagens agendadas da pessoa (como passageiro ou como motorista), da mais próxima à mais longe.
export async function fetchMyScheduled(role: 'passenger' | 'driver', userId: string): Promise<Ride[]> {
  const query = supabase
    .from('ride_details')
    .select('*')
    .not('scheduled_for', 'is', null)
    .gt('scheduled_for', new Date().toISOString())
    .order('scheduled_for');
  const { data, error } =
    role === 'passenger'
      ? await query.eq('passenger_id', userId).in('status', ['requested', 'accepted'])
      : await query.eq('driver_id', userId).eq('status', 'accepted');
  if (error) throw error;
  return data as Ride[];
}

// Uma viagem agendada que o motorista pode pegar.
export type OpenScheduled = {
  ride_id: number;
  scheduled_for: string;
  vehicle_type: Ride['vehicle_type'];
  payment_method: Ride['payment_method'];
  origin_address: string;
  origin_lat: number;
  origin_lng: number;
  destination_address: string;
  destination_lat: number;
  destination_lng: number;
  destination_city_name: string;
  destination_place: string | null;
  estimated_price: number;
  distance_km: number;
  round_trip: boolean;
  wait_minutes: number;
  passenger_first_name: string;
  // Já tem outra viagem agendada a menos de 2 horas dessa.
  conflict: boolean;
};

export async function fetchOpenScheduled(): Promise<OpenScheduled[]> {
  const { data, error } = await supabase.rpc('open_scheduled_rides');
  if (error) throw error;
  return data as OpenScheduled[];
}

export async function acceptScheduled(rideId: number, advancePercent: number): Promise<void> {
  const { error } = await supabase.rpc('accept_scheduled_ride', {
    p_ride_id: rideId,
    p_advance_percent: advancePercent,
  });
  if (error) throw error;
}

export async function releaseScheduled(rideId: number): Promise<void> {
  const { error } = await supabase.rpc('release_scheduled_ride', { p_ride_id: rideId });
  if (error) throw error;
}

// O cartão de pedido do motorista foi feito para a corrida normal: monta uma
// "corrida" com os campos que ele usa. (A cidade de destino diferente da de
// origem faz o cartão mostrar a escolha do adiantamento.)
export function scheduledToRide(s: OpenScheduled): Ride {
  return {
    id: s.ride_id,
    status: 'requested',
    scheduled_for: s.scheduled_for,
    vehicle_type: s.vehicle_type,
    payment_method: s.payment_method,
    passenger_id: '',
    driver_id: null,
    city_id: 0,
    destination_city_id: 1,
    origin_address: s.origin_address,
    origin_lat: s.origin_lat,
    origin_lng: s.origin_lng,
    destination_address: `${s.destination_address}${s.destination_city_name ? ` (${s.destination_city_name})` : ''}`,
    destination_place: s.destination_place,
    destination_lat: s.destination_lat,
    destination_lng: s.destination_lng,
    distance_km: s.distance_km,
    estimated_price: s.estimated_price,
    extra_amount: 0,
    final_price: null,
    requested_at: s.scheduled_for,
    completed_at: null,
    cancelled_at: null,
    my_rating: null,
    passenger_name: s.passenger_first_name,
    driver_name: null,
    vehicle_model: null,
    vehicle_color: null,
    vehicle_plate: null,
    round_trip: s.round_trip,
    wait_minutes: s.wait_minutes,
  };
}
