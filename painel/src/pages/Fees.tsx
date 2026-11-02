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
  // Cobrança gerada no Asaas para este mês (null = ainda não foi gerada).
  asaas_payment_id: string | null;
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
            O motorista paga o mês antes de começar, por Pix ou cartão, pela cobrança do Asaas. Quando o pagamento cai, o
            mês é baixado sozinho. Use o botão abaixo só se o dinheiro entrou por fora. Passados 5 dias do vencimento ele
            deixa de receber pedidos até regularizar.
          </p>
        </div>
        <label className="check">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
          Mostrar também quem está em dia
        </label>
      </div>

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

      {row.period_id !== null ? (
        <p className="hint">
          {row.asaas_payment_id ? `Cobrança no Asaas: ${row.asaas_payment_id}` : 'Cobrança no Asaas ainda não gerada (abre 5 dias antes do vencimento).'}
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
            Confirmar pagamento recebido por fora
          </button>
        </div>
      ) : null}
    </section>
  );
}
