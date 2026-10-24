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

// Um marcador que desliza até a posição nova em vez de dar um pulo. A
// animação dura mais ou menos o tempo entre duas atualizações, para o carro
// ficar sempre em movimento.
type Glider = { marker: L.Marker; frame: number | null; lastAt: number };

function glideTo(glider: Glider, lat: number, lng: number) {
  const now = performance.now();
  const duration = Math.min(9000, Math.max(1500, now - glider.lastAt));
  glider.lastAt = now;
  if (glider.frame !== null) cancelAnimationFrame(glider.frame);
  const from = glider.marker.getLatLng();
  const step = (t: number) => {
    const k = Math.min(1, (t - now) / duration);
    glider.marker.setLatLng([from.lat + (lat - from.lat) * k, from.lng + (lng - from.lng) * k]);
    glider.frame = k < 1 ? requestAnimationFrame(step) : null;
  };
  glider.frame = requestAnimationFrame(step);
}

export function LiveMap({ target, driver, vehicle, passenger }: LiveMapProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const targetMarker = useRef<L.Marker | null>(null);
  const driverGlider = useRef<Glider | null>(null);
  const passengerGlider = useRef<Glider | null>(null);
  const fitted = useRef(false);

  useEffect(() => {
    if (!divRef.current) return;
    const map = L.map(divRef.current, { zoomControl: false }).setView([target.lat, target.lng], 16);
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
    targetMarker.current = L.marker([target.lat, target.lng], { icon: icon('📍', 'Ponto de encontro') }).addTo(map);
    mapRef.current = map;
    return () => {
      [driverGlider.current, passengerGlider.current].forEach((g) => {
        if (g?.frame != null) cancelAnimationFrame(g.frame);
      });
      map.remove();
      mapRef.current = null;
      targetMarker.current = null;
      driverGlider.current = null;
      passengerGlider.current = null;
      fitted.current = false;
    };
    // O mapa nasce uma vez; as posições entram pelos efeitos abaixo.
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    targetMarker.current?.setLatLng([target.lat, target.lng]);

    if (driver) {
      if (!driverGlider.current) {
        const marker = L.marker([driver.lat, driver.lng], {
          icon: icon(vehicle === 'moto' ? '🏍️' : '🚗', 'Motorista'),
          zIndexOffset: 1000,
        }).addTo(map);
        driverGlider.current = { marker, frame: null, lastAt: performance.now() };
      } else {
        glideTo(driverGlider.current, driver.lat, driver.lng);
      }
    }

    if (passenger) {
      if (!passengerGlider.current) {
        const marker = L.marker([passenger.lat, passenger.lng], {
          icon: icon('🧍', 'Passageiro'),
          zIndexOffset: 900,
        }).addTo(map);
        passengerGlider.current = { marker, frame: null, lastAt: performance.now() };
      } else {
        glideTo(passengerGlider.current, passenger.lat, passenger.lng);
      }
    } else if (passengerGlider.current) {
      // O passageiro deixou de compartilhar (ex.: já embarcou).
      passengerGlider.current.marker.remove();
      passengerGlider.current = null;
    }

    // Enquadra todos na primeira vez; depois só os marcadores andam, sem mexer na tela da pessoa.
    if (!fitted.current && driver) {
      const points: [number, number][] = [
        [target.lat, target.lng],
        [driver.lat, driver.lng],
      ];
      if (passenger) points.push([passenger.lat, passenger.lng]);
      map.fitBounds(points, { padding: [40, 40], maxZoom: 17 });
      fitted.current = true;
    }
  }, [target.lat, target.lng, driver?.lat, driver?.lng, passenger?.lat, passenger?.lng, vehicle]);

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
