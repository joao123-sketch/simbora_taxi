import type { Coord } from './PinMap.types';

export type LiveMapProps = {
  // Onde o passageiro espera (ou o destino, durante a corrida).
  target: Coord;
  // Onde o motorista está agora; nulo enquanto não chegou nenhuma posição.
  driver: Coord | null;
  vehicle: 'car' | 'moto';
};
