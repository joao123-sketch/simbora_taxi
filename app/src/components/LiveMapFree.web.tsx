// Mapa do motorista grátis (OpenStreetMap com Leaflet) para o servidor de teste, onde a chave do Google não vale.
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { emojiDivIcon, loadLeaflet, TILE_URL, type Leaflet } from '../lib/leaflet';
import { frameKey, ROUTE_COLORS, type LiveMapProps } from './LiveMap.types';

export function LiveMapFree({ target, driver, vehicle, passenger, destination, routes, height }: LiveMapProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet>(null);
  const leafletRef = useRef<Leaflet>(null);
  const targetMarker = useRef<Leaflet>(null);
  const driverMarker = useRef<Leaflet>(null);
  const passengerMarker = useRef<Leaflet>(null);
  const destinationMarker = useRef<Leaflet>(null);
  const lines = useRef<Leaflet[]>([]);
  const fitted = useRef('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !divRef.current) return;
        const map = L.map(divRef.current, { center: [target.lat, target.lng], zoom: 16, zoomControl: false, attributionControl: false });
        L.tileLayer(TILE_URL, { maxZoom: 19 }).addTo(map);
        targetMarker.current = L.marker([target.lat, target.lng], { icon: emojiDivIcon(L, '📍'), interactive: false }).addTo(map);
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
      targetMarker.current = null;
      driverMarker.current = null;
      passengerMarker.current = null;
      destinationMarker.current = null;
      lines.current = [];
      fitted.current = '';
    };
    // O mapa nasce uma vez; as posições entram pelo efeito abaixo.
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!ready || !map || !L) return;
    targetMarker.current?.setLatLng([target.lat, target.lng]);

    if (driver) {
      if (!driverMarker.current) {
        driverMarker.current = L.marker([driver.lat, driver.lng], {
          icon: emojiDivIcon(L, vehicle === 'moto' ? '🏍️' : '🚗'),
          interactive: false,
          zIndexOffset: 1000,
        }).addTo(map);
      } else {
        driverMarker.current.setLatLng([driver.lat, driver.lng]);
      }
    }

    if (passenger) {
      if (!passengerMarker.current) {
        passengerMarker.current = L.marker([passenger.lat, passenger.lng], {
          icon: emojiDivIcon(L, '🧍'),
          interactive: false,
          zIndexOffset: 900,
        }).addTo(map);
      } else {
        passengerMarker.current.setLatLng([passenger.lat, passenger.lng]);
      }
    } else if (passengerMarker.current) {
      passengerMarker.current.remove();
      passengerMarker.current = null;
    }

    if (destination) {
      if (!destinationMarker.current) {
        destinationMarker.current = L.marker([destination.lat, destination.lng], {
          icon: emojiDivIcon(L, '🏁'),
          interactive: false,
          zIndexOffset: 500,
        }).addTo(map);
      } else {
        destinationMarker.current.setLatLng([destination.lat, destination.lng]);
      }
    } else if (destinationMarker.current) {
      destinationMarker.current.remove();
      destinationMarker.current = null;
    }

    lines.current.forEach((l) => l.remove());
    lines.current = (routes ?? [])
      .filter((r) => r.points.length > 1)
      .map((r) =>
        L.polyline(
          r.points.map((p) => [p.lat, p.lng]),
          { color: ROUTE_COLORS[r.kind], weight: 5, opacity: 0.85, interactive: false },
        ).addTo(map),
      );

    // Enquadra tudo na primeira vez e quando aparece uma rota ou o destino muda; depois só os marcadores andam.
    const key = frameKey(destination, routes);
    if (driver && fitted.current !== key) {
      const points = [
        [target.lat, target.lng],
        [driver.lat, driver.lng],
        ...(passenger ? [[passenger.lat, passenger.lng]] : []),
        ...(destination ? [[destination.lat, destination.lng]] : []),
        ...(routes ?? []).flatMap((r) => r.points.map((p) => [p.lat, p.lng])),
      ];
      map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 17, animate: false });
      fitted.current = key;
    }
  }, [ready, target.lat, target.lng, driver?.lat, driver?.lng, passenger?.lat, passenger?.lng, vehicle, destination?.lat, destination?.lng, routes]);

  return (
    <View style={[styles.box, height ? { height } : null]}>
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
