import { useCallback, useEffect, useState } from 'react';

import { formatDate, money, vehicleLabel } from '../lib/format';
import { friendlyError, supabase } from '../lib/supabase';

type FeeRow = {
  driver_id: string;
  driver_name: string | null;
  vehicle_type: 'car' | 'moto';
  vehicle_plate: string;
  state: 'ok' | 'pending' | 'due' | 'overdue';
  due_on: string | null;
  days_late: number;
  period_id: number | null;
  kind: 'free' | 'entry' | 'standard' | null;
  amount: number | null;
  needs_renewal: boolean;
  claimed_at: string | null;
  receipt_path: string | null;
};

type PixSettings = {
  pix_key: string | null;
  receiver_name: string | null;
  receiver_city: string | null;
  description: string;
};

const stateLabel: Record<FeeRow['state'], string> = {
  ok: 'Em dia',
  pending: 'Mês aberto',
  due: 'Venceu (dentro da tolerância)',
  overdue: 'Em atraso (sem receber pedidos)',
};

const kindLabel: Record<string, string> = { free: 'Mês grátis', entry: 'Mês de entrada', standard: 'Mensalidade' };

export function FeesPage() {
  const [rows, setRows] = useState<FeeRow[] | null>(null);
  const [all, setAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('staff_list_fees', { p_all: all });
    if (rpcError) {
      setError(friendlyError(rpcError));
      return;
    }
    setError(null);
    setRows(data as FeeRow[]);
  }, [all]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1>Mensalidades</h1>
          <p className="hint">
            O motorista paga o mês antes de começar. Confira o dinheiro no banco e confirme aqui. Passados 5 dias do
            vencimento ele deixa de receber pedidos até regularizar.
          </p>
        </div>
        <label className="check">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
          Mostrar também quem está em dia
        </label>
      </div>

      <PixCard />

      {error ? <div className="msg error">{error}</div> : null}
      {rows === null && !error ? <p className="hint">Carregando...</p> : null}
      {rows?.length === 0 && !error ? <p className="hint">Nenhum motorista com mensalidade a conferir.</p> : null}
      {rows?.map((row) => (
        <FeeCard key={row.driver_id} row={row} onChanged={load} />
      ))}
    </>
  );
}

function FeeCard({ row, onChanged }: { row: FeeRow; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  async function openReceipt() {
    if (!row.receipt_path) return;
    const { data, error } = await supabase.storage.from('fee-receipts').createSignedUrl(row.receipt_path, 300);
    if (error || !data) {
      setMsg({ kind: 'error', text: 'Não foi possível abrir o comprovante.' });
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener');
  }

  async function confirmPaid() {
    if (row.period_id === null) return;
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.rpc('staff_mark_fee_paid', { p_period_id: row.period_id });
    setBusy(false);
    if (error) {
      setMsg({ kind: 'error', text: friendlyError(error) });
      return;
    }
    await onChanged();
  }

  return (
    <section className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h2>{row.driver_name ?? 'Motorista'}</h2>
          <p className="hint">
            {vehicleLabel[row.vehicle_type]} · placa {row.vehicle_plate}
          </p>
        </div>
        <span className={`badge ${row.state === 'overdue' ? 'blocked' : row.state === 'ok' ? 'approved' : 'pending'}`}>
          {stateLabel[row.state]}
        </span>
      </div>

      {row.needs_renewal ? (
        <p>
          O mês acabou em {formatDate(row.due_on)} e o motorista ainda não abriu o próximo
          {row.amount ? ` (${money(row.amount)})` : ''}.
          {row.days_late > 0 ? ` ${row.days_late} dia(s) de atraso.` : ''}
        </p>
      ) : row.period_id !== null ? (
        <p>
          {kindLabel[row.kind ?? 'standard']}: <b>{money(row.amount ?? 0)}</b>, vence em {formatDate(row.due_on)}
          {row.days_late > 0 ? ` · ${row.days_late} dia(s) de atraso` : ''}.
        </p>
      ) : null}

      {row.claimed_at ? (
        <p>
          <b>O motorista avisou que pagou</b> em {formatDate(row.claimed_at)}.{' '}
          {row.receipt_path ? (
            <button className="btn secondary" onClick={openReceipt}>
              Ver o comprovante
            </button>
          ) : (
            'Sem comprovante anexado.'
          )}
        </p>
      ) : null}

      {msg ? <div className={`msg ${msg.kind}`}>{msg.text}</div> : null}
      {row.period_id !== null ? (
        <div>
          <button className="btn" disabled={busy} onClick={confirmPaid}>
            Confirmar pagamento recebido
          </button>
        </div>
      ) : null}
    </section>
  );
}

function PixCard() {
  const [pix, setPix] = useState<PixSettings | null>(null);
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [description, setDescription] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.rpc('staff_get_pix_settings').then(({ data }) => {
      const value = data as PixSettings | null;
      if (!value) return;
      setPix(value);
      setKey(value.pix_key ?? '');
      setName(value.receiver_name ?? '');
      setCity(value.receiver_city ?? '');
      setDescription(value.description);
    });
  }, []);

  async function save() {
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.rpc('staff_set_pix_settings', {
      p_key: key,
      p_name: name,
      p_city: city,
      p_description: description,
    });
    setBusy(false);
    setMsg(error ? { kind: 'error', text: friendlyError(error) } : { kind: 'ok', text: 'Dados do Pix salvos.' });
  }

  return (
    <section className="card">
      <div>
        <h2>Pix para receber as mensalidades</h2>
        <p className="hint">
          O app monta o QR e o Pix copia e cola com estes dados e o valor do mês. O nome vai até 25 letras e a cidade
          até 15, sem acento.
          {pix && !pix.pix_key ? ' Ainda não há chave cadastrada: os motoristas não conseguem pagar pelo app.' : ''}
        </p>
      </div>
      <div className="grid">
        <label className="field">
          Chave Pix
          <input value={key} onChange={(e) => setKey(e.target.value)} />
        </label>
        <label className="field">
          Nome de quem recebe
          <input value={name} maxLength={25} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          Cidade
          <input value={city} maxLength={15} onChange={(e) => setCity(e.target.value)} />
        </label>
        <label className="field">
          Descrição do Pix
          <input value={description} maxLength={25} onChange={(e) => setDescription(e.target.value)} />
        </label>
      </div>
      {msg ? <div className={`msg ${msg.kind}`}>{msg.text}</div> : null}
      <div>
        <button className="btn" disabled={busy} onClick={save}>
          Salvar dados do Pix
        </button>
      </div>
    </section>
  );
}
