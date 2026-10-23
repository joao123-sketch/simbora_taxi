import type { PaymentMethod, VehicleType } from './rides';
import { supabase } from './supabase';

export type DriverStatus = 'pending' | 'approved' | 'suspended' | 'blocked';

export type Driver = {
  id: string;
  city_id: number;
  status: DriverStatus;
  vehicle_type: VehicleType;
  vehicle_model: string;
  vehicle_color: string;
  vehicle_plate: string;
  vehicle_year: number;
  pix_key: string | null;
  is_online: boolean;
  accepted_payments: PaymentMethod[];
};

export type DriverSignup = Pick<
  Driver,
  'city_id' | 'vehicle_type' | 'vehicle_model' | 'vehicle_color' | 'vehicle_plate' | 'vehicle_year' | 'pix_key'
>;

export const MIN_VEHICLE_YEAR = 2010;

export async function fetchMyDriver(userId: string): Promise<Driver | null> {
  const { data, error } = await supabase.from('drivers').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data as Driver | null;
}

export async function registerDriver(userId: string, signup: DriverSignup): Promise<void> {
  const { error } = await supabase.from('drivers').insert({ id: userId, ...signup });
  if (error) throw error;
}

export async function setOnline(online: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_driver_online', { p_online: online });
  if (error) throw error;
}

export async function sendLocation(lat: number, lng: number, heading: number | null): Promise<void> {
  const { error } = await supabase.rpc('update_driver_location', {
    p_lng: lng,
    p_lat: lat,
    p_heading: heading,
  });
  if (error) throw error;
}

// "abc1d23" -> "ABC1D23" (aceita placa antiga e Mercosul).
export function normalizePlate(plate: string): string {
  return plate.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
}

export function isValidPlate(plate: string): boolean {
  return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(normalizePlate(plate));
}

// Marca como o motorista recebe (Pix, dinheiro, maquininha); precisa de ao menos uma.
export async function setAcceptedPayments(methods: PaymentMethod[]): Promise<void> {
  const { error } = await supabase.rpc('set_accepted_payments', { p_methods: methods });
  if (error) throw error;
}
