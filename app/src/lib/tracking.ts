import type { Coord } from '../components/PinMap.types';
import { supabase } from './supabase';

export type DriverPosition = Coord & {
  heading: number | null;
  updated_at: string;
};

// A posição do motorista da corrida em andamento (o banco só mostra essa ao passageiro).
export async function fetchDriverPosition(driverId: string): Promise<DriverPosition | null> {
  const { data, error } = await supabase
    .from('driver_positions')
    .select('lat, lng, heading, updated_at')
    .eq('driver_id', driverId)
    .maybeSingle();
  if (error) throw error;
  return data as DriverPosition | null;
}

// Avisa quando o motorista manda uma posição nova.
export function subscribeToDriverPosition(driverId: string, onChange: () => void) {
  const channel = supabase
    .channel(`position-${driverId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'driver_locations', filter: `driver_id=eq.${driverId}` },
      onChange,
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

export type PassengerPosition = Coord & {
  updated_at: string;
};

// O passageiro manda a própria posição enquanto espera o motorista. O banco
// só guarda se a corrida estiver aceita ou com o motorista no local.
export async function sendPassengerLocation(lat: number, lng: number): Promise<void> {
  const { error } = await supabase.rpc('update_passenger_location', { p_lng: lng, p_lat: lat });
  if (error) throw error;
}

// O motorista da corrida vê onde o passageiro está (nulo se ele não compartilha).
export async function fetchPassengerPosition(rideId: number): Promise<PassengerPosition | null> {
  const { data, error } = await supabase.rpc('get_passenger_position', { p_ride_id: rideId });
  if (error) throw error;
  const rows = data as PassengerPosition[] | null;
  return rows && rows.length > 0 ? rows[0] : null;
}
