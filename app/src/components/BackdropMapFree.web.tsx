// Mapa de fundo grátis (OpenStreetMap com Leaflet) para o servidor de teste, onde a chave do Google não vale.
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { emojiDivIcon, loadLeaflet, TILE_URL, type Leaflet } from '../lib/leaflet';
import { colors } from '../theme';
import type { BackdropMapProps, BackdropMarker } from './BackdropMap.types';

// Mesma altura do ponto que o mapa do Google usa (0 = topo, 0,5 = meio da parte que sobra).
const POINT_HEIGHT = 0.4;

function markerIcon(L: Leaflet, kind: BackdropMarker['kind']): Leaflet {
  const dot = (inner: string) => L.divIcon({ className: '', html: inner, iconSize: [26, 26], iconAnchor: [13, 13] });
  switch (kind) {
    case 'me':
      return dot('<div style="width:18px;height:18px;margin:4px;border-radius:50%;background:#2B6CF6;border:3.5px solid #fff;box-sizing:border-box"></div>');
    case 'origin':
      return dot(`<div style="width:18px;height:18px;margin:4px;border-radius:50%;background:${colors.ink};border:4px solid #fff;box-sizing:border-box"></div>`);
    case 'dest':
      return dot(`<div style="width:18px;height:18px;margin:4px;background:${colors.primary};border:4px solid #fff;box-sizing:border-box"></div>`);
    default:
      return emojiDivIcon(L, kind === 'moto' ? '🏍️' : '🚗');
  }
}

export function BackdropMapFree({ center, markers = [], line = false, bottomInset = 0 }: BackdropMapProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet>(null);
  const leafletRef = useRef<Leaflet>(null);
  const overlays = useRef<Leaflet[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !divRef.current) return;
        const map = L.map(divRef.current, { center: [center.lat, center.lng], zoom: 16, zoomControl: false, attributionControl: false });
        L.tileLayer(TILE_URL, { maxZoom: 19 }).addTo(map);
        leafletRef.current = L;
        mapRef.current = map;
        setReady(true);
      })
      .catch(() => {
        // Sem internet: fica o fundo liso.
      });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      overlays.current = [];
    };
    // O mapa nasce uma vez; centro e marcadores entram pelos efeitos abaixo.
  }, []);

  const moving = (m: BackdropMarker) => m.kind === 'car' || m.kind === 'moto' || m.kind === 'me';
  const key = markers.map((m) => `${m.kind}:${m.coord.lat.toFixed(5)},${m.coord.lng.toFixed(5)}`).join('|');
  // Só enquadra de novo quando um ponto parado muda ou um marcador aparece/some.
  const frameKey = markers.map((m) => (moving(m) ? m.kind : `${m.kind}:${m.coord.lat.toFixed(5)},${m.coord.lng.toFixed(5)}`)).join('|');

  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!ready || !map || !L) return;
    overlays.current.forEach((o) => o.remove());
    overlays.current = markers.map((m) =>
      L.marker([m.coord.lat, m.coord.lng], {
        icon: markerIcon(L, m.kind),
        interactive: false,
        zIndexOffset: m.kind === 'car' || m.kind === 'moto' ? 1000 : 0,
      }).addTo(map),
    );
    if (line && markers.length > 1) {
      overlays.current.push(
        L.polyline(
          markers.map((m) => [m.coord.lat, m.coord.lng]),
          { color: colors.ink, weight: 3, dashArray: '6 8', interactive: false },
        ).addTo(map),
      );
    }
  }, [ready, key, line]);

  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!ready || !map || !L) return;
    map.invalidateSize();
    if (markers.length > 1) {
      map.fitBounds(L.latLngBounds(markers.map((m) => [m.coord.lat, m.coord.lng])), {
        paddingTopLeft: [40, 90],
        paddingBottomRight: [40, bottomInset + 30],
        maxZoom: 17,
        animate: false,
      });
    } else {
      map.setView([center.lat, center.lng], map.getZoom(), { animate: false });
      const height = divRef.current?.clientHeight ?? 0;
      if (bottomInset > 0 && height > bottomInset) {
        map.panBy([0, Math.round(height / 2 - (height - bottomInset) * POINT_HEIGHT)], { animate: false });
      }
    }
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
