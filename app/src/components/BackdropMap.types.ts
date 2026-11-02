import type { Coord } from './PinMap.types';

export type BackdropMarker = {
  coord: Coord;
  // me: a pessoa; origin: embarque; dest: destino; car e moto: o motorista.
  kind: 'me' | 'origin' | 'dest' | 'car' | 'moto';
};

export type BackdropMapProps = {
  center: Coord;
  markers?: BackdropMarker[];
  // Liga os marcadores, na ordem, com uma linha tracejada (rota reta, sem serviço de rotas).
  line?: boolean;
  // Espaço que o painel inferior cobre, em pixels, para o mapa enquadrar o que sobra.
  bottomInset?: number;
};
