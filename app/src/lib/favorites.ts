import type { Coord } from '../components/PinMap.types';
import { distanceKm } from './geo';
import { supabase } from './supabase';

// Lugares "de sempre" do passageiro, calculados pelas viagens concluídas: o
// lugar para onde ele já foi 3 vezes (ou mais) vira favorito e aparece como
// sugestão na tela de destino. Só vale dentro da cidade, e só o histórico da
// própria pessoa (o banco já esconde o das outras).

export type SuggestedPlace = Coord & {
  // O nome que a pessoa mais usou para esse lugar.
  title: string;
  trips: number;
};

// Quantas viagens até o mesmo lugar para ele virar favorito.
export const FAVORITE_MIN_TRIPS = 3;
// Destinos a menos disso um do outro contam como o mesmo lugar.
const SAME_PLACE_KM = 0.1;
const MAX_SUGGESTIONS = 5;
// Texto padrão de quando ninguém escreveu o nome do lugar: não serve de título.
const GENERIC_TITLES = new Set(['Destino marcado no mapa', 'Local marcado no mapa']);

type PastDestination = Coord & { address: string };

// Agrupa destinos próximos e devolve os que se repetem, do mais frequente ao
// menos. `destinations` vem do mais novo para o mais antigo.
export function suggestPlaces(
  destinations: PastDestination[],
  minTrips: number = FAVORITE_MIN_TRIPS,
): SuggestedPlace[] {
  const clusters: { center: Coord; names: Map<string, number>; trips: number; newest: number }[] = [];

  destinations.forEach((destination, index) => {
    let cluster = clusters.find((c) => distanceKm(c.center, destination) <= SAME_PLACE_KM);
    if (!cluster) {
      cluster = { center: { lat: destination.lat, lng: destination.lng }, names: new Map(), trips: 0, newest: index };
      clusters.push(cluster);
    }
    cluster.trips += 1;
    const name = destination.address.trim();
    if (name && !GENERIC_TITLES.has(name)) {
      cluster.names.set(name, (cluster.names.get(name) ?? 0) + 1);
    }
  });

  return clusters
    .filter((c) => c.trips >= minTrips && c.names.size > 0)
    .sort((a, b) => b.trips - a.trips || a.newest - b.newest)
    .slice(0, MAX_SUGGESTIONS)
    .map((c) => {
      const [title] = [...c.names.entries()].sort((a, b) => b[1] - a[1])[0];
      return { ...c.center, title, trips: c.trips };
    });
}

// Os destinos das últimas viagens concluídas do passageiro dentro da cidade.
export async function fetchSuggestedPlaces(userId: string): Promise<SuggestedPlace[]> {
  const { data, error } = await supabase
    .from('ride_details')
    .select('destination_address, destination_lat, destination_lng')
    .eq('passenger_id', userId)
    .eq('status', 'completed')
    .is('destination_city_id', null)
    .order('requested_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  const rows = data as { destination_address: string; destination_lat: number; destination_lng: number }[];
  return suggestPlaces(
    rows.map((r) => ({ address: r.destination_address, lat: r.destination_lat, lng: r.destination_lng })),
  );
}
