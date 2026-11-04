// No navegador o mapa do motorista usa o Google Maps. No celular nativo (só Expo Go),
// LiveMap.tsx usa o Leaflet dentro de um WebView.
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { googleMapsAvailable, loadGoogleMaps } from '../lib/googleMaps';
import { frameKey, ROUTE_COLORS, type LiveMapProps } from './LiveMap.types';
import { LiveMapFree } from './LiveMapFree.web';

function emojiIcon(emoji: string): google.maps.Icon {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><text x="20" y="29" font-size="28" text-anchor="middle">${emoji}</text></svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(40, 40),
    anchor: new google.maps.Point(20, 20),
  };
}

// Um marcador que desliza até a posição nova em vez de dar um pulo. A
// animação dura mais ou menos o tempo entre duas atualizações, para o carro
// ficar sempre em movimento.
type Glider = { marker: google.maps.Marker; frame: number | null; lastAt: number };

function glideTo(glider: Glider, lat: number, lng: number) {
  const now = performance.now();
  const duration = Math.min(9000, Math.max(1500, now - glider.lastAt));
  glider.lastAt = now;
  if (glider.frame !== null) cancelAnimationFrame(glider.frame);
  const from = glider.marker.getPosition();
  if (!from) return;
  const fromLat = from.lat();
  const fromLng = from.lng();
  const step = (t: number) => {
    const k = Math.min(1, (t - now) / duration);
    glider.marker.setPosition({ lat: fromLat + (lat - fromLat) * k, lng: fromLng + (lng - fromLng) * k });
    glider.frame = k < 1 ? requestAnimationFrame(step) : null;
  };
  glider.frame = requestAnimationFrame(step);
}

// Sem a chave do Google (ou no servidor de teste, onde ela não vale), usa o mapa grátis.
export function LiveMap(props: LiveMapProps) {
  return googleMapsAvailable ? <GoogleLiveMap {...props} /> : <LiveMapFree {...props} />;
}

function GoogleLiveMap({ target, driver, vehicle, passenger, destination, routes, height }: LiveMapProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const targetMarker = useRef<google.maps.Marker | null>(null);
  const driverGlider = useRef<Glider | null>(null);
  const passengerGlider = useRef<Glider | null>(null);
  const destinationMarker = useRef<google.maps.Marker | null>(null);
  const lines = useRef<google.maps.Polyline[]>([]);
  const fitted = useRef('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then(() => google.maps.importLibrary('maps'))
      .then(() => {
        if (cancelled || !divRef.current) return;
        const map = new google.maps.Map(divRef.current, {
          center: target,
          zoom: 16,
          disableDefaultUI: true,
          clickableIcons: false,
          gestureHandling: 'greedy',
        });
        targetMarker.current = new google.maps.Marker({ map, position: target, icon: emojiIcon('📍'), clickable: false });
        mapRef.current = map;
        setReady(true);
      })
      .catch(() => {
        // Sem chave ou sem internet: fica o fundo liso.
      });
    return () => {
      cancelled = true;
      [driverGlider.current, passengerGlider.current].forEach((g) => {
        if (g?.frame != null) cancelAnimationFrame(g.frame);
        g?.marker.setMap(null);
      });
      targetMarker.current?.setMap(null);
      destinationMarker.current?.setMap(null);
      lines.current.forEach((l) => l.setMap(null));
      lines.current = [];
      destinationMarker.current = null;
      mapRef.current = null;
      targetMarker.current = null;
      driverGlider.current = null;
      passengerGlider.current = null;
      fitted.current = '';
    };
    // O mapa nasce uma vez; as posições entram pelo efeito abaixo.
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    targetMarker.current?.setPosition(target);

    if (driver) {
      if (!driverGlider.current) {
        const marker = new google.maps.Marker({
          map,
          position: driver,
          icon: emojiIcon(vehicle === 'moto' ? '🏍️' : '🚗'),
          zIndex: 1000,
          clickable: false,
        });
        driverGlider.current = { marker, frame: null, lastAt: performance.now() };
      } else {
        glideTo(driverGlider.current, driver.lat, driver.lng);
      }
    }

    if (passenger) {
      if (!passengerGlider.current) {
        const marker = new google.maps.Marker({
          map,
          position: passenger,
          icon: emojiIcon('🧍'),
          zIndex: 900,
          clickable: false,
        });
        passengerGlider.current = { marker, frame: null, lastAt: performance.now() };
      } else {
        glideTo(passengerGlider.current, passenger.lat, passenger.lng);
      }
    } else if (passengerGlider.current) {
      // O passageiro deixou de compartilhar (ex.: já embarcou).
      passengerGlider.current.marker.setMap(null);
      passengerGlider.current = null;
    }

    // Marcador do destino da corrida (enquanto o ponto principal ainda é o de embarque).
    if (destination) {
      if (!destinationMarker.current) {
        destinationMarker.current = new google.maps.Marker({
          map,
          position: destination,
          icon: emojiIcon('🏁'),
          zIndex: 500,
          clickable: false,
        });
      } else {
        destinationMarker.current.setPosition(destination);
      }
    } else if (destinationMarker.current) {
      destinationMarker.current.setMap(null);
      destinationMarker.current = null;
    }

    // Traços das rotas: redesenha quando chega uma rota nova.
    lines.current.forEach((l) => l.setMap(null));
    lines.current = (routes ?? [])
      .filter((r) => r.points.length > 1)
      .map(
        (r) =>
          new google.maps.Polyline({
            map,
            path: r.points,
            strokeColor: ROUTE_COLORS[r.kind],
            strokeOpacity: 0.85,
            strokeWeight: 5,
            clickable: false,
          }),
      );

    // Enquadra tudo na primeira vez e quando aparece uma rota ou o destino muda; depois só os marcadores
    // andam, sem mexer na tela da pessoa.
    const key = `${frameKey(destination, routes)}|${driver ? 'd' : ''}`;
    if ((driver || destination) && fitted.current !== key) {
      const bounds = new google.maps.LatLngBounds();
      bounds.extend(target);
      if (driver) bounds.extend(driver);
      if (passenger) bounds.extend(passenger);
      if (destination) bounds.extend(destination);
      (routes ?? []).forEach((r) => r.points.forEach((p) => bounds.extend(p)));
      map.fitBounds(bounds, 40);
      google.maps.event.addListenerOnce(map, 'idle', () => {
        if ((map.getZoom() ?? 0) > 17) map.setZoom(17);
      });
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
