import { useEffect, useRef, useState } from 'react';

import type { Coord } from '../components/PinMap.types';
import { fetchRoute, type Route } from '../lib/routes';
import { shouldRefetchRoute } from '../lib/routeGeometry';

// Rota de `from` até `to`. Busca assim que os dois pontos existem e só refaz se `from` andou muito
// (cada busca custa uma consulta ao Google). Mudou o destino: limpa e busca de novo.
export function useRoute(from: Coord | null, to: Coord | null, enabled: boolean): Route | null {
  const [route, setRoute] = useState<Route | null>(null);
  const last = useRef<{ from: Coord; at: number } | null>(null);
  // Resposta de uma busca antiga (de outro destino) não pode sobrescrever a atual.
  const request = useRef(0);
  const toKey = to ? `${to.lat.toFixed(5)},${to.lng.toFixed(5)}` : '';

  useEffect(() => {
    request.current += 1;
    last.current = null;
    setRoute(null);
  }, [toKey, enabled]);

  useEffect(() => {
    if (!enabled || !from || !to) return;
    if (!shouldRefetchRoute(last.current, from, Date.now())) return;
    last.current = { from, at: Date.now() };
    const mine = request.current;
    fetchRoute(from, to).then((r) => {
      if (r && mine === request.current) setRoute(r);
    });
    // `to` entra pela chave; `from` muda a cada posição, mas shouldRefetchRoute segura as buscas.
  }, [enabled, from?.lat, from?.lng, toKey]);

  return route;
}
