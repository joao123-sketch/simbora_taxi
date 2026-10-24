import * as Location from 'expo-location';
import { useEffect } from 'react';

import { sendPassengerLocation } from '../lib/tracking';

// Enquanto o passageiro espera o motorista (corrida aceita ou motorista no
// local), manda a posição dele a cada 10 s ou 15 m. Sem permissão de GPS, não
// faz nada: o motorista só deixa de ver o passageiro andando.
export function usePassengerLocation(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let subscription: Location.LocationSubscription | null = null;
    let cancelled = false;

    (async () => {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted) return;
      const watcher = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 10000, distanceInterval: 15 },
        ({ coords }) => {
          sendPassengerLocation(coords.latitude, coords.longitude).catch(() => {
            // Sem internet por um instante: a próxima posição tenta de novo.
          });
        },
      );
      if (cancelled) watcher.remove();
      else subscription = watcher;
    })().catch(() => {});

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [enabled]);
}
