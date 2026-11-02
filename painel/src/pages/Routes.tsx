import { useCallback, useEffect, useMemo, useState } from 'react';

import { Field, useDismissOk, type Msg } from '../lib/fields';
import { parseDecimal, toField } from '../lib/format';
import { friendlyError, supabase } from '../lib/supabase';

type City = { id: number; name: string; state: string; active: boolean };
type Intercity = {
  origin_city_id: number;
  origin_name: string;
  destination_city_id: number;
  destination_name: string;
  vehicle_type: 'car' | 'moto';
  price: number;
};
type Overview = { cities: City[]; intercity: Intercity[] };

// Um par de cidades tem um preço só por veículo, igual nos dois sentidos.
type Pair = { a: number; aName: string; b: number; bName: string; car: string; moto: string };

export function RoutesPage() {
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
        <h1>Rotas entre cidades</h1>
        <p className="hint">
          Um preço fechado por par de cidades e veículo, igual na ida e na volta. A ida e volta pelo app usa o
          dobro da ida mais a espera pelo valor por minuto da tarifa.
        </p>
      </div>
      {error ? <div className="msg error">{error}</div> : null}
      {!data && !error ? <p className="hint">Carregando...</p> : null}
      {data ? <PairsCard data={data} onSaved={load} /> : null}
    </>
  );
}

function PairsCard({ data, onSaved }: { data: Overview; onSaved: () => Promise<void> }) {
  const pairs = useMemo(() => {
    const map = new Map<string, Pair>();
    for (const row of data.intercity) {
      const low = Math.min(row.origin_city_id, row.destination_city_id);
      const high = Math.max(row.origin_city_id, row.destination_city_id);
      const key = `${low}-${high}`;
      const pair =
        map.get(key) ??
        ({
          a: row.origin_city_id,
          aName: row.origin_name,
          b: row.destination_city_id,
          bName: row.destination_name,
          car: '',
          moto: '',
        } satisfies Pair);
      pair[row.vehicle_type] = toField(row.price);
      map.set(key, pair);
    }
    return [...map.values()].sort((x, y) => (x.aName + x.bName).localeCompare(y.aName + y.bName));
  }, [data.intercity]);

  const [edits, setEdits] = useState<Record<string, { car?: string; moto?: string }>>({});
  const [msg, setMsg] = useState<Msg>(null);
  useDismissOk(msg, setMsg);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const [newA, setNewA] = useState<number>(data.cities[0]?.id ?? 0);
  const [newB, setNewB] = useState<number>(data.cities[1]?.id ?? 0);
  const [newCar, setNewCar] = useState('');
  const [newMoto, setNewMoto] = useState('');

  async function savePair(a: number, b: number, car: string, moto: string, key: string): Promise<boolean> {
    if (a === b) {
      setMsg({ kind: 'error', text: 'Escolha duas cidades diferentes.' });
      return false;
    }
    const prices: { vehicle: 'car' | 'moto'; value: number }[] = [];
    for (const [vehicle, text] of [['car', car], ['moto', moto]] as const) {
      if (text.trim() === '') continue;
      const value = parseDecimal(text);
      if (value === null) {
        setMsg({ kind: 'error', text: 'Os preços precisam ser números.' });
        return false;
      }
      prices.push({ vehicle, value });
    }
    if (prices.length === 0) {
      setMsg({ kind: 'error', text: 'Preencha pelo menos um preço.' });
      return false;
    }
    setBusyKey(key);
    setMsg(null);
    for (const price of prices) {
      const { error } = await supabase.rpc('staff_set_intercity_price', {
        p_origin_city_id: a,
        p_destination_city_id: b,
        p_vehicle_type: price.vehicle,
        p_price: price.value,
      });
      if (error) {
        setBusyKey(null);
        setMsg({ kind: 'error', text: friendlyError(error) });
        return false;
      }
    }
    setBusyKey(null);
    setMsg({ kind: 'ok', text: 'Preço salvo para a ida e a volta.' });
    setEdits((e) => {
      const next = { ...e };
      delete next[key];
      return next;
    });
    await onSaved();
    return true;
  }

  async function removePair(pair: Pair, key: string) {
    if (!window.confirm(`Remover a rota entre ${pair.aName} e ${pair.bName}? Vale para a ida e a volta.`)) return;
    setBusyKey(key);
    setMsg(null);
    const { error } = await supabase.rpc('staff_delete_intercity_pair', { p_city_a: pair.a, p_city_b: pair.b });
    setBusyKey(null);
    if (error) {
      setMsg({ kind: 'error', text: friendlyError(error) });
      return;
    }
    setMsg({ kind: 'ok', text: 'Rota removida.' });
    await onSaved();
  }

  return (
    <section className="card">
      <table>
        <thead>
          <tr>
            <th>Cidades</th>
            <th>Carro (R$)</th>
            <th>Moto (R$)</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {pairs.map((pair) => {
            const key = `${Math.min(pair.a, pair.b)}-${Math.max(pair.a, pair.b)}`;
            const edit = edits[key] ?? {};
            const car = edit.car ?? pair.car;
            const moto = edit.moto ?? pair.moto;
            const changed = edit.car !== undefined || edit.moto !== undefined;
            return (
              <tr key={key}>
                <td>
                  {pair.aName} ⇄ {pair.bName}
                </td>
                <td>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={car}
                    onChange={(e) => setEdits({ ...edits, [key]: { ...edit, car: e.target.value } })}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={moto}
                    onChange={(e) => setEdits({ ...edits, [key]: { ...edit, moto: e.target.value } })}
                  />
                </td>
                <td>
                  <button
                    className="btn secondary"
                    disabled={!changed || busyKey === key}
                    onClick={() => savePair(pair.a, pair.b, car, moto, key)}
                  >
                    Salvar
                  </button>{' '}
                  <button className="btn secondary" disabled={busyKey === key} onClick={() => removePair(pair, key)}>
                    Remover
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {pairs.length === 0 ? <p className="hint">Ainda não há rotas entre cidades.</p> : null}

      <h2>Nova rota</h2>
      <div className="grid">
        <label className="field">
          Cidade
          <select value={newA} onChange={(e) => setNewA(Number(e.target.value))}>
            {data.cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Outra cidade
          <select value={newB} onChange={(e) => setNewB(Number(e.target.value))}>
            {data.cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <Field label="Carro (R$)" value={newCar} onChange={setNewCar} />
        <Field label="Moto (R$)" value={newMoto} onChange={setNewMoto} />
      </div>
      {msg ? <div className={`msg ${msg.kind}`}>{msg.text}</div> : null}
      <div>
        <button
          className="btn"
          disabled={busyKey === 'new'}
          onClick={async () => {
            if (await savePair(newA, newB, newCar, newMoto, 'new')) {
              setNewCar('');
              setNewMoto('');
            }
          }}
        >
          Adicionar rota
        </button>
      </div>
    </section>
  );
}
