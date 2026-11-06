// Lê o ponto copiado do Google Maps (botão direito no mapa > clicar nas coordenadas):
// "-3.8545, -40.9210" (vírgula ou ponto e vírgula entre os dois números).
export function parseCoords(text: string): { lat: number; lng: number } | null {
  const match = text.trim().match(/^(-?\d+(?:[.,]\d+)?)\s*[;,]\s*(-?\d+(?:[.,]\d+)?)$/) ?? text.trim().match(/^(-?\d+\.\d+)\s+(-?\d+\.\d+)$/);
  if (!match) return null;
  const lat = Number(match[1].replace(',', '.'));
  const lng = Number(match[2].replace(',', '.'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}
