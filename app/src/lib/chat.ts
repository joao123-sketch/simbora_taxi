import { supabase } from './supabase';

export type Message = {
  id: number;
  ride_id: number;
  sender_id: string;
  body: string;
  created_at: string;
};

export async function fetchMessages(rideId: number): Promise<Message[]> {
  const { data, error } = await supabase
    .from('ride_messages')
    .select('id, ride_id, sender_id, body, created_at')
    .eq('ride_id', rideId)
    .order('id');
  if (error) throw error;
  return data as Message[];
}

// Só funciona durante a corrida (aceita, motorista chegou ou em andamento).
export async function sendMessage(rideId: number, body: string): Promise<void> {
  const { error } = await supabase.rpc('send_message', { p_ride_id: rideId, p_body: body });
  if (error) throw error;
}

export function subscribeToMessages(rideId: number, onInsert: (message: Message) => void) {
  const channel = supabase
    .channel(`chat-${rideId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'ride_messages', filter: `ride_id=eq.${rideId}` },
      (payload) => onInsert(payload.new as Message),
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
