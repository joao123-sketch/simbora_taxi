import { useCallback, useEffect, useState } from 'react';

import { formatCpf, formatDate, vehicleLabel } from '../lib/format';
import { friendlyError, supabase } from '../lib/supabase';

type Status = 'pending' | 'approved' | 'suspended' | 'blocked';

type Driver = {
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
  declared_helmets: boolean | null;
  declared_leg_guard: boolean | null;
  declared_line_cutter: boolean | null;
  terms_accepted: boolean;
  cnh_ok: boolean | null;
  criminal_record_ok: boolean | null;
  crlv_ok: boolean | null;
  inspection_ok: boolean | null;
  helmets_ok: boolean | null;
  vest_delivered: boolean | null;
  leg_guard_ok: boolean | null;
  line_cutter_ok: boolean | null;
  notes: string | null;
};

type CheckKey =
  | 'cnh_ok'
  | 'criminal_record_ok'
  | 'crlv_ok'
  | 'inspection_ok'
  | 'helmets_ok'
  | 'vest_delivered'
  | 'leg_guard_ok'
  | 'line_cutter_ok';

const statusLabel: Record<Status, string> = {
  pending: 'Aguardando aprovação',
  approved: 'Aprovado',
  suspended: 'Travado',
  blocked: 'Bloqueado',
};

// O que a equipe confere antes de aprovar. Os quatro primeiros valem para todos;
// os outros quatro, só para moto.
const CAR_CHECKS: { key: CheckKey; label: string }[] = [
  { key: 'cnh_ok', label: 'CNH válida, com a observação EAR' },
  { key: 'criminal_record_ok', label: 'Antecedentes criminais' },
  { key: 'crlv_ok', label: 'Documento do veículo (CRLV) em dia' },
  { key: 'inspection_ok', label: 'Vistoria do veículo' },
];
const MOTO_CHECKS: { key: CheckKey; label: string }[] = [
  { key: 'helmets_ok', label: 'Dois capacetes' },
  { key: 'vest_delivered', label: 'Colete entregue' },
  { key: 'leg_guard_ok', label: 'Protetor de pernas' },
  { key: 'line_cutter_ok', label: 'Aparador de linha' },
];

const FILTERS: { value: Status | 'all'; label: string }[] = [
  { value: 'pending', label: 'Aguardando aprovação' },
  { value: 'approved', label: 'Aprovados' },
  { value: 'suspended', label: 'Travados' },
  { value: 'blocked', label: 'Bloqueados' },
  { value: 'all', label: 'Todos' },
];

export function DriversPage() {
  const [filter, setFilter] = useState<Status | 'all'>('pending');
  const [drivers, setDrivers] = useState<Driver[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('staff_list_drivers', {
      p_status: filter === 'all' ? null : filter,
    });
    if (rpcError) {
      setError(friendlyError(rpcError));
      setDrivers([]);
      return;
    }
    setError(null);
    setDrivers(data as Driver[]);
  }, [filter]);

  useEffect(() => {
    setDrivers(null);
    load();
  }, [load]);

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1>Motoristas</h1>
          <p className="hint">Confira os documentos na reunião, marque o checklist e aprove.</p>
        </div>
        <label className="field" style={{ minWidth: 240 }}>
          Mostrar
          <select value={filter} onChange={(e) => setFilter(e.target.value as Status | 'all')}>
            {FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? <div className="msg error">{error}</div> : null}
      {drivers === null ? <p className="hint">Carregando...</p> : null}
      {drivers?.length === 0 && !error ? <p className="hint">Nenhum motorista nessa lista.</p> : null}

      {drivers?.map((driver) => (
        <DriverCard key={driver.driver_id} driver={driver} onChanged={load} />
      ))}
    </>
  );
}

function DriverCard({ driver, onChanged }: { driver: Driver; onChanged: () => Promise<void> }) {
  const [open, setOpen] = useState(driver.status === 'pending');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState(driver.notes ?? '');
  const [checks, setChecks] = useState<Record<string, boolean>>({});

  // Valores marcados agora (já aparecem na tela antes de o banco responder).
  const value = (key: CheckKey) => checks[key] ?? driver[key] ?? false;
  const isMoto = driver.vehicle_type === 'moto';
  const items = isMoto ? [...CAR_CHECKS, ...MOTO_CHECKS] : CAR_CHECKS;
  const complete = items.every((item) => value(item.key)) && driver.terms_accepted && driver.cpf !== null;

  async function toggle(key: CheckKey) {
    const next = !value(key);
    setChecks((c) => ({ ...c, [key]: next }));
    setError(null);
    const { error: rpcError } = await supabase.rpc('staff_set_checklist', {
      p_driver: driver.driver_id,
      p_patch: { [key]: next },
    });
    if (rpcError) {
      setChecks((c) => ({ ...c, [key]: !next }));
      setError(friendlyError(rpcError));
    }
  }

  async function saveNotes() {
    if (notes === (driver.notes ?? '')) return;
    setError(null);
    const { error: rpcError } = await supabase.rpc('staff_set_checklist', {
      p_driver: driver.driver_id,
      p_patch: { notes },
    });
    if (rpcError) setError(friendlyError(rpcError));
    else setDone('Observação salva.');
  }

  async function setStatus(status: Status, question?: string) {
    if (question && !window.confirm(question)) return;
    setBusy(true);
    setError(null);
    setDone(null);
    // Travar e destravar passam pelas funções próprias (guardam o motivo e soltam as viagens agendadas).
    const lock = status === 'suspended';
    const unlock = status === 'approved' && driver.status !== 'pending';
    let { error: rpcError } = lock
      ? await supabase.rpc('staff_lock_driver', { p_driver: driver.driver_id })
      : unlock
        ? await supabase.rpc('staff_unlock_driver', { p_driver: driver.driver_id })
        : await supabase.rpc('staff_set_driver_status', { p_driver: driver.driver_id, p_status: status });
    // Banco sem as funções novas de travar e destravar (SQL ainda não aplicado): usa a troca de situação simples.
    if ((lock || unlock) && rpcError?.code === 'PGRST202') {
      ({ error: rpcError } = await supabase.rpc('staff_set_driver_status', {
        p_driver: driver.driver_id,
        p_status: status,
      }));
    }
    setBusy(false);
    if (rpcError) {
      // A trava do banco explica o que falta quando a aprovação é recusada.
      setError(friendlyError(rpcError));
      return;
    }
    await onChanged();
  }

  const name = driver.full_name ?? 'Sem nome';

  return (
    <section className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h2>
            {name} <span className={`badge ${driver.status}`}>{statusLabel[driver.status]}</span>
          </h2>
          <p className="hint">
            {vehicleLabel[driver.vehicle_type]} · {driver.vehicle_model} {driver.vehicle_color} ·{' '}
            <b>{driver.vehicle_plate}</b> · {driver.vehicle_year} · {driver.city_name}
          </p>
        </div>
        <button className="btn secondary" onClick={() => setOpen(!open)}>
          {open ? 'Fechar' : 'Ver cadastro'}
        </button>
      </div>

      {open ? (
        <>
          <div className="kv">
            <span>
              <b>Telefone: </b>
              {driver.phone ?? '—'}
            </span>
            <span>
              <b>CPF: </b>
              {formatCpf(driver.cpf)}
            </span>
            <span>
              <b>Nascimento: </b>
              {formatDate(driver.birth_date)}
            </span>
            <span>
              <b>CNH: </b>
              {driver.cnh_category ?? '—'}
              {driver.cnh_ear ? ' com EAR' : ''}
            </span>
            <span>
              <b>Cadastro feito em: </b>
              {formatDate(driver.created_at)}
            </span>
            <span>
              <b>Termos aceitos: </b>
              {driver.terms_accepted ? 'sim' : 'não'}
            </span>
            {isMoto ? (
              <span>
                <b>Declarou: </b>
                capacetes {driver.declared_helmets ? 'sim' : 'não'}, protetor de pernas{' '}
                {driver.declared_leg_guard ? 'sim' : 'não'}, aparador de linha{' '}
                {driver.declared_line_cutter ? 'sim' : 'não'}
              </span>
            ) : null}
          </div>

          <div>
            <h2>Checklist da reunião</h2>
            <div className="checks">
              {items.map((item) => (
                <label className="check" key={item.key}>
                  <input type="checkbox" checked={value(item.key)} onChange={() => toggle(item.key)} />
                  {item.label}
                </label>
              ))}
            </div>
          </div>

          <label className="field">
            Observações da equipe
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={saveNotes} />
          </label>
        </>
      ) : null}

      {error ? <div className="msg error">{error}</div> : null}
      {done ? <div className="msg ok">{done}</div> : null}

      <div className="row">
        {driver.status === 'pending' ? (
          <button className="btn" disabled={busy} onClick={() => setStatus('approved')}>
            Aprovar motorista
          </button>
        ) : null}
        {driver.status === 'pending' && !complete ? (
          <span className="hint">Falta marcar tudo no checklist para aprovar.</span>
        ) : null}
        {driver.status === 'suspended' || driver.status === 'blocked' ? (
          <button className="btn" disabled={busy} onClick={() => setStatus('approved')}>
            Destravar
          </button>
        ) : null}
        {driver.status === 'approved' ? (
          <button
            className="btn secondary"
            disabled={busy}
            onClick={() => setStatus('suspended', `Travar ${name}? Ele para de receber corridas.`)}
          >
            Travar
          </button>
        ) : null}
        {driver.status !== 'blocked' ? (
          <button
            className="btn secondary"
            disabled={busy}
            onClick={() => setStatus('blocked', `Bloquear ${name}? Ele fica fora do Simbora Car.`)}
          >
            Bloquear
          </button>
        ) : null}
      </div>
    </section>
  );
}
