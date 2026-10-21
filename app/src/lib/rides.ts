import type { Coord } from '../components/PinMap.types';
import { supabase } from './supabase';

export type VehicleType = 'car' | 'moto';
export type PaymentMethod = 'cash' | 'pix';
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
};

export type Quote = {
  vehicle_type: VehicleType;
  price: number;
  distance_km: number;
};

// Linha da view ride_details: nomes e telefones só vêm preenchidos
// quando o RLS permite (ex.: o motorista vê o passageiro depois de aceitar).
export type Ride = {
  id: number;
  status: RideStatus;
  vehicle_type: VehicleType;
  payment_method: PaymentMethod;
  passenger_id: string;
  driver_id: string | null;
  origin_address: string;
  origin_lat: number;
  origin_lng: number;
  destination_address: string;
  destination_lat: number;
  destination_lng: number;
  distance_km: number;
  estimated_price: number;
  passenger_name: string | null;
  passenger_phone: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  vehicle_model: string | null;
  vehicle_color: string | null;
  vehicle_plate: string | null;
};

export const ACTIVE_STATUSES: RideStatus[] = ['requested', 'accepted', 'arrived', 'in_progress'];

export const vehicleLabel: Record<VehicleType, string> = { car: 'Carro', moto: 'Moto' };
export const paymentLabel: Record<PaymentMethod, string> = { cash: 'Dinheiro', pix: 'Pix' };

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
  const { data, error } = await supabase
    .from('ride_details')
    .select('*')
    .eq('status', 'requested')
    .order('requested_at');
  if (error) throw error;
  return data as Ride[];
}

export async function acceptRide(rideId: number): Promise<void> {
  const { error } = await supabase.rpc('accept_ride', { p_ride_id: rideId });
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

export function formatPhoneNumber(phone: string | null): string {
  if (!phone) return '';
  const local = phone.replace(/^\+?55/, '');
  return local.length === 11 ? `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}` : phone;
}

export async function quoteRide(cityId: number, origin: Place, destination: Place): Promise<Quote[]> {
  const { data, error } = await supabase.rpc('quote_ride', {
    p_city_id: cityId,
    p_origin_lng: origin.lng,
    p_origin_lat: origin.lat,
    p_destination_lng: destination.lng,
    p_destination_lat: destination.lat,
    p_destination_city_id: destination.cityId ?? null,
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
}): Promise<number> {
  const { cityId, vehicleType, paymentMethod, origin, destination } = params;
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
    p_destination_city_id: destination.cityId ?? null,
  });
  if (error) throw error;
  return data as number;
}

export async function cancelRide(rideId: number): Promise<void> {
  const { error } = await supabase.rpc('cancel_ride', { p_ride_id: rideId });
  if (error) throw error;
}
