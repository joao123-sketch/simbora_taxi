import type { Coord } from '../components/PinMap.types';

// Distância em linha reta (haversine), em km.
export function distanceKm(a: Coord, b: Coord): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

export function formatKm(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1).replace('.', ',')} km`;
}

// Abre a rota no Google Maps (no Android, abre o app; senão, o navegador).
export function directionsUrl(to: Coord): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${to.lat},${to.lng}&travelmode=driving`;
}

// Minutos até chegar, com a mesma conta do preço: rota é a linha reta x 1,3 e a
// velocidade média é de 30 km/h.
export function etaMinutes(straightKm: number): number {
  return Math.max(1, Math.round(((straightKm * 1.3) / 30) * 60));
}

// Metade do lado, em graus, do quadrado de busca de endereços ao redor do centro da cidade:
// o raio de atendimento mais uma folga de 30% (lugar na borda), com piso de 0,03 grau (~3 km)
// e teto de 0,1 grau (~11 km). O teto existe porque o raio pode ser largo só para dar folga ao
// GPS, e um quadrado maior que isso traz as cidades vizinhas na frente dos lugares da própria cidade.
// Vem do raio de cada cidade: abrir uma cidade nova não pede configurar a busca.
export function searchBoxDegrees(city: { radius_km: number }, factor = 1.3): number {
  return Math.min(0.1, Math.max(0.03, (city.radius_km * factor) / 111));
}
