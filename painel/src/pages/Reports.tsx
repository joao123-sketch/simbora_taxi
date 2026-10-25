import { useCallback, useEffect, useState } from 'react';

import { formatDate, money, vehicleLabel } from '../lib/format';
import { friendlyError, supabase } from '../lib/supabase';

type Alert = {
  driver_id: string;
  driver_name: string | null;
  vehicle_type: 'car' | 'moto';
  vehicle_plate: string;
  period_start: string;
  period_end: string;
  rides: number;
  min_rides: number;
  ended: boolean;
  days_left: number;
  on_pace: boolean;
};

type FugaDriver = {
  driver_id: string;
  driver_name: string | null;
  vehicle_type: 'car' | 'moto';
  vehicle_plate: string;
  rides_30d: number;
  rides_prev_30d: number;
  online_hours_30d: number;
  monthly_fee: number | null;
  fee_per_ride: number | null;
  few_rides_many_hours: boolean;
  rides_dropped: boolean;
};

type Pair = {
  passenger_name: string | null;
  driver_name: string | null;
  driver_id: string;
  rides_before: number;
  last_ride_on: string;
};

type Fuga = {
  drivers: FugaDriver[];
  pairs: Pair[];
  limits: { online_hours: number; few_rides: number; pair_min_rides: number };
};

type Review = {
  driver_id: string;
  driver_name: string | null;
  vehicle_type: 'car' | 'moto';
  vehicle_plate: string;
  status: string;
  last_reviewed_on: string;
  next_review_on: string;
  days_left: number;
  notes: string | null;
};

export function ReportsPage() {
  return (
    <>
      <div>
        <h1>Relatórios</h1>
        <p className="hint">Para a equipe conversar com os motoristas. Nada aqui aparece para eles no app.</p>
      </div>
      <Month3Card />
      <FugaCard />
      <ReviewCard />
    </>
  );
}

// ---------------------------------------------------------------------------
// Alerta a partir do mês 3
// ---------------------------------------------------------------------------

function Month3Card() {
  const [rows, setRows] = useState<Alert[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.rpc('staff_month3_alerts').then(({ data, error: rpcError }) => {
      if (rpcError) setError(friendlyError(rpcError));
      else setRows(data as Alert[]);
    });
  }, []);

  return (
    <section className="card">
      <div>
        <h2>Alerta do mês 3 em diante</h2>
        <p className="hint">
          Quem já está na mensalidade padrão e fez menos de 10 corridas no mês pede uma conversa da equipe, antes de
          qualquer outra medida. Mês em andamento mostra se o ritmo está abaixo do necessário.
        </p>
      </div>
      {error ? <div className="msg error">{error}</div> : null}
      {rows === null && !error ? <p className="hint">Carregando...</p> : null}
      {rows?.length === 0 ? <p className="hint">Ninguém chegou ao mês 3 ainda.</p> : null}
      {rows && rows.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>Motorista</th>
              <th>Mês</th>
              <th>Corridas</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.driver_id}>
                <td>
                  {row.driver_name ?? 'Motorista'}
                  <div className="hint">
                    {vehicleLabel[row.vehicle_type]} · {row.vehicle_plate}
                  </div>
                </td>
                <td>
                  {formatDate(row.period_start)} a {formatDate(row.period_end)}
                </td>
                <td>
                  {row.rides} de {row.min_rides}
                </td>
                <td>
                  {row.ended ? (
                    row.rides < row.min_rides ? (
                      <span className="badge blocked">Conversar</span>
                    ) : (
                      <span className="badge approved">Ok</span>
                    )
                  ) : row.on_pace ? (
                    <span className="badge approved">No ritmo ({row.days_left} dias restantes)</span>
                  ) : (
                    <span className="badge pending">Abaixo do ritmo ({row.days_left} dias restantes)</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Fuga
// ---------------------------------------------------------------------------

function FugaCard() {
  const [data, setData] = useState<Fuga | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.rpc('staff_fuga_report').then(({ data: result, error: rpcError }) => {
      if (rpcError) setError(friendlyError(rpcError));
      else setData(result as Fuga);
    });
  }, []);

  const limits = data?.limits;

  return (
    <section className="card">
      <div>
        <h2>Relatório de fuga</h2>
        <p className="hint">
          Sinais de que o motorista pode estar combinando corridas por fora do app, últimos 30 dias contra os 30 dias
          anteriores.
          {limits
            ? ` Marcamos quem ficou ${limits.online_hours} horas ou mais online com ${limits.few_rides} corridas ou menos, e quem caiu mais da metade das corridas.`
            : ''}
        </p>
      </div>
      {error ? <div className="msg error">{error}</div> : null}
      {!data && !error ? <p className="hint">Carregando...</p> : null}
      {data && data.drivers.length === 0 ? <p className="hint">Nenhum motorista aprovado ainda.</p> : null}
      {data && data.drivers.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>Motorista</th>
              <th>Corridas (30 dias)</th>
              <th>Antes</th>
              <th>Horas online</th>
              <th>Mensalidade</th>
              <th>Por corrida</th>
              <th>Sinal</th>
            </tr>
          </thead>
          <tbody>
            {data.drivers.map((row) => (
              <tr key={row.driver_id}>
                <td>
                  {row.driver_name ?? 'Motorista'}
                  <div className="hint">
                    {vehicleLabel[row.vehicle_type]} · {row.vehicle_plate}
                  </div>
                </td>
                <td>{row.rides_30d}</td>
                <td>{row.rides_prev_30d}</td>
                <td>{row.online_hours_30d}</td>
                <td>{row.monthly_fee !== null ? money(row.monthly_fee) : 'mês grátis'}</td>
                <td>{row.fee_per_ride !== null ? money(row.fee_per_ride) : '—'}</td>
                <td>
                  {row.few_rides_many_hours ? <span className="badge blocked">Muito online, poucas corridas</span> : null}
                  {row.rides_dropped ? <span className="badge pending">Queda de corridas</span> : null}
                  {!row.few_rides_many_hours && !row.rides_dropped ? '—' : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {data ? (
        <>
          <h3>Duplas que pararam de aparecer</h3>
          <p className="hint">
            Passageiro e motorista com {data.limits.pair_min_rides} corridas ou mais entre 90 e 30 dias atrás e nenhuma
            nos últimos 30.
          </p>
          {data.pairs.length === 0 ? <p className="hint">Nenhuma dupla nessa situação.</p> : null}
          {data.pairs.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th>Passageiro</th>
                  <th>Motorista</th>
                  <th>Corridas antes</th>
                  <th>Última corrida</th>
                </tr>
              </thead>
              <tbody>
                {data.pairs.map((pair) => (
                  <tr key={`${pair.driver_id}-${pair.passenger_name}-${pair.last_ride_on}`}>
                    <td>{pair.passenger_name ?? '—'}</td>
                    <td>{pair.driver_name ?? '—'}</td>
                    <td>{pair.rides_before}</td>
                    <td>{formatDate(pair.last_ride_on)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Reavaliação semestral
// ---------------------------------------------------------------------------

function ReviewCard() {
  const [rows, setRows] = useState<Review[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('staff_review_list', { p_days: 30 });
    if (rpcError) {
      setError(friendlyError(rpcError));
      return;
    }
    setError(null);
    setRows(data as Review[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section className="card">
      <div>
        <h2>Reavaliação semestral</h2>
        <p className="hint">
          Quem vence nos próximos 30 dias, ou já venceu. Depois de conferir o motorista (documentos, veículo, conversa),
          registre a reavaliação: a próxima vem 6 meses depois. O motorista não vê isso no app.
        </p>
      </div>
      {error ? <div className="msg error">{error}</div> : null}
      {rows === null && !error ? <p className="hint">Carregando...</p> : null}
      {rows?.length === 0 ? <p className="hint">Ninguém vence nos próximos 30 dias.</p> : null}
      {rows?.map((row) => (
        <ReviewRow key={row.driver_id} row={row} onSaved={load} />
      ))}
    </section>
  );
}

function ReviewRow({ row, onSaved }: { row: Review; onSaved: () => Promise<void> }) {
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function register() {
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.rpc('staff_register_review', { p_driver: row.driver_id, p_notes: notes });
    setBusy(false);
    if (error) {
      setMsg(friendlyError(error));
      return;
    }
    await onSaved();
  }

  return (
    <details>
      <summary>
        {row.driver_name ?? 'Motorista'} · {vehicleLabel[row.vehicle_type]} {row.vehicle_plate} ·{' '}
        {row.days_left < 0
          ? `venceu há ${-row.days_left} dia(s)`
          : row.days_left === 0
            ? 'vence hoje'
            : `vence em ${row.days_left} dia(s)`}
      </summary>
      <p className="hint">
        Última reavaliação em {formatDate(row.last_reviewed_on)}; vence em {formatDate(row.next_review_on)}.
        {row.notes ? ` Observação anterior: ${row.notes}` : ''}
      </p>
      <label className="field">
        Observação desta reavaliação (opcional)
        <input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      {msg ? <div className="msg error">{msg}</div> : null}
      <div>
        <button className="btn" disabled={busy} onClick={register}>
          Registrar reavaliação feita hoje
        </button>
      </div>
    </details>
  );
}
