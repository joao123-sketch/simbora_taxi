import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';

import { supabase } from '../lib/supabase';
import { DOWNLOAD_URL } from './links';

type Shared = {
  status: 'requested' | 'accepted' | 'arrived' | 'in_progress' | 'completed' | 'cancelled';
  kind: 'ride' | 'delivery';
  vehicle_type: 'car' | 'moto' | null;
  vehicle_model: string | null;
  vehicle_color: string | null;
  vehicle_plate: string | null;
  driver_first_name: string | null;
  origin_address: string | null;
  destination_address: string | null;
  origin_lat: number | null;
  origin_lng: number | null;
  destination_lat: number | null;
  destination_lng: number | null;
  driver_lat: number | null;
  driver_lng: number | null;
  position_updated_at: string | null;
};

const POLL_MS = 5000;

function statusText(s: Shared): string {
  const what = s.kind === 'delivery' ? 'A entrega' : 'A corrida';
  switch (s.status) {
    case 'requested':
      return `${what} foi pedida e está procurando um motorista.`;
    case 'accepted':
      return s.kind === 'delivery' ? 'O motorista está indo buscar o pacote.' : 'O motorista está a caminho do embarque.';
    case 'arrived':
      return s.kind === 'delivery' ? 'O motorista chegou para pegar o pacote.' : 'O motorista chegou ao local de embarque.';
    case 'in_progress':
      return s.kind === 'delivery' ? 'O pacote está a caminho.' : 'A viagem está em andamento.';
    case 'completed':
      return `${what} terminou.`;
    case 'cancelled':
      return `${what} foi cancelada.`;
  }
}

function ago(iso: string | null): string {
  if (!iso) return '';
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'agora há pouco';
  return `há ${Math.round(seconds / 60)} min`;
}

function Map({ s }: { s: Shared }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const fitted = useRef(false);

  useEffect(() => {
    if (!box.current || map.current) return;
    map.current = L.map(box.current, { zoomControl: true }).setView([-4.17, -40.75], 14);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    if (!map.current || !layer.current) return;
    layer.current.clearLayers();
    const points: L.LatLngTuple[] = [];
    const dot = (lat: number | null, lng: number | null, color: string, label: string, radius = 9) => {
      if (lat == null || lng == null) return;
      L.circleMarker([lat, lng], { radius, color: '#fff', weight: 3, fillColor: color, fillOpacity: 1 })
        .bindTooltip(label, { permanent: false })
        .addTo(layer.current!);
      points.push([lat, lng]);
    };
    dot(s.origin_lat, s.origin_lng, '#1f7a3d', s.kind === 'delivery' ? 'Coleta' : 'Embarque');
    dot(s.destination_lat, s.destination_lng, '#d62828', 'Destino');
    dot(s.driver_lat, s.driver_lng, '#1a56db', 'Motorista', 12);
    if (points.length > 0 && !fitted.current) {
      map.current.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 16 });
      fitted.current = true;
    }
  }, [s]);

  return <div ref={box} className="share-map" />;
}

export function SharedRidePage({ code }: { code: string }) {
  const [data, setData] = useState<Shared | null | undefined>(undefined);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let alive = true;
    async function load() {
      const { data: rows, error } = await supabase.rpc('shared_ride', { p_code: code });
      if (!alive) return;
      if (error) {
        setOffline(true);
        return;
      }
      setOffline(false);
      setData((rows as Shared[])[0] ?? null);
    }
    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [code]);

  if (data === undefined) {
    return <div className="public-page"><p className="hint">Carregando o trajeto...</p></div>;
  }

  if (data === null) {
    return (
      <div className="public-page">
        <div className="card">
          <h1>Link não encontrado</h1>
          <p className="hint">Confira o link que você recebeu. Se a corrida já terminou, o link deixa de funcionar.</p>
        </div>
      </div>
    );
  }

  const finished = data.status === 'completed' || data.status === 'cancelled';
  const vehicle = [data.vehicle_model, data.vehicle_color?.toLowerCase()].filter(Boolean).join(', ');

  return (
    <div className="public-page">
      <header className="public-head">
        <span className="brand">Simbora Car</span>
        <span className="hint">{data.kind === 'delivery' ? 'Acompanhe a entrega' : 'Acompanhe a corrida'}</span>
      </header>

      <div className="card">
        <h1>{statusText(data)}</h1>
        {finished ? (
          <p className="hint">Por segurança, o link não mostra mais a posição depois que termina.</p>
        ) : (
          <>
            <p>
              <strong>{data.driver_first_name || 'Motorista'}</strong>
              {vehicle ? ` · ${vehicle}` : ''}
              {data.vehicle_plate ? ` · placa ${data.vehicle_plate}` : ''}
            </p>
            <p className="hint">
              {data.origin_address} → {data.destination_address}
            </p>
            {data.driver_lat != null ? (
              <p className="hint">Posição do motorista atualizada {ago(data.position_updated_at)}.</p>
            ) : null}
            {offline ? <p className="msg error">Sem internet. Tentando de novo...</p> : null}
          </>
        )}
      </div>

      {!finished ? <Map s={data} /> : null}

      <p className="hint center">
        {DOWNLOAD_URL ? (
          <a href={DOWNLOAD_URL}>Baixe o Simbora Car</a>
        ) : (
          'Simbora Car — corridas de carro e moto na sua cidade.'
        )}
      </p>
    </div>
  );
}
