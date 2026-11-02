// Mapa de fundo das telas com painel inferior. No navegador usa o Google Maps;
// BackdropMap.tsx é só um fundo liso para o Expo Go.
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { loadGoogleMaps } from '../lib/googleMaps';
import { colors } from '../theme';
import type { BackdropMapProps, BackdropMarker } from './BackdropMap.types';

function svgIcon(svg: string, size: number): google.maps.Icon {
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(size, size),
    anchor: new google.maps.Point(size / 2, size / 2),
  };
}

function markerIcon(kind: BackdropMarker['kind']): google.maps.Icon {
  const shape = (inner: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26">${inner}</svg>`;
  switch (kind) {
    case 'me':
      return svgIcon(shape('<circle cx="13" cy="13" r="9" fill="#2B6CF6" stroke="#fff" stroke-width="3.5"/>'), 26);
    case 'origin':
      return svgIcon(shape(`<circle cx="13" cy="13" r="9" fill="${colors.ink}" stroke="#fff" stroke-width="4"/>`), 26);
    case 'dest':
      return svgIcon(shape(`<rect x="4" y="4" width="18" height="18" fill="${colors.primary}" stroke="#fff" stroke-width="4"/>`), 26);
    default: {
      const emoji = kind === 'moto' ? '🏍️' : '🚗';
      return svgIcon(
        `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><text x="20" y="29" font-size="28" text-anchor="middle">${emoji}</text></svg>`,
        40,
      );
    }
  }
}

export function BackdropMap({ center, markers = [], line = false, bottomInset = 0 }: BackdropMapProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const overlays = useRef<(google.maps.Marker | google.maps.Polyline)[]>([]);
  const framed = useRef(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then(() => google.maps.importLibrary('maps'))
      .then(() => {
        if (cancelled || !divRef.current) return;
        mapRef.current = new google.maps.Map(divRef.current, {
          center,
          zoom: 16,
          disableDefaultUI: true,
          clickableIcons: false,
          gestureHandling: 'greedy',
        });
        setReady(true);
      })
      .catch(() => {
        // Sem chave ou sem internet: fica o fundo liso.
      });
    return () => {
      cancelled = true;
      overlays.current.forEach((o) => o.setMap(null));
      overlays.current = [];
      mapRef.current = null;
      framed.current = false;
    };
    // O mapa nasce uma vez; centro e marcadores entram pelos efeitos abaixo.
  }, []);

  const moving = (m: BackdropMarker) => m.kind === 'car' || m.kind === 'moto' || m.kind === 'me';
  const key = markers.map((m) => `${m.kind}:${m.coord.lat.toFixed(5)},${m.coord.lng.toFixed(5)}`).join('|');
  // Só enquadra de novo quando um ponto parado muda ou um marcador aparece/some;
  // o carro andando só desliza, sem mexer na tela da pessoa.
  const frameKey = markers.map((m) => (moving(m) ? m.kind : `${m.kind}:${m.coord.lat.toFixed(5)},${m.coord.lng.toFixed(5)}`)).join('|');

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    overlays.current.forEach((o) => o.setMap(null));
    overlays.current = markers.map(
      (m) =>
        new google.maps.Marker({
          map,
          position: m.coord,
          icon: markerIcon(m.kind),
          zIndex: m.kind === 'car' || m.kind === 'moto' ? 1000 : 1,
          clickable: false,
        }),
    );
    if (line && markers.length > 1) {
      overlays.current.push(
        new google.maps.Polyline({
          map,
          path: markers.map((m) => m.coord),
          strokeOpacity: 0,
          clickable: false,
          icons: [
            {
              icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, strokeColor: colors.ink, scale: 3 },
              offset: '0',
              repeat: '12px',
            },
          ],
        }),
      );
    }
  }, [ready, key, line]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    if (markers.length > 1) {
      const bounds = new google.maps.LatLngBounds();
      markers.forEach((m) => bounds.extend(m.coord));
      map.fitBounds(bounds, { top: 90, left: 40, right: 40, bottom: bottomInset + 30 });
      google.maps.event.addListenerOnce(map, 'idle', () => {
        if ((map.getZoom() ?? 0) > 17) map.setZoom(17);
      });
    } else {
      // O ponto fica no meio da parte do mapa que sobra acima do painel.
      map.setCenter(center);
      if (bottomInset > 0) map.panBy(0, Math.round(bottomInset / 2));
    }
    framed.current = true;
  }, [ready, frameKey, center.lat, center.lng, bottomInset]);

  return (
    <View style={styles.box}>
      <div ref={divRef} style={{ position: 'absolute', inset: 0 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#E8E6E4',
  },
});
