import { useCallback, useEffect, useState } from 'react';

import { Field, useDismissOk, type Msg } from '../lib/fields';
import { parseDecimal } from '../lib/format';
import { friendlyError, supabase } from '../lib/supabase';

type City = { id: number; name: string; state: string; active: boolean };
type Fare = { city_id: number; effective_from: string };
type Overview = { cities: City[]; fares: Fare[] };

export function CitiesPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: result, error: rpcError } = await supabase.rpc('staff_pricing_overview');
    if (rpcError) {
      setError(friendlyError(rpcError));
      return;
    }
    setError(null);
    setData(result as Overview);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <div>
        <h1>Cidades</h1>
        <p className="hint">
          Uma cidade nova nasce desativada. Antes de ativar, cadastre a tarifa dela na aba Preços.
        </p>
      </div>
      {error ? <div className="msg error">{error}</div> : null}
      {!data && !error ? <p className="hint">Carregando...</p> : null}
      {data ? <CitiesCard data={data} onSaved={load} /> : null}
    </>
  );
}

function CitiesCard({ data, onSaved }: { data: Overview; onSaved: () => Promise<void> }) {
  const [msg, setMsg] = useState<Msg>(null);
  useDismissOk(msg, setMsg);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [name, setName] = useState('');
  const [state, setState] = useState('CE');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [adding, setAdding] = useState(false);

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

  async function add() {
    const latitude = parseDecimal(lat);
    const longitude = parseDecimal(lng);
    if (latitude === null || longitude === null) {
      setMsg({ kind: 'error', text: 'Preencha a latitude e a longitude com números (ex.: -4.1670 e -40.7475).' });
      return;
    }
    setAdding(true);
    setMsg(null);
    const { error } = await supabase.rpc('staff_add_city', {
      p_name: name,
      p_state: state,
      p_lat: latitude,
      p_lng: longitude,
    });
    setAdding(false);
    if (error) {
      setMsg({ kind: 'error', text: friendlyError(error) });
      return;
    }
    setMsg({ kind: 'ok', text: 'Cidade adicionada (desativada). Cadastre a tarifa dela e depois ative.' });
    setName('');
    setLat('');
    setLng('');
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
                <button className="btn secondary" disabled={busyId === city.id} onClick={() => toggle(city)}>
                  {city.active ? 'Desativar' : 'Ativar'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Nova cidade</h2>
      <div className="grid">
        <label className="field">
          Nome
          <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          Estado (2 letras)
          <input value={state} maxLength={2} onChange={(e) => setState(e.target.value.toUpperCase())} />
        </label>
        <Field label="Latitude do centro" value={lat} onChange={setLat} />
        <Field label="Longitude do centro" value={lng} onChange={setLng} />
      </div>
      {msg ? <div className={`msg ${msg.kind}`}>{msg.text}</div> : null}
      <div>
        <button className="btn" disabled={adding || name.trim() === ''} onClick={add}>
          Adicionar cidade
        </button>
      </div>
    </section>
  );
}
