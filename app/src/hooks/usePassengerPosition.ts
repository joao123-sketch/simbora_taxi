import { useEffect, useState } from 'react';

import { fetchPassengerPosition, type PassengerPosition } from '../lib/tracking';

const POLL_MS = 6000;

// Onde o passageiro está, para o motorista ver ele se aproximando. Consulta a
// cada 6 s; se o banco não tiver posição (ele não compartilha, ou a corrida já
// começou), devolve nulo e o mapa não mostra o passageiro.
export function usePassengerPosition(rideId: number, enabled: boolean): PassengerPosition | null {
  const [position, setPosition] = useState<PassengerPosition | null>(null);

  useEffect(() => {
    if (!enabled) {
      setPosition(null);
      return;
    }
    let alive = true;
    const load = () =>
      fetchPassengerPosition(rideId)
        .then((p) => alive && setPosition(p))
        .catch(() => {});
    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [rideId, enabled]);

  return position;
}
