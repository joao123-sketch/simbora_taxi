import { useCallback, useEffect, useMemo, useState } from 'react';

import { formatCpf, formatDate, money, vehicleLabel } from '../lib/format';
import { friendlyError, supabase } from '../lib/supabase';

type Status = 'pending' | 'approved' | 'suspended' | 'blocked';

type Row = {
  driver_id: string;
  full_name: string | null;
  phone: string | null;
  status: Status;
  vehicle_type: 'car' | 'moto';
  vehicle_model: string;
  vehicle_color: string;
  vehicle_plate: string;
  vehicle_year: number;
  city_name: string;
  is_online: boolean;
  created_at: string;
  approved_at: string | null;
  cpf: string | null;
  birth_date: string | null;
  cnh_category: string | null;
  cnh_ear: boolean | null;
  lock_note: string | null;
  locked_at: string | null;
  last_seen: string | null;
  rides_total: number;
  rides_30d: number;
  rating_avg: number | null;
  rating_count: number;
  fee_state: 'ok' | 'pending' | 'due' | 'overdue' | null;
  fee_due_on: string | null;
  fee_amount: number | null;
};

const statusLabel: Record<Status, string> = {
  pending: 'Aguardando aprovação',
  approved: 'Aprovado',
  suspended: 'Travado',
  blocked: 'Bloqueado',
};

const feeLabel: Record<string, string> = {
  ok: 'Em dia',
  pending: 'Mês aberto, no prazo',
  due: 'Vencida (dentro da tolerância)',
  overdue: 'Em atraso (sem receber pedidos)',
};

type Filter = 'all' | Status | 'online';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'approved', label: 'Aprovados' },
  { value: 'online', label: 'Online agora' },
  { value: 'pending', label: 'Aguardando aprovação' },
  { value: 'suspended', label: 'Travados' },
  { value: 'blocked', label: 'Bloqueados' },
];

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function ago(iso: string | null): string {
  if (!iso) return 'nunca';
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 2) return 'agora há pouco';
  if (minutes < 60) return `há ${minutes} min`;
  if (minutes < 60 * 24) return `há ${Math.round(minutes / 60)} h`;
  return `há ${Math.round(minutes / 60 / 24)} dia(s)`;
}

export function RegisteredPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('staff_driver_overview');
    if (rpcError) {
      setError(friendlyError(rpcError));
      setRows([]);
      return;
    }
    setError(null);
    setRows(data as Row[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const shown = useMemo(() => {
    const q = normalize(search.trim());
    return (rows ?? []).filter((r) => {
      if (filter === 'online' ? !(r.is_online && r.status === 'approved') : filter !== 'all' && r.status !== filter) {
        return false;
      }
      if (!q) return true;
      const haystack = normalize(
        [r.full_name, r.phone, r.vehicle_plate, r.vehicle_model, r.cpf, r.city_name].filter(Boolean).join(' '),
      );
      return haystack.includes(q) || (r.cpf ?? '').includes(q.replace(/\D/g, '') || '§');
    });
  }, [rows, filter, search]);

  const counts = useMemo(() => {
    const all = rows ?? [];
    return {
      total: all.length,
      approved: all.filter((r) => r.status === 'approved').length,
      online: all.filter((r) => r.is_online && r.status === 'approved').length,
      locked: all.filter((r) => r.status === 'suspended' || r.status === 'blocked').length,
    };
  }, [rows]);

  return (
    <>
      <div>
        <h1>Motoristas cadastrados</h1>
        <p className="hint">
          {rows
            ? `${counts.total} cadastrados · ${counts.approved} aprovados · ${counts.online} online agora · ${counts.locked} travados ou bloqueados`
            : 'Todos os motoristas, com as informações e a opção de travar ou destravar a conta.'}
        </p>
      </div>

      <div className="row">
        <label className="field" style={{ minWidth: 260, flex: 1 }}>
          Buscar (nome, telefone, placa, CPF, cidade)
          <input value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label className="field" style={{ minWidth: 220 }}>
          Mostrar
          <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
            {FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? <div className="msg error">{error}</div> : null}
      {rows === null && !error ? <p className="hint">Carregando...</p> : null}
      {rows && shown.length === 0 && !error ? <p className="hint">Nenhum motorista nessa busca.</p> : null}
      {shown.map((row) => (
        <DriverCard key={row.driver_id} row={row} onChanged={load} />
      ))}
    </>
  );
}

function DriverCard({ row, onChanged }: { row: Row; onChanged: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const name = row.full_name ?? 'Sem nome';
  const locked = row.status === 'suspended' || row.status === 'blocked';

  async function lock() {
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.rpc('staff_lock_driver', { p_driver: row.driver_id, p_reason: reason });
    setBusy(false);
    if (error) {
      setMsg({ kind: 'error', text: friendlyError(error) });
      return;
    }
    setAsking(false);
    setReason('');
    await onChanged();
  }

  async function unlock() {
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.rpc('staff_unlock_driver', { p_driver: row.driver_id });
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
          <h2>
            {name}{' '}
            <span className={`badge ${row.status === 'suspended' ? 'blocked' : row.status}`}>{statusLabel[row.status]}</span>
            {row.is_online && row.status === 'approved' ? <span className="badge approved">Online</span> : null}
          </h2>
          <p className="hint">
            {vehicleLabel[row.vehicle_type]} · {row.vehicle_model} {row.vehicle_color} · <b>{row.vehicle_plate}</b> ·{' '}
            {row.vehicle_year} · {row.city_name} · {row.phone ?? 'sem telefone'}
          </p>
          <p className="hint">
            {row.rides_total} corrida(s) no total, {row.rides_30d} nos últimos 30 dias
            {row.rating_count > 0 ? ` · nota ${String(row.rating_avg).replace('.', ',')} (${row.rating_count})` : ' · sem notas ainda'}
          </p>
        </div>
        <button className="btn secondary" onClick={() => setOpen(!open)}>
          {open ? 'Fechar' : 'Ver informações'}
        </button>
      </div>

      {locked && row.lock_note ? (
        <p>
          <b>Motivo da trava:</b> {row.lock_note}
          {row.locked_at ? ` (em ${formatDate(row.locked_at)})` : ''}
        </p>
      ) : null}

      {open ? (
        <div className="kv">
          <span>
            <b>CPF: </b>
            {formatCpf(row.cpf)}
          </span>
          <span>
            <b>Nascimento: </b>
            {formatDate(row.birth_date)}
          </span>
          <span>
            <b>CNH: </b>
            {row.cnh_category ?? '—'}
            {row.cnh_ear ? ' com EAR' : ''}
          </span>
          <span>
            <b>Cadastro feito em: </b>
            {formatDate(row.created_at)}
          </span>
          <span>
            <b>Aprovado em: </b>
            {formatDate(row.approved_at)}
          </span>
          <span>
            <b>Última posição: </b>
            {ago(row.last_seen)}
          </span>
          {row.fee_state ? (
            <span>
              <b>Mensalidade: </b>
              {feeLabel[row.fee_state]}
              {row.fee_state !== 'ok' && row.fee_amount ? ` · ${money(row.fee_amount)}, vence em ${formatDate(row.fee_due_on)}` : ''}
            </span>
          ) : null}
        </div>
      ) : null}

      {msg ? <div className={`msg ${msg.kind}`}>{msg.text}</div> : null}

      {asking ? (
        <>
          <label className="field">
            Motivo da trava (só a equipe vê)
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: reclamação de passageiro, conversar com o motorista" />
          </label>
          <p className="hint">
            Ele deixa de receber pedidos e fica offline. As viagens agendadas que ele tinha (ainda longe da hora) voltam
            para a lista. Uma corrida que já esteja em andamento continua.
          </p>
          <div className="row">
            <button className="btn" disabled={busy} onClick={lock}>
              Travar a conta de {name}
            </button>
            <button className="btn secondary" disabled={busy} onClick={() => setAsking(false)}>
              Cancelar
            </button>
          </div>
        </>
      ) : (
        <div className="row">
          {locked ? (
            <button className="btn" disabled={busy} onClick={unlock}>
              Destravar conta
            </button>
          ) : (
            <button className="btn secondary" disabled={busy} onClick={() => setAsking(true)}>
              Travar conta
            </button>
          )}
          {row.status === 'pending' ? <span className="hint">Para aprovar, use a aba Motoristas (checklist).</span> : null}
        </div>
      )}
    </section>
  );
}
