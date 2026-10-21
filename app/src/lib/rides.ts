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

export type Ride = {
  id: number;
  status: RideStatus;
  vehicle_type: VehicleType;
  payment_method: PaymentMethod;
  origin_address: string;
  destination_address: string;
  estimated_price: number;
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

export async function fetchActiveRide(): Promise<Ride | null> {
  const { data, error } = await supabase
    .from('rides')
    .select('id, status, vehicle_type, payment_method, origin_address, destination_address, estimated_price')
    .in('status', ACTIVE_STATUSES)
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as Ride | null;
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
