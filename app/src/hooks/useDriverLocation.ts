import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

import type { Coord } from '../components/PinMap.types';
import { sendLocation } from '../lib/drivers';
import { useWakeLock } from './useWakeLock';

// Enquanto o motorista está online, manda a posição para o banco a cada
// 10 s ou 20 m, o que vier primeiro.
export function useDriverLocation(enabled: boolean) {
  const [position, setPosition] = useState<Coord | null>(null);
  const [denied, setDenied] = useState(false);
  useWakeLock(enabled);

  useEffect(() => {
    if (!enabled) return;
    let subscription: Location.LocationSubscription | null = null;
    let cancelled = false;

    (async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      // No navegador, "granted" vem falso também quando o GPS só demorou ou falhou na primeira leitura;
      // só desiste se a pessoa recusou de verdade.
      if (!permission.granted && permission.status !== Location.PermissionStatus.GRANTED) {
        setDenied(true);
        return;
      }
      setDenied(false);
      const watcher = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 10000, distanceInterval: 20 },
        ({ coords }) => {
          setPosition({ lat: coords.latitude, lng: coords.longitude });
          sendLocation(coords.latitude, coords.longitude, coords.heading).catch(() => {
            // Sem internet por um instante: a próxima posição tenta de novo.
          });
        },
      );
      if (cancelled) watcher.remove();
      else subscription = watcher;
    })().catch(() => setDenied(true));

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [enabled]);

  return { position, denied };
}
