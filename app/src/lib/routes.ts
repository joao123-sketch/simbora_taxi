import type { Coord } from '../components/PinMap.types';
import { GOOGLE_MAPS_KEY, googleMapsAvailable } from './googleMaps';
import { decodePolyline } from './routeGeometry';

export type Route = {
  points: Coord[];
  km: number;
  minutes: number;
};

// Rota de carro entre dois pontos. No app publicado usa a Routes API do Google (a mesma chave do mapa;
// a API "Routes" precisa estar liberada para ela no console). No servidor de teste e no Expo Go usa o
// servidor público do OSRM, de graça. Devolve null se não conseguir: o mapa segue sem o traço.
export async function fetchRoute(from: Coord, to: Coord): Promise<Route | null> {
  try {
    return googleMapsAvailable ? await googleRoute(from, to) : await osrmRoute(from, to);
  } catch {
    return null;
  }
}

async function googleRoute(from: Coord, to: Coord): Promise<Route | null> {
  const point = (c: Coord) => ({ location: { latLng: { latitude: c.lat, longitude: c.lng } } });
  const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_MAPS_KEY,
      // Pedir só estes campos, sem trânsito, mantém a consulta no preço "Essentials".
      'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline',
    },
    body: JSON.stringify({
      origin: point(from),
      destination: point(to),
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_UNAWARE',
      languageCode: 'pt-BR',
      units: 'METRIC',
    }),
  });
  if (!response.ok) return null;
  const data = (await response.json()) as {
    routes?: { duration?: string; distanceMeters?: number; polyline?: { encodedPolyline?: string } }[];
  };
  const route = data.routes?.[0];
  const encoded = route?.polyline?.encodedPolyline;
  if (!route || !encoded) return null;
  return {
    points: decodePolyline(encoded),
    km: (route.distanceMeters ?? 0) / 1000,
    minutes: Math.max(1, Math.round(parseInt(route.duration ?? '0', 10) / 60)),
  };
}

async function osrmRoute(from: Coord, to: Coord): Promise<Route | null> {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=polyline`;
  const response = await fetch(url);
  if (!response.ok) return null;
  const data = (await response.json()) as { routes?: { geometry: string; distance: number; duration: number }[] };
  const route = data.routes?.[0];
  if (!route) return null;
  return {
    points: decodePolyline(route.geometry),
    km: route.distance / 1000,
    minutes: Math.max(1, Math.round(route.duration / 60)),
  };
}
