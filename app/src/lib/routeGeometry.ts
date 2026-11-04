import type { Coord } from '../components/PinMap.types';
import { distanceKm } from './geo';

// Lê o texto de rota do Google e do OSRM (polyline com 5 casas) e devolve os pontos do trajeto.
export function decodePolyline(encoded: string): Coord[] {
  const points: Coord[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  const next = (): number => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };

  while (index < encoded.length) {
    lat += next();
    lng += next();
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

// Cada rota nova custa uma consulta ao Google: só refaz a do motorista se já passou 1 minuto
// e ele andou mais de 500 m desde a última.
const REFETCH_AFTER_MS = 60_000;
const REFETCH_AFTER_KM = 0.5;

export function shouldRefetchRoute(last: { from: Coord; at: number } | null, from: Coord, now: number): boolean {
  if (!last) return true;
  return now - last.at >= REFETCH_AFTER_MS && distanceKm(last.from, from) >= REFETCH_AFTER_KM;
}
