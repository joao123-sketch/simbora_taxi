import { Platform } from 'react-native';

import type { Coord } from '../components/PinMap.types';
import { googleMapsAvailable, loadGoogleMaps } from './googleMaps';
import type { City } from './rides';

export type PlaceResult = Coord & {
  id: string;
  title: string;
  subtitle?: string;
};

// Este é o ÚNICO ponto que conhece o serviço de endereços. No app publicado (web)
// é o Google (Places New com autocompletar e Geocoding). No Expo Go, sem a chave,
// cai no Nominatim (grátis, do OpenStreetMap), que só serve para desenvolver.
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_REVERSE = 'https://nominatim.openstreetmap.org/reverse';
// O Nominatim pede que o app se identifique; o navegador já manda o Referer.
const HEADERS: Record<string, string> = Platform.OS === 'web' ? {} : { 'User-Agent': 'SimboraCar/1.0' };
// Um quadrado de ~25 km ao redor da cidade, para achar sítios e distritos.
const BOX = 0.25;

async function nominatimSearch(city: City, rawQuery: string): Promise<PlaceResult[]> {
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

async function nominatimReverse(point: Coord): Promise<string | null> {
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
}

// ---------------------------------------------------------------------------
// Busca com sugestões enquanto a pessoa digita
// ---------------------------------------------------------------------------

// Uma sugestão da lista. No Google ela ainda não tem coordenadas (resolveSuggestion
// busca ao escolher); no Nominatim já vem pronta.
export type PlaceSuggestion = {
  id: string;
  title: string;
  subtitle?: string;
  result?: PlaceResult;
  prediction?: google.maps.places.PlacePrediction;
};

// Uma "sessão" vai da primeira letra até a escolha de uma sugestão e é cobrada
// como uma busca só. Crie uma nova a cada vez que a pessoa escolher um lugar.
export type SearchSession = google.maps.places.AutocompleteSessionToken | null;

export async function newSearchSession(): Promise<SearchSession> {
  if (!googleMapsAvailable) return null;
  await loadGoogleMaps();
  const { AutocompleteSessionToken } = (await google.maps.importLibrary('places')) as google.maps.PlacesLibrary;
  return new AutocompleteSessionToken();
}

export async function suggestPlaces(city: City, input: string, session: SearchSession): Promise<PlaceSuggestion[]> {
  const text = input.trim();
  if (text.length < 2) return [];

  if (!googleMapsAvailable) {
    const rows = await nominatimSearch(city, text);
    return rows.map((r) => ({ id: r.id, title: r.title, subtitle: r.subtitle, result: r }));
  }

  await loadGoogleMaps();
  const { AutocompleteSuggestion } = (await google.maps.importLibrary('places')) as google.maps.PlacesLibrary;
  const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
    input: text,
    sessionToken: session ?? undefined,
    language: 'pt-BR',
    region: 'br',
    includedRegionCodes: ['br'],
    locationRestriction: {
      west: city.lng - BOX,
      east: city.lng + BOX,
      south: city.lat - BOX,
      north: city.lat + BOX,
    },
  });
  return suggestions
    .map((s) => s.placePrediction)
    .filter((p): p is google.maps.places.PlacePrediction => !!p)
    .map((p) => ({
      id: p.placeId,
      title: p.mainText?.text ?? p.text.text,
      subtitle: p.secondaryText?.text,
      prediction: p,
    }));
}

// Pega as coordenadas do lugar escolhido (uma consulta de detalhes, só o essencial).
export async function resolveSuggestion(suggestion: PlaceSuggestion): Promise<PlaceResult> {
  if (suggestion.result) return suggestion.result;
  if (!suggestion.prediction) throw new Error('Sugestão inválida');
  const place = suggestion.prediction.toPlace();
  await place.fetchFields({ fields: ['location'] });
  if (!place.location) throw new Error('Lugar sem localização');
  return {
    id: suggestion.id,
    title: suggestion.title,
    subtitle: suggestion.subtitle,
    lat: place.location.lat(),
    lng: place.location.lng(),
  };
}

async function googleReverse(point: Coord): Promise<string | null> {
  await loadGoogleMaps();
  const { Geocoder } = (await google.maps.importLibrary('geocoding')) as google.maps.GeocodingLibrary;
  const { results } = await new Geocoder().geocode({ location: point, language: 'pt-BR', region: 'br' });
  const best = results[0];
  if (!best) return null;
  const part = (type: string) => best.address_components.find((c) => c.types.includes(type))?.long_name;
  const road = part('route');
  if (!road) return best.formatted_address.split(',')[0] || null;
  const number = part('street_number');
  const street = number ? `${road}, ${number}` : road;
  const area = part('sublocality_level_1') ?? part('sublocality') ?? part('neighborhood');
  return area ? `${street} - ${area}` : street;
}

// Nome da rua (e bairro) do ponto, para o motorista saber onde é. Se o serviço
// não responder, devolve null e quem chamou usa um texto padrão.
export async function reverseGeocode(point: Coord): Promise<string | null> {
  try {
    return googleMapsAvailable ? await googleReverse(point) : await nominatimReverse(point);
  } catch {
    return null;
  }
}
