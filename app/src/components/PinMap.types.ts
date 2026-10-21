export type Coord = {
  lat: number;
  lng: number;
};

export type PinMapProps = {
  // Mudar este valor move o mapa (ex.: quando o GPS responde).
  center: Coord;
  onCenterChange: (coord: Coord) => void;
};
