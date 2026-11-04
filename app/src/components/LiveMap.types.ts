import type { Coord } from './PinMap.types';

// Um trecho desenhado no mapa: "pickup" é do motorista até quem ele vai buscar, "trip" é o da corrida.
export type MapRoute = {
  kind: 'pickup' | 'trip';
  points: Coord[];
};

export type LiveMapProps = {
  // Onde o passageiro espera (ou o destino, durante a corrida).
  target: Coord;
  // Onde o motorista está agora; nulo enquanto não chegou nenhuma posição.
  driver: Coord | null;
  vehicle: 'car' | 'moto';
  // Onde o passageiro está andando até o ponto de encontro (só o motorista vê,
  // e só até o embarque).
  passenger?: Coord | null;
  // Destino da corrida, quando o ponto principal (target) ainda é o de embarque.
  destination?: Coord | null;
  // Rotas desenhadas no mapa (só a versão web desenha; o Expo Go ignora).
  routes?: MapRoute[];
  // Altura do mapa em pixels (padrão 260).
  height?: number;
};

// Cores dos trechos: vermelho até o embarque, escuro na corrida.
export const ROUTE_COLORS: Record<MapRoute['kind'], string> = {
  pickup: '#D62828',
  trip: '#1B1B1F',
};

// Muda só quando aparece uma rota ou o destino muda: é a hora de enquadrar o mapa de novo.
export function frameKey(destination: Coord | null | undefined, routes: MapRoute[] | undefined): string {
  const parts = (routes ?? []).filter((r) => r.points.length > 0).map((r) => r.kind);
  return `${destination ? `${destination.lat.toFixed(5)},${destination.lng.toFixed(5)}` : ''}|${parts.join(',')}`;
}
