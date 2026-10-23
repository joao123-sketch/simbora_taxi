// No navegador o Leaflet roda direto na página. No celular, LiveMap.tsx usa o
// mesmo Leaflet dentro de um WebView.
import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import type { LiveMapProps } from './LiveMap.types';

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

function icon(emoji: string, label: string) {
  return L.divIcon({
    className: '',
    html: `<div role="img" aria-label="${label}" style="font-size:30px;line-height:30px;text-align:center;filter:drop-shadow(0 1px 2px rgba(0,0,0,.5))">${emoji}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

export function LiveMap({ target, driver, vehicle }: LiveMapProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const targetMarker = useRef<L.Marker | null>(null);
  const driverMarker = useRef<L.Marker | null>(null);
  const fitted = useRef(false);

  useEffect(() => {
    if (!divRef.current) return;
    const map = L.map(divRef.current, { zoomControl: false }).setView([target.lat, target.lng], 16);
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
    targetMarker.current = L.marker([target.lat, target.lng], { icon: icon('📍', 'Ponto de encontro') }).addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      targetMarker.current = null;
      driverMarker.current = null;
      fitted.current = false;
    };
    // O mapa nasce uma vez; as posições entram pelo efeito abaixo.
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    targetMarker.current?.setLatLng([target.lat, target.lng]);

    if (!driver) return;
    if (!driverMarker.current) {
      driverMarker.current = L.marker([driver.lat, driver.lng], {
        icon: icon(vehicle === 'moto' ? '🏍️' : '🚗', 'Motorista'),
        zIndexOffset: 1000,
      }).addTo(map);
    } else {
      driverMarker.current.setLatLng([driver.lat, driver.lng]);
    }

    // Enquadra os dois na primeira vez; depois só o carro anda, sem mexer na tela da pessoa.
    if (!fitted.current) {
      map.fitBounds(
        [
          [target.lat, target.lng],
          [driver.lat, driver.lng],
        ],
        { padding: [40, 40], maxZoom: 17 },
      );
      fitted.current = true;
    }
  }, [target.lat, target.lng, driver?.lat, driver?.lng, vehicle]);

  return (
    <View style={styles.box}>
      <div ref={divRef} style={{ position: 'absolute', inset: 0 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    height: 260,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#E8E8E8',
  },
});
