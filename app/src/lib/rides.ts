import type { Coord } from '../components/PinMap.types';
import { supabase } from './supabase';

export type VehicleType = 'car' | 'moto';
export type PaymentMethod = 'cash' | 'pix' | 'card';
export type RideStatus = 'requested' | 'accepted' | 'arrived' | 'in_progress' | 'completed' | 'cancelled';

export type City = Coord & {
  id: number;
  name: string;
  state: string;
  active: boolean;
};

export type Place = Coord & {
  address: string;
  cityId?: number;
  // Viagem para outra cidade: onde o passageiro quer ser deixado, se não for o
  // centro. O motorista vê o lugar e decide se aceita ou propõe um acréscimo.
  dropoffPlace?: string;
  // Viagem para outra cidade com ida e volta: o motorista espera e traz de volta.
  roundTrip?: boolean;
  waitMinutes?: number;
  // Entrega: o destino leva o pacote, o tamanho e quem recebe. Quando existe,
  // o preço e o pedido usam as funções de entrega do banco.
  delivery?: DeliveryInfo;
};

export type PackageSize = 'P' | 'M' | 'G';

export type DeliveryInfo = {
  size: PackageSize;
  recipientName: string;
  recipientNote: string;
};

export type Quote = {
  vehicle_type: VehicleType;
  // A cotação vale 2 minutos e é o único preço que o banco aceita no pedido.
  quote_id: string;
  expires_at: string;
  price: number;
  // Cartão custa 5% a mais; o banco já devolve o valor calculado.
  card_price: number;
  distance_km: number;
};

export function priceFor(quote: Quote, method: PaymentMethod): number {
  return method === 'card' ? quote.card_price : quote.price;
}

// Linha da view ride_details: os nomes só vêm preenchidos quando o RLS
// permite (ex.: o motorista vê o passageiro depois de aceitar). Telefone não
// é exposto: passageiro e motorista falam pelo chat do app.
export type Ride = {
  id: number;
  status: RideStatus;
  // Ausentes até o banco ter a migration da entrega.
  kind?: 'ride' | 'delivery';
  package_size?: PackageSize | null;
  recipient_name?: string | null;
  recipient_note?: string | null;
  vehicle_type: VehicleType;
  payment_method: PaymentMethod;
  passenger_id: string;
  driver_id: string | null;
  city_id: number;
  // Preenchido quando o destino é outra cidade.
  destination_city_id: number | null;
  // Pagamento adiantado (só viagem entre cidades): quanto o motorista pediu e
  // quando marcou que recebeu. Ausentes até o banco ter essa migration.
  round_trip?: boolean;
  wait_minutes?: number;
  advance_percent?: number | null;
  advance_received_at?: string | null;
  origin_address: string;
  origin_lat: number;
  origin_lng: number;
  destination_address: string;
  destination_place: string | null;
  destination_lat: number;
  destination_lng: number;
  distance_km: number;
  estimated_price: number;
  extra_amount: number;
  final_price: number | null;
  requested_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
  // A nota que o próprio usuário deu na corrida (passageiro avalia o motorista e vice-versa).
  my_rating: number | null;
  passenger_name: string | null;
  driver_name: string | null;
  vehicle_model: string | null;
  vehicle_color: string | null;
  vehicle_plate: string | null;
};

export const ACTIVE_STATUSES: RideStatus[] = ['requested', 'accepted', 'arrived', 'in_progress'];

export const vehicleLabel: Record<VehicleType, string> = { car: 'Carro', moto: 'Moto' };
export const paymentLabel: Record<PaymentMethod, string> = { cash: 'Dinheiro', pix: 'Pix', card: 'Cartão' };

// Como o motorista vê cada forma: o cartão é a maquininha dele.
export const receiveLabel: Record<PaymentMethod, string> = { cash: 'Dinheiro', pix: 'Pix', card: 'Maquininha (cartão)' };

export const PAYMENT_ORDER: PaymentMethod[] = ['cash', 'pix', 'card'];

export function formatMoney(value: number): string {
  return `R$ ${Number(value).toFixed(2).replace('.', ',')}`;
}

export async function fetchCities(): Promise<City[]> {
  const { data, error } = await supabase.from('cities_map').select('*').order('name');
  if (error) throw error;
  return data as City[];
}

export async function fetchActiveRide(role: 'passenger' | 'driver', userId: string): Promise<Ride | null> {
  const { data, error } = await supabase
    .from('ride_details')
    .select('*')
    .eq(role === 'passenger' ? 'passenger_id' : 'driver_id', userId)
    .in('status', ACTIVE_STATUSES)
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as Ride | null;
}

export async function fetchRide(rideId: number): Promise<Ride> {
  const { data, error } = await supabase.from('ride_details').select('*').eq('id', rideId).single();
  if (error) throw error;
  return data as Ride;
}

// Chamados abertos que o motorista online pode aceitar (o RLS já filtra
// pelo tipo de veículo dele).
export async function fetchOpenRequests(): Promise<Ride[]> {
  // Quem é passageiro e motorista na mesma conta não vê o próprio pedido na lista de chamados.
  const { data: auth } = await supabase.auth.getSession();
  const me = auth.session?.user.id;
  let query = supabase.from('ride_details').select('*').eq('status', 'requested');
  if (me) query = query.neq('passenger_id', me);
  const { data, error } = await query.order('requested_at');
  if (error) throw error;
  return data as Ride[];
}

export async function acceptRide(rideId: number, advancePercent: number | null = null): Promise<void> {
  // O adiantamento só é enviado nas viagens para outra cidade.
  const { error } = await supabase.rpc('accept_ride', {
    p_ride_id: rideId,
    ...(advancePercent !== null ? { p_advance_percent: advancePercent } : {}),
  });
  if (error) throw error;
}

export async function advanceRide(rideId: number): Promise<RideStatus> {
  const { data, error } = await supabase.rpc('advance_ride', { p_ride_id: rideId });
  if (error) throw error;
  return data as RideStatus;
}

// Chama onChange sempre que uma corrida visível para o usuário muda.
export function subscribeToRides(channelName: string, onChange: () => void, filter?: string) {
  const channel = supabase
    .channel(channelName)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rides', filter }, onChange)
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}


// Só manda os campos de ida e volta quando a corrida é de ida e volta; assim
// as corridas comuns não dependem deles.
function roundTripArgs(destination: Place): { p_round_trip?: boolean; p_wait_minutes?: number } {
  return destination.roundTrip ? { p_round_trip: true, p_wait_minutes: destination.waitMinutes ?? 0 } : {};
}

export async function quoteRide(cityId: number, origin: Place, destination: Place): Promise<Quote[]> {
  if (destination.delivery) {
    const { data, error } = await supabase.rpc('quote_delivery', {
      p_city_id: cityId,
      p_origin_lng: origin.lng,
      p_origin_lat: origin.lat,
      p_destination_lng: destination.lng,
      p_destination_lat: destination.lat,
      p_package_size: destination.delivery.size,
    });
    if (error) throw error;
    return data as Quote[];
  }
  const { data, error } = await supabase.rpc('quote_ride', {
    p_city_id: cityId,
    p_origin_lng: origin.lng,
    p_origin_lat: origin.lat,
    p_destination_lng: destination.lng,
    p_destination_lat: destination.lat,
    p_destination_city_id: destination.cityId ?? null,
    ...roundTripArgs(destination),
  });
  if (error) throw error;
  return data as Quote[];
}

export async function requestRide(params: {
  cityId: number;
  vehicleType: VehicleType;
  paymentMethod: PaymentMethod;
  origin: Place;
  destination: Place;
  quoteId: string;
}): Promise<number> {
  const { cityId, vehicleType, paymentMethod, origin, destination, quoteId } = params;
  if (destination.delivery) {
    const { data, error } = await supabase.rpc('request_delivery', {
      p_city_id: cityId,
      p_vehicle_type: vehicleType,
      p_payment_method: paymentMethod,
      p_origin_lng: origin.lng,
      p_origin_lat: origin.lat,
      p_origin_address: origin.address,
      p_destination_lng: destination.lng,
      p_destination_lat: destination.lat,
      p_destination_address: destination.address,
      p_quote_id: quoteId,
      p_package_size: destination.delivery.size,
      p_recipient_name: destination.delivery.recipientName,
      p_recipient_note: destination.delivery.recipientNote || null,
    });
    if (error) throw error;
    return data as number;
  }
  const { data, error } = await supabase.rpc('request_ride', {
    p_city_id: cityId,
    p_vehicle_type: vehicleType,
    p_payment_method: paymentMethod,
    p_origin_lng: origin.lng,
    p_origin_lat: origin.lat,
    p_origin_address: origin.address,
    p_destination_lng: destination.lng,
    p_destination_lat: destination.lat,
    p_destination_address: destination.address,
    p_quote_id: quoteId,
    p_destination_city_id: destination.cityId ?? null,
    p_destination_place: destination.dropoffPlace ?? null,
    ...roundTripArgs(destination),
  });
  if (error) throw error;
  return data as number;
}

export async function cancelRide(rideId: number): Promise<void> {
  const { error } = await supabase.rpc('cancel_ride', { p_ride_id: rideId });
  if (error) throw error;
}

// --- Proposta de acréscimo (viagem para outra cidade com lugar combinado) ---

export type ProposalStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn';

// A proposta do próprio motorista, para ele acompanhar.
export type MyProposal = {
  ride_id: number;
  extra_amount: number;
  advance_percent: number | null;
  status: ProposalStatus;
};

// A proposta como o passageiro vê: quem propõe e quanto.
export type RideProposal = {
  proposal_id: number;
  extra_amount: number;
  advance_percent: number | null;
  driver_name: string;
  vehicle_model: string;
  vehicle_color: string;
  vehicle_plate: string;
};

export async function proposeExtra(rideId: number, extra: number, advancePercent: number | null = null): Promise<void> {
  const { error } = await supabase.rpc('propose_extra', {
    p_ride_id: rideId,
    p_extra: extra,
    ...(advancePercent !== null ? { p_advance_percent: advancePercent } : {}),
  });
  if (error) throw error;
}

export async function withdrawProposal(rideId: number): Promise<void> {
  const { error } = await supabase.rpc('withdraw_proposal', { p_ride_id: rideId });
  if (error) throw error;
}

export async function fetchMyProposals(): Promise<MyProposal[]> {
  const { data, error } = await supabase
    .from('ride_proposals')
    .select('ride_id, extra_amount, advance_percent, status')
    .in('status', ['pending', 'declined']);
  if (error) throw error;
  return data as MyProposal[];
}

export async function fetchRideProposals(rideId: number): Promise<RideProposal[]> {
  const { data, error } = await supabase.rpc('get_ride_proposals', { p_ride_id: rideId });
  if (error) throw error;
  return data as RideProposal[];
}

export async function respondProposal(proposalId: number, accept: boolean): Promise<void> {
  const { error } = await supabase.rpc('respond_proposal', { p_proposal_id: proposalId, p_accept: accept });
  if (error) throw error;
}

// Chama onChange quando uma proposta muda (o RLS só entrega as do usuário).
export function subscribeToProposals(channelName: string, onChange: () => void) {
  const channel = supabase
    .channel(channelName)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ride_proposals' }, onChange)
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

// "20", "20,50" ou "20.5" -> 20.5; vazio ou inválido -> null.
export function parseMoney(text: string): number | null {
  const value = Number(text.trim().replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;
}

// Formas de pagamento que algum motorista online do tipo de veículo aceita.
export async function fetchPaymentOptions(cityId: number, vehicleType: VehicleType): Promise<PaymentMethod[]> {
  const { data, error } = await supabase.rpc('payment_options', { p_city_id: cityId, p_vehicle_type: vehicleType });
  if (error) throw error;
  return data as PaymentMethod[];
}

// --- Despacho, avaliação e histórico ---

// Quem ficou online depois, ou passou a aceitar a forma de pagamento, entra na fila
// dos pedidos que ainda estão abertos.
export async function claimOpenRequests(): Promise<void> {
  const { error } = await supabase.rpc('claim_open_requests');
  if (error) throw error;
}

// Recusar o pedido libera o próximo motorista da fila na hora.
export async function declineRide(rideId: number): Promise<void> {
  const { error } = await supabase.rpc('decline_ride', { p_ride_id: rideId });
  if (error) throw error;
}

export async function rateRide(rideId: number, stars: number): Promise<void> {
  const { error } = await supabase.rpc('rate_ride', { p_ride_id: rideId, p_stars: stars });
  if (error) throw error;
}

// Corridas já encerradas (concluídas ou canceladas) do usuário, as mais novas primeiro.
export async function fetchHistory(role: 'passenger' | 'driver', userId: string): Promise<Ride[]> {
  const { data, error } = await supabase
    .from('ride_details')
    .select('*')
    .eq(role === 'passenger' ? 'passenger_id' : 'driver_id', userId)
    .in('status', ['completed', 'cancelled'])
    .order('requested_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data as Ride[];
}

// "2026-10-23T20:08:43Z" -> "23/10 17:08" (hora local).
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(d.getDate())}/${two(d.getMonth() + 1)} ${two(d.getHours())}:${two(d.getMinutes())}`;
}


// --- Pagamento adiantado (viagem para outra cidade) ---

export const ADVANCE_OPTIONS = [0, 50, 100] as const;

// "Sem adiantamento" para 0%, senão "50%", "100%".
export function advanceLabel(percent: number): string {
  return percent === 0 ? 'Sem adiantamento' : `${percent}%`;
}

export function isIntercity(ride: Ride): boolean {
  return ride.destination_city_id !== null && ride.destination_city_id !== ride.city_id;
}

// Quanto o passageiro paga adiantado, direto ao motorista.
export function advanceAmount(ride: Ride): number | null {
  // Sem adiantamento (0%) ou ainda não escolhido: não há valor a receber antes.
  if (!ride.advance_percent) return null;
  return Math.round(ride.estimated_price * ride.advance_percent) / 100;
}

export async function setAdvancePercent(rideId: number, percent: number): Promise<void> {
  const { error } = await supabase.rpc('set_advance_percent', { p_ride_id: rideId, p_percent: percent });
  if (error) throw error;
}

export async function confirmAdvanceReceived(rideId: number): Promise<void> {
  const { error } = await supabase.rpc('confirm_advance_received', { p_ride_id: rideId });
  if (error) throw error;
}


// --- Ida e volta ---

export const WAIT_OPTIONS = [30, 60, 120, 180, 240] as const;

export function formatWait(minutes: number): string {
  if (minutes < 60) return `${minutes} minutos`;
  const hours = minutes / 60;
  return hours === 1 ? '1 hora' : `${String(hours).replace('.', ',')} horas`;
}

// "Ida e volta, espera de 2 horas", ou null se a corrida é só de ida.
export function roundTripLabel(ride: { round_trip?: boolean; wait_minutes?: number }): string | null {
  if (!ride.round_trip) return null;
  return ride.wait_minutes ? `Ida e volta, espera de ${formatWait(ride.wait_minutes)}` : 'Ida e volta';
}
