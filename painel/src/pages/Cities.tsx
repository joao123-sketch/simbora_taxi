import { useCallback, useEffect, useState } from 'react';

import { Field, useDismissOk, type Msg } from '../lib/fields';
import { parseCoords } from '../lib/coords';
import { parseDecimal } from '../lib/format';
import { friendlyError, supabase } from '../lib/supabase';

type City = { id: number; name: string; state: string; active: boolean };
type Fare = { city_id: number; effective_from: string };
type Overview = { cities: City[]; fares: Fare[] };
type Radii = Record<number, number>;

export function CitiesPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [radii, setRadii] = useState<Radii>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: result, error: rpcError }, { data: map }] = await Promise.all([
      supabase.rpc('staff_pricing_overview'),
      supabase.from('cities_map').select('id, radius_km'),
    ]);
    if (rpcError) {
      setError(friendlyError(rpcError));
      return;
    }
    setError(null);
    setData(result as Overview);
    setRadii(Object.fromEntries((map ?? []).map((c: { id: number; radius_km: number }) => [c.id, Number(c.radius_km)])));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <div>
        <h1>Cidades</h1>
        <p className="hint">
          Abrir uma cidade cria, copia as tarifas de uma cidade modelo e já ativa. Depois, ajuste as tarifas dela na aba Preços se quiser.
        </p>
      </div>
      {error ? <div className="msg error">{error}</div> : null}
      {!data && !error ? <p className="hint">Carregando...</p> : null}
      {data ? <CitiesCard data={data} radii={radii} onSaved={load} /> : null}
    </>
  );
}

function CitiesCard({ data, radii, onSaved }: { data: Overview; radii: Radii; onSaved: () => Promise<void> }) {
  const [msg, setMsg] = useState<Msg>(null);
  useDismissOk(msg, setMsg);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [name, setName] = useState('');
  const [state, setState] = useState('CE');
  const [point, setPoint] = useState('');
  const [radius, setRadius] = useState('8');
  const [model, setModel] = useState(() => String(data.cities.find((c) => c.active && c.name === 'Guaraciaba do Norte')?.id ?? data.cities.find((c) => c.active)?.id ?? ''));
  const [adding, setAdding] = useState(false);
  const [radiusEdit, setRadiusEdit] = useState<Record<number, string>>({});

  const hasFare = (cityId: number) => data.fares.some((f) => f.city_id === cityId);

  async function toggle(city: City) {
    setBusyId(city.id);
    setMsg(null);
    const { error } = await supabase.rpc('staff_set_city_active', { p_city_id: city.id, p_active: !city.active });
    setBusyId(null);
    if (error) {
      setMsg({ kind: 'error', text: friendlyError(error) });
      return;
    }
    setMsg({ kind: 'ok', text: city.active ? `${city.name} desativada.` : `${city.name} ativada.` });
    await onSaved();
  }

  async function saveRadius(city: City) {
    const km = parseDecimal(radiusEdit[city.id] ?? '');
    if (km === null) {
      setMsg({ kind: 'error', text: 'Escreva o raio em km, com número (ex.: 8).' });
      return;
    }
    setBusyId(city.id);
    setMsg(null);
    const { error } = await supabase.rpc('staff_set_city_radius', { p_city_id: city.id, p_radius_km: km });
    setBusyId(null);
    if (error) {
      setMsg({ kind: 'error', text: friendlyError(error) });
      return;
    }
    setMsg({ kind: 'ok', text: `Raio de ${city.name}: ${km} km.` });
    setRadiusEdit((current) => {
      const { [city.id]: _gone, ...rest } = current;
      return rest;
    });
    await onSaved();
  }

  async function open() {
    const coords = parseCoords(point);
    const km = parseDecimal(radius);
    if (!coords) {
      setMsg({ kind: 'error', text: 'Cole o ponto do Google Maps (ex.: -3.8545, -40.9210).' });
      return;
    }
    if (km === null) {
      setMsg({ kind: 'error', text: 'Escreva o raio em km, com número (ex.: 8).' });
      return;
    }
    if (!model) {
      setMsg({ kind: 'error', text: 'Escolha a cidade da qual copiar as tarifas.' });
      return;
    }
    setAdding(true);
    setMsg(null);
    const { error } = await supabase.rpc('staff_open_city', {
      p_name: name,
      p_state: state,
      p_lat: coords.lat,
      p_lng: coords.lng,
      p_radius_km: km,
      p_copy_fares_from: Number(model),
    });
    setAdding(false);
    if (error) {
      setMsg({ kind: 'error', text: friendlyError(error) });
      return;
    }
    setMsg({ kind: 'ok', text: `${name.trim()} aberta e ativa, com as tarifas copiadas.` });
    setName('');
    setPoint('');
    await onSaved();
  }

  return (
    <section className="card">
      <table>
        <thead>
          <tr>
            <th>Cidade</th>
            <th>Situação</th>
            <th>Tarifa</th>
            <th>Raio (km)</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data.cities.map((city) => (
            <tr key={city.id}>
              <td>
                {city.name} ({city.state})
              </td>
              <td>{city.active ? 'Ativa' : 'Desativada'}</td>
              <td>{hasFare(city.id) ? 'Cadastrada' : 'Falta cadastrar'}</td>
              <td>
                <input
                  style={{ width: 64 }}
                  value={radiusEdit[city.id] ?? String(radii[city.id] ?? '')}
                  onChange={(e) => setRadiusEdit({ ...radiusEdit, [city.id]: e.target.value })}
                />{' '}
                {radiusEdit[city.id] !== undefined ? (
                  <button className="btn secondary" disabled={busyId === city.id} onClick={() => saveRadius(city)}>
                    Salvar
                  </button>
                ) : null}
              </td>
              <td>
                <button className="btn secondary" disabled={busyId === city.id} onClick={() => toggle(city)}>
                  {city.active ? 'Desativar' : 'Ativar'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Abrir cidade</h2>
      <div className="grid">
        <label className="field">
          Nome
          <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          Estado (2 letras)
          <input value={state} maxLength={2} onChange={(e) => setState(e.target.value.toUpperCase())} />
        </label>
        <Field label="Ponto no mapa (cole do Google Maps)" value={point} onChange={setPoint} />
        <Field label="Raio de atendimento (km)" value={radius} onChange={setRadius} />
        <label className="field">
          Copiar tarifas de
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            {data.cities
              .filter((c) => c.active)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.state})
                </option>
              ))}
          </select>
        </label>
      </div>
      <p className="hint">No Google Maps, clique com o botão direito no centro da cidade e clique nos números que aparecem para copiar.</p>
      {msg ? <div className={`msg ${msg.kind}`}>{msg.text}</div> : null}
      <div>
        <button className="btn" disabled={adding || name.trim() === ''} onClick={open}>
          Abrir cidade
        </button>
      </div>
    </section>
  );
}
