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
