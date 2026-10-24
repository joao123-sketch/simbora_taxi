import type { VehicleType } from './rides';
import { supabase } from './supabase';

// "Meu motorista": cada motorista tem um código curto (link e QR). Quem lê o
// código fica com ele na lista de favoritos, e o favorito chama primeiro nos
// pedidos dessa pessoa. O preço é sempre o do cálculo do app.

export type DriverCard = {
  driver_id: string;
  full_name: string | null;
  vehicle_type: VehicleType;
  vehicle_model: string;
  vehicle_color: string;
};

export type FavoriteDriver = DriverCard & {
  is_online: boolean;
  rides_together: number;
};

export type FrequentDriver = DriverCard & {
  rides_together: number;
  is_favorite: boolean;
};

const LINK_PREFIX = 'simboracar://motorista/';

export function driverLink(code: string): string {
  return `${LINK_PREFIX}${code}`;
}

export function driverShareMessage(code: string): string {
  return `Peça sua corrida comigo pelo Simbora Car! Meu código de motorista: ${code}\n${driverLink(code)}`;
}

// Aceita o código puro, o link ou o texto lido do QR.
export function codeFromText(text: string): string {
  const last = text.trim().split('/').pop() ?? '';
  return last.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

export const vehicleName: Record<VehicleType, string> = { car: 'Carro', moto: 'Moto' };

export function driverDescription(d: DriverCard): string {
  return `${vehicleName[d.vehicle_type]} ${d.vehicle_model}, ${d.vehicle_color.toLowerCase()}`;
}

export async function fetchMyDriverCode(): Promise<string | null> {
  const { data, error } = await supabase.rpc('my_driver_code');
  if (error) throw error;
  return (data as string | null) ?? null;
}

export async function favoriteByCode(code: string): Promise<DriverCard> {
  const { data, error } = await supabase.rpc('favorite_by_code', { p_code: code });
  if (error) throw error;
  return (data as DriverCard[])[0];
}

export async function favoriteDriver(driverId: string): Promise<void> {
  const { error } = await supabase.rpc('favorite_driver', { p_driver_id: driverId });
  if (error) throw error;
}

export async function unfavoriteDriver(driverId: string): Promise<void> {
  const { error } = await supabase.rpc('unfavorite_driver', { p_driver_id: driverId });
  if (error) throw error;
}

export async function fetchFavoriteDrivers(): Promise<FavoriteDriver[]> {
  const { data, error } = await supabase.rpc('my_favorite_drivers');
  if (error) throw error;
  return (data as (FavoriteDriver & { rides_together: number | string })[]).map((d) => ({
    ...d,
    rides_together: Number(d.rides_together),
  }));
}

export async function fetchFrequentDrivers(): Promise<FrequentDriver[]> {
  const { data, error } = await supabase.rpc('my_frequent_drivers');
  if (error) throw error;
  return (data as (FrequentDriver & { rides_together: number | string })[]).map((d) => ({
    ...d,
    rides_together: Number(d.rides_together),
  }));
}
