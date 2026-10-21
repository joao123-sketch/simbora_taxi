// No navegador o Leaflet roda direto na página. No celular, PinMap.tsx usa o
// mesmo Leaflet dentro de um WebView.
import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { CenterPin } from './CenterPin';
import type { PinMapProps } from './PinMap.types';

const ZOOM = 16;

export function PinMap({ center, onCenterChange }: PinMapProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const onChangeRef = useRef(onCenterChange);
  onChangeRef.current = onCenterChange;

  useEffect(() => {
    if (!divRef.current) return;
    const map = L.map(divRef.current).setView([center.lat, center.lng], ZOOM);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);
    map.on('moveend', () => {
      const c = map.getCenter();
      onChangeRef.current({ lat: c.lat, lng: c.lng });
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // O mapa é criado uma vez; mudanças de centro entram pelo efeito abaixo.
  }, []);

  useEffect(() => {
    mapRef.current?.setView([center.lat, center.lng], mapRef.current.getZoom());
  }, [center.lat, center.lng]);

  return (
    <View style={styles.container}>
      <div ref={divRef} style={{ position: 'absolute', inset: 0 }} />
      <CenterPin />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
