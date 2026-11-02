// Mapa de fundo das telas com painel inferior. No navegador o Leaflet roda
// direto na página; BackdropMap.tsx é só um fundo liso para o Expo Go.
import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors } from '../theme';
import type { BackdropMapProps, BackdropMarker } from './BackdropMap.types';

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

function markerIcon(kind: BackdropMarker['kind']) {
  const shadow = 'box-shadow:0 2px 6px rgba(0,0,0,.35)';
  const html: Record<BackdropMarker['kind'], string> = {
    me: `<div role="img" aria-label="Você" style="width:18px;height:18px;border-radius:50%;background:#2B6CF6;border:3px solid #fff;${shadow}"></div>`,
    origin: `<div role="img" aria-label="Embarque" style="width:18px;height:18px;border-radius:50%;background:${colors.ink};border:4px solid #fff;${shadow}"></div>`,
    dest: `<div role="img" aria-label="Destino" style="width:18px;height:18px;background:${colors.primary};border:4px solid #fff;${shadow}"></div>`,
    car: `<div role="img" aria-label="Motorista" style="font-size:30px;line-height:30px;text-align:center;filter:drop-shadow(0 1px 2px rgba(0,0,0,.5))">🚗</div>`,
    moto: `<div role="img" aria-label="Motorista" style="font-size:30px;line-height:30px;text-align:center;filter:drop-shadow(0 1px 2px rgba(0,0,0,.5))">🏍️</div>`,
  };
  const big = kind === 'car' || kind === 'moto';
  return L.divIcon({
    className: '',
    html: html[kind],
    iconSize: big ? [34, 34] : [18, 18],
    iconAnchor: big ? [17, 17] : [9, 9],
  });
}

export function BackdropMap({ center, markers = [], line = false, bottomInset = 0 }: BackdropMapProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const framed = useRef(false);

  useEffect(() => {
    if (!divRef.current) return;
    const map = L.map(divRef.current, { zoomControl: false, attributionControl: false }).setView(
      [center.lat, center.lng],
      15,
    );
    L.tileLayer(TILE_URL, { maxZoom: 19 }).addTo(map);
    L.control.attribution({ position: 'topright', prefix: false }).addAttribution('&copy; OpenStreetMap').addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      framed.current = false;
    };
    // O mapa nasce uma vez; centro e marcadores entram pelo efeito abaixo.
  }, []);

  const moving = (m: BackdropMarker) => m.kind === 'car' || m.kind === 'moto' || m.kind === 'me';
  const key = markers.map((m) => `${m.kind}:${m.coord.lat.toFixed(5)},${m.coord.lng.toFixed(5)}`).join('|');
  // Só enquadra de novo quando um ponto parado muda ou um marcador aparece/some;
  // o carro andando só desliza, sem mexer na tela da pessoa.
  const frameKey = markers.map((m) => (moving(m) ? m.kind : `${m.kind}:${m.coord.lat.toFixed(5)},${m.coord.lng.toFixed(5)}`)).join('|');

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    markers.forEach((m) =>
      L.marker([m.coord.lat, m.coord.lng], { icon: markerIcon(m.kind), zIndexOffset: m.kind === 'car' || m.kind === 'moto' ? 1000 : 0 }).addTo(layer),
    );
    if (line && markers.length > 1) {
      L.polyline(
        markers.map((m) => [m.coord.lat, m.coord.lng] as [number, number]),
        { color: colors.ink, weight: 4, dashArray: '2 8', lineCap: 'round' },
      ).addTo(layer);
    }
  }, [key, line]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (markers.length > 1) {
      map.fitBounds(
        markers.map((m) => [m.coord.lat, m.coord.lng] as [number, number]),
        { paddingTopLeft: [40, 90], paddingBottomRight: [40, bottomInset + 30], maxZoom: 17, animate: framed.current },
      );
    } else {
      map.setView([center.lat, center.lng], map.getZoom(), { animate: framed.current });
    }
    framed.current = true;
  }, [frameKey, center.lat, center.lng, bottomInset]);

  return (
    <View style={styles.box}>
      {/* Tons de cinza deixam o mapa quieto, para o painel e os marcadores aparecerem. */}
      <div ref={divRef} style={{ position: 'absolute', inset: 0, filter: 'grayscale(0.55) contrast(0.95) brightness(1.04)' }} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#E8E6E4',
  },
});
