import { useEffect, useState } from 'react';

import { fetchDriverPosition, subscribeToDriverPosition, type DriverPosition } from '../lib/tracking';

const POLL_MS = 6000;
const STALE_MS = 90000;

// Onde o motorista está, atualizando em tempo real (e por consulta, caso o
// tempo real falhe). `stale` avisa quando faz mais de 90 s que ele não manda posição.
export function useDriverPosition(driverId: string | null, enabled: boolean) {
  const [position, setPosition] = useState<DriverPosition | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!driverId || !enabled) {
      setPosition(null);
      return;
    }
    let alive = true;
    const load = () =>
      fetchDriverPosition(driverId)
        .then((p) => alive && setPosition(p))
        .catch(() => {});
    load();
    const unsubscribe = subscribeToDriverPosition(driverId, load);
    const timer = setInterval(() => {
      load();
      setNow(Date.now());
    }, POLL_MS);
    return () => {
      alive = false;
      unsubscribe();
      clearInterval(timer);
    };
  }, [driverId, enabled]);

  const stale = position ? now - new Date(position.updated_at).getTime() > STALE_MS : false;
  return { position, stale };
}
