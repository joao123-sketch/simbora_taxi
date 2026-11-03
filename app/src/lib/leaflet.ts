// Mapa de graça (OpenStreetMap com Leaflet) para o servidor de teste, onde a chave do Google não vale.
// Mesma versão e mesmos tiles que o mapa do Expo Go usa em LiveMap.tsx.
export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

// O Leaflet não vem com tipos aqui: só o pedaço que os mapas usam.
/* eslint-disable @typescript-eslint/no-explicit-any */
export type Leaflet = any;

let loading: Promise<Leaflet> | null = null;

export function loadLeaflet(): Promise<Leaflet> {
  if (typeof document === 'undefined') return Promise.reject(new Error('Sem navegador'));
  const existing = (window as unknown as { L?: Leaflet }).L;
  if (existing) return Promise.resolve(existing);
  if (!loading) {
    loading = new Promise<Leaflet>((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(css);
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.async = true;
      script.onload = () => resolve((window as unknown as { L: Leaflet }).L);
      script.onerror = () => {
        loading = null;
        reject(new Error('Não foi possível carregar o Leaflet'));
      };
      document.head.appendChild(script);
    });
  }
  return loading;
}

export function emojiDivIcon(L: Leaflet, emoji: string): Leaflet {
  return L.divIcon({
    className: '',
    html: `<div style="font-size:28px;line-height:40px;text-align:center;width:40px;height:40px">${emoji}</div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}
