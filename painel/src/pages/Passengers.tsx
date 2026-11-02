import { useState } from 'react';

import { friendlyError, supabase } from '../lib/supabase';

type Row = {
  passenger_id: string;
  full_name: string | null;
  phone: string | null;
  photo_path: string | null;
  rides_count: number;
};

// Achar um passageiro e abrir a foto, só para investigar denúncia. Cada vez que uma
// foto é aberta, o banco registra quem abriu e quando (tabela photo_views).
export function PassengersPage() {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  async function search() {
    setSearching(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc('staff_find_passenger', { p_query: query });
    setSearching(false);
    if (rpcError) {
      setError(friendlyError(rpcError));
      return;
    }
    setRows((data as Row[]) ?? []);
  }

  return (
    <>
      <div>
        <h1>Passageiros</h1>
        <p className="hint">
          Use só para investigar denúncia. Cada foto aberta fica registrada com o seu nome e a hora.
        </p>
      </div>

      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim().length >= 3) search();
        }}
      >
        <label className="field" style={{ minWidth: 260, flex: 1 }}>
          Buscar por nome ou telefone (mínimo 3 letras ou números)
          <input value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <button className="btn" type="submit" disabled={searching || query.trim().length < 3}>
          {searching ? 'Buscando...' : 'Buscar'}
        </button>
      </form>

      {error ? <div className="msg error">{error}</div> : null}
      {rows && rows.length === 0 && !error ? <p className="hint">Nenhum passageiro nessa busca.</p> : null}
      {rows?.map((row) => (
        <PassengerCard key={row.passenger_id} row={row} />
      ))}
    </>
  );
}

function PassengerCard({ row }: { row: Row }) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function viewPhoto() {
    if (!row.photo_path) return;
    setBusy(true);
    setMsg(null);
    // O registro vem primeiro: se não gravar, a foto não abre.
    const { error: logError } = await supabase.rpc('staff_log_photo_view', { p_passenger_id: row.passenger_id });
    if (logError) {
      setBusy(false);
      setMsg(friendlyError(logError));
      return;
    }
    const { data, error } = await supabase.storage.from('passenger-photos').createSignedUrl(row.photo_path, 60);
    setBusy(false);
    if (error || !data) {
      setMsg('Não foi possível abrir a foto.');
      return;
    }
    setPhoto(data.signedUrl);
  }

  return (
    <section className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <strong>{row.full_name ?? 'Sem nome'}</strong>
          <p className="hint">
            {row.phone ?? 'Sem telefone'} · {row.rides_count} corridas
          </p>
        </div>
        {row.photo_path ? (
          <button className="btn secondary" onClick={viewPhoto} disabled={busy}>
            {busy ? 'Abrindo...' : 'Ver foto'}
          </button>
        ) : (
          <span className="hint">Sem foto</span>
        )}
      </div>
      {msg ? <div className="msg error">{msg}</div> : null}
      {photo ? <img src={photo} alt="Foto do passageiro" style={{ maxWidth: 240, borderRadius: 12 }} /> : null}
    </section>
  );
}
