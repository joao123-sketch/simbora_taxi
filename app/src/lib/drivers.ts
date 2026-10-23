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

// Tudo o que o cadastro envia de uma vez. CPF, nascimento e CNH ficam em
// tabelas privadas no banco: o passageiro nunca lê esses dados.
export type DriverRegistration = {
  cityId: number;
  vehicleType: VehicleType;
  model: string;
  color: string;
  plate: string;
  year: number;
  pixKey: string | null;
  cpf: string;
  birthDate: string; // AAAA-MM-DD
  cnhCategory: 'B' | 'A' | 'ACC';
  cnhEar: boolean;
  declaredHelmets: boolean;
  declaredLegGuard: boolean;
  declaredLineCutter: boolean;
  termsVersion: string;
};

export const MIN_VEHICLE_YEAR = 2010;

export async function fetchMyDriver(userId: string): Promise<Driver | null> {
  const { data, error } = await supabase.from('drivers').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data as Driver | null;
}

export async function registerDriver(input: DriverRegistration): Promise<void> {
  const { error } = await supabase.rpc('register_driver', {
    p_city_id: input.cityId,
    p_vehicle_type: input.vehicleType,
    p_vehicle_model: input.model,
    p_vehicle_color: input.color,
    p_vehicle_plate: input.plate,
    p_vehicle_year: input.year,
    p_pix_key: input.pixKey,
    p_cpf: input.cpf,
    p_birth_date: input.birthDate,
    p_cnh_category: input.cnhCategory,
    p_cnh_ear: input.cnhEar,
    p_declared_helmets: input.declaredHelmets,
    p_declared_leg_guard: input.declaredLegGuard,
    p_declared_line_cutter: input.declaredLineCutter,
    p_terms_version: input.termsVersion,
  });
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
