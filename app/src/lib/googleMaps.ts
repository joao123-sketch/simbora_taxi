/// <reference types="google.maps" />
import { Platform } from 'react-native';

// A chave é pública (um app web não esconde chave), mas só vale para os
// endereços cadastrados no console do Google e para as APIs de mapa.
const KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY || '';

// Só a versão web (o app publicado) usa o Google Maps; no Expo Go ficam o fundo liso e o Nominatim.
export const googleMapsAvailable = Platform.OS === 'web' && !!KEY;

let loading: Promise<void> | null = null;

// Carrega a biblioteca do Google uma única vez. Quem usa o mapa pede cada parte
// por google.maps.importLibrary('maps' | 'places' | 'geocoding').
export function loadGoogleMaps(): Promise<void> {
  if (!googleMapsAvailable || typeof document === 'undefined') {
    return Promise.reject(new Error('Falta a chave do Google Maps (EXPO_PUBLIC_GOOGLE_MAPS_KEY)'));
  }
  if (typeof google !== 'undefined' && typeof google.maps?.importLibrary === 'function') return Promise.resolve();
  if (!loading) {
    loading = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(KEY)}&v=weekly&loading=async&language=pt-BR&region=BR`;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        loading = null;
        reject(new Error('Não foi possível carregar o Google Maps'));
      };
      document.head.appendChild(script);
    });
  }
  return loading;
}

// Cinza claro: o mapa fica quieto e os marcadores e o painel aparecem.
export const QUIET_MAP_STYLES: google.maps.MapTypeStyle[] = [
  { stylers: [{ saturation: -55 }, { lightness: 4 }] },
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];
