import { supabase } from './supabase';

// Passageiros que o motorista não quer atender. O passageiro nunca é avisado.
export type BlockedPassenger = {
  passenger_id: string;
  full_name: string | null;
  photo_path: string | null;
  blocked_at: string;
};

// Bloqueia quem fez o pedido (e tira esse pedido da lista do motorista).
export async function blockPassenger(rideId: number): Promise<void> {
  const { error } = await supabase.rpc('block_passenger', { p_ride_id: rideId });
  if (error) throw error;
}

export async function unblockPassenger(passengerId: string): Promise<void> {
  const { error } = await supabase.rpc('unblock_passenger', { p_passenger_id: passengerId });
  if (error) throw error;
}

export async function fetchBlockedPassengers(): Promise<BlockedPassenger[]> {
  const { data, error } = await supabase.rpc('my_blocked_passengers');
  if (error) throw error;
  return (data as BlockedPassenger[]) ?? [];
}
