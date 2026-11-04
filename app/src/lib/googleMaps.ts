/// <reference types="google.maps" />
import { Platform } from 'react-native';

// A chave é pública (um app web não esconde chave), mas só vale para os
// endereços cadastrados no console do Google e para as APIs de mapa.
export const GOOGLE_MAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY || '';
const KEY = GOOGLE_MAPS_KEY;

// No servidor de teste (localhost) a chave do Google não vale, porque o console só libera os endereços
// publicados: lá o mapa e a busca de endereço usam o OpenStreetMap (Leaflet e Nominatim), de graça.
export const isLocalDev =
  Platform.OS === 'web' && typeof location !== 'undefined' && ['localhost', '127.0.0.1'].includes(location.hostname);

// Só a versão web (o app publicado) usa o Google Maps; no Expo Go ficam o fundo liso e o Nominatim.
export const googleMapsAvailable = Platform.OS === 'web' && !!KEY && !isLocalDev;

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
      // Com loading=async o evento onload dispara antes de importLibrary existir;
      // o callback só chama quando a API está pronta.
      (window as unknown as { __simboraMapsReady?: () => void }).__simboraMapsReady = () => resolve();
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(KEY)}&v=weekly&loading=async&language=pt-BR&region=BR&callback=__simboraMapsReady`;
      script.async = true;
      script.onerror = () => {
        loading = null;
        reject(new Error('Não foi possível carregar o Google Maps'));
      };
      document.head.appendChild(script);
    });
  }
  return loading;
}
