import { Platform } from 'react-native';

import type { Coord } from '../components/PinMap.types';
import type { City } from './rides';

export type PlaceResult = Coord & {
  id: string;
  title: string;
  subtitle?: string;
};

// Este é o ÚNICO ponto que conhece o serviço de endereços. Hoje é o Nominatim
// (grátis, do OpenStreetMap): 1 consulta por segundo, sem autocompletar, então
// a busca só roda quando a pessoa toca em "Buscar". Antes de publicar, trocar
// pelo Google (Geocoding e Places) mexendo só nesta função.
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_REVERSE = 'https://nominatim.openstreetmap.org/reverse';
// O Nominatim pede que o app se identifique; o navegador já manda o Referer.
const HEADERS: Record<string, string> = Platform.OS === 'web' ? {} : { 'User-Agent': 'SimboraCar/1.0' };
// Um quadrado de ~25 km ao redor da cidade, para achar sítios e distritos.
const BOX = 0.25;

export async function searchPlaces(city: City, rawQuery: string): Promise<PlaceResult[]> {
  const query = rawQuery.trim();
  if (query.length < 2) return [];

  const params = new URLSearchParams({
    q: `${query}, ${city.name}, ${city.state}`,
    format: 'jsonv2',
    limit: '5',
    countrycodes: 'br',
    'accept-language': 'pt-BR',
    viewbox: `${city.lng - BOX},${city.lat + BOX},${city.lng + BOX},${city.lat - BOX}`,
    bounded: '1',
  });
  const response = await fetch(`${NOMINATIM}?${params.toString()}`, { headers: HEADERS });
  if (!response.ok) throw new Error('Busca indisponível');

  const rows = (await response.json()) as { place_id: number; display_name: string; lat: string; lon: string }[];
  return rows.map((r) => {
    const [title, ...rest] = r.display_name.split(', ');
    return {
      id: String(r.place_id),
      title,
      subtitle: rest.slice(0, 2).join(', ') || undefined,
      lat: Number(r.lat),
      lng: Number(r.lon),
    };
  });
}

// Nome da rua (e bairro) do ponto do alfinete, para o motorista saber onde é.
// Se o serviço não responder, devolve null e quem chamou usa um texto padrão.
export async function reverseGeocode(point: Coord): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      lat: String(point.lat),
      lon: String(point.lng),
      format: 'jsonv2',
      zoom: '18',
      'accept-language': 'pt-BR',
    });
    const response = await fetch(`${NOMINATIM_REVERSE}?${params.toString()}`, { headers: HEADERS });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      name?: string;
      address?: { road?: string; house_number?: string; suburb?: string; neighbourhood?: string };
    };
    const a = data.address;
    if (!a?.road) return data.name || null;
    const street = a.house_number ? `${a.road}, ${a.house_number}` : a.road;
    const area = a.suburb ?? a.neighbourhood;
    return area ? `${street} - ${area}` : street;
  } catch {
    return null;
  }
}
