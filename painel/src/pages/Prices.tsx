import { useCallback, useEffect, useMemo, useState } from 'react';

import { money, parseDecimal, toField, todayIso, formatDate, vehicleLabel } from '../lib/format';
import { Field, useDismissOk } from '../lib/fields';
import { friendlyError, supabase } from '../lib/supabase';

type City = { id: number; name: string; state: string; active: boolean };
type Fare = {
  city_id: number;
  city_name: string;
  vehicle_type: 'car' | 'moto';
  base: number;
  per_km: number;
  per_min: number;
  effective_from: string;
};
type Settings = {
  locked: boolean;
  locked_factor: number;
  step_size: number;
  max_step: number;
  window_minutes: number;
  slow_seconds: number;
  min_requests: number;
  step_every_minutes: number;
  share_per_step: number;
  card_surcharge: number;
  delivery_discount: number;
  night_surcharge: number;
  night_from: number;
  night_until: number;
  max_factor: number;
  proposal_cap: number;
};
type DeliverySize = {
  size: 'P' | 'M' | 'G';
  name: string;
  weight: string;
  example: string;
  allow_moto: boolean;
  allow_car: boolean;
};
type Overview = {
  cities: City[];
  fares: Fare[];
  delivery_sizes: DeliverySize[];
  settings: Settings;
};

export function PricesPage() {
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
        <h1>Preços</h1>
        <p className="hint">
          Mudanças valem para os próximos pedidos. Os passageiros e os motoristas só veem o preço final.
        </p>
      </div>
      {error ? <div className="msg error">{error}</div> : null}
      {!data && !error ? <p className="hint">Carregando...</p> : null}
      {data ? (
        <>
          <SettingsCard settings={data.settings} onSaved={load} />
          <DeliverySizesCard sizes={data.delivery_sizes ?? []} onSaved={load} />
          <FaresCard data={data} onSaved={load} />
        </>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Taxa do cartão e preço dinâmico
// ---------------------------------------------------------------------------

function SettingsCard({ settings, onSaved }: { settings: Settings; onSaved: () => Promise<void> }) {
  const percent = (v: number) => toField(Math.round(v * 1000) / 10);
  const [card, setCard] = useState(percent(settings.card_surcharge));
  const [deliveryDiscount, setDeliveryDiscount] = useState(percent(settings.delivery_discount));
  const [locked, setLocked] = useState(settings.locked);
  const [lockedFactor, setLockedFactor] = useState(toField(settings.locked_factor));
  const [stepSize, setStepSize] = useState(percent(settings.step_size));
  const [maxStep, setMaxStep] = useState(String(settings.max_step));
  const [windowMin, setWindowMin] = useState(String(settings.window_minutes));
  const [slowSec, setSlowSec] = useState(String(settings.slow_seconds));
  const [minRequests, setMinRequests] = useState(String(settings.min_requests));
  const [stepEvery, setStepEvery] = useState(String(settings.step_every_minutes));
  const [share, setShare] = useState(percent(settings.share_per_step));
  const [nightSurcharge, setNightSurcharge] = useState(percent(settings.night_surcharge));
  const [nightFrom, setNightFrom] = useState(String(settings.night_from));
  const [nightUntil, setNightUntil] = useState(String(settings.night_until));
  const [maxFactor, setMaxFactor] = useState(toField(settings.max_factor));
  const [proposalCap, setProposalCap] = useState(percent(settings.proposal_cap));
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  useDismissOk(msg, setMsg);
  const [busy, setBusy] = useState(false);

  const stepNumber = parseDecimal(stepSize);
  const maxNumber = parseDecimal(maxStep);
  const ceiling = stepNumber !== null && maxNumber !== null ? 1 + (stepNumber / 100) * maxNumber : null;

  async function save() {
    const numbers = {
      card_surcharge: parseDecimal(card),
      delivery_discount: parseDecimal(deliveryDiscount),
      locked_factor: parseDecimal(lockedFactor),
      step_size: parseDecimal(stepSize),
      max_step: parseDecimal(maxStep),
      window_minutes: parseDecimal(windowMin),
      slow_seconds: parseDecimal(slowSec),
      min_requests: parseDecimal(minRequests),
      step_every_minutes: parseDecimal(stepEvery),
      share_per_step: parseDecimal(share),
      night_surcharge: parseDecimal(nightSurcharge),
      night_from: parseDecimal(nightFrom),
      night_until: parseDecimal(nightUntil),
      max_factor: parseDecimal(maxFactor),
      proposal_cap: parseDecimal(proposalCap),
    };
    if (Object.values(numbers).some((n) => n === null)) {
      setMsg({ kind: 'error', text: 'Preencha todos os campos com números.' });
      return;
    }
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.rpc('staff_set_pricing_settings', {
      p_patch: {
        locked,
        locked_factor: numbers.locked_factor,
        card_surcharge: numbers.card_surcharge! / 100,
        delivery_discount: numbers.delivery_discount! / 100,
        step_size: numbers.step_size! / 100,
        max_step: numbers.max_step,
        window_minutes: numbers.window_minutes,
        slow_seconds: numbers.slow_seconds,
        min_requests: numbers.min_requests,
        step_every_minutes: numbers.step_every_minutes,
        share_per_step: numbers.share_per_step! / 100,
        night_surcharge: numbers.night_surcharge! / 100,
        night_from: numbers.night_from,
        night_until: numbers.night_until,
        max_factor: numbers.max_factor,
        proposal_cap: numbers.proposal_cap! / 100,
      },
    });
    setBusy(false);
    if (error) {
      setMsg({ kind: 'error', text: friendlyError(error) });
      return;
    }
    setMsg({ kind: 'ok', text: 'Configurações salvas.' });
    await onSaved();
  }

  return (
    <section className="card">
      <div>
        <h2>Taxa do cartão, entrega e preço dinâmico</h2>
        <p className="hint">
          O preço sobe em degraus só quando faltam carros: se pelo menos o mínimo de pedidos esperou mais que o
          tempo de "pedido lento", o fator sobe um degrau. Nunca há desconto.
        </p>
      </div>
      <div className="grid">
        <Field label="Taxa do cartão (%)" value={card} onChange={setCard} />
        <Field label="Desconto da entrega (%)" value={deliveryDiscount} onChange={setDeliveryDiscount} />
        <Field label="Tamanho de cada degrau (%)" value={stepSize} onChange={setStepSize} />
        <Field label="Número máximo de degraus" value={maxStep} onChange={setMaxStep} />
        <Field label="Pedido é lento depois de (segundos)" value={slowSec} onChange={setSlowSec} />
        <Field label="Olhar os últimos (minutos)" value={windowMin} onChange={setWindowMin} />
        <Field label="Mínimo de pedidos para subir" value={minRequests} onChange={setMinRequests} />
        <Field label="Parcela de pedidos lentos por degrau (%)" value={share} onChange={setShare} />
        <Field label="Tempo mínimo entre degraus (minutos)" value={stepEvery} onChange={setStepEvery} />
      </div>
      <h2>Adicional noturno e teto</h2>
      <p className="hint">
        Vale só nas corridas dentro da cidade, junto com o preço dinâmico, e o total nunca passa do teto abaixo. Não
        aparece para o passageiro nem para o motorista: eles só veem o preço final.
      </p>
      <div className="grid">
        <Field label="Adicional noturno (%)" value={nightSurcharge} onChange={setNightSurcharge} />
        <Field label="Noturno começa às (hora, 0 a 23)" value={nightFrom} onChange={setNightFrom} />
        <Field label="Noturno termina às (hora, 0 a 23)" value={nightUntil} onChange={setNightUntil} />
        <Field label="Teto do preço (× o normal)" value={maxFactor} onChange={setMaxFactor} />
      </div>
      <p className="hint">
        Teto do aumento: <b>{ceiling !== null ? `${toField(Math.round(ceiling * 100) / 100)}×` : '—'}</b>
      </p>
      <h2>Viagem para outra cidade</h2>
      <p className="hint">
        O preço é calculado pela distância do endereço, na tarifa da cidade de origem. O motorista pode aceitar o
        valor ou propor um valor maior, até o limite abaixo, e o passageiro escolhe.
      </p>
      <div className="grid">
        <Field label="Limite da proposta do motorista (% acima do calculado)" value={proposalCap} onChange={setProposalCap} />
      </div>
      <label className="check">
        <input type="checkbox" checked={locked} onChange={(e) => setLocked(e.target.checked)} />
        Travar o fator (o preço fica sempre multiplicado pelo valor abaixo, sem variar)
      </label>
      <div className="grid">
        <Field label="Fator quando travado (1 = preço normal)" value={lockedFactor} onChange={setLockedFactor} />
      </div>
      {msg ? <div className={`msg ${msg.kind}`}>{msg.text}</div> : null}
      <div>
        <button className="btn" disabled={busy} onClick={save}>
          Salvar configurações
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Tamanhos de pacote da entrega
// ---------------------------------------------------------------------------

function DeliverySizesCard({ sizes, onSaved }: { sizes: DeliverySize[]; onSaved: () => Promise<void> }) {
  return (
    <section className="card">
      <div>
        <h2>Tamanhos de pacote (entrega)</h2>
        <p className="hint">
          O nome, a faixa de peso e o exemplo aparecem para quem pede a entrega e para o motorista. Marque quais
          veículos levam cada tamanho. O desconto da entrega fica na configuração de preços acima.
        </p>
      </div>
      {sizes.length === 0 ? <p className="hint">Os tamanhos aparecem depois que o banco for atualizado.</p> : null}
      {sizes.map((size) => (
        <SizeRow key={size.size} size={size} onSaved={onSaved} />
      ))}
    </section>
  );
}

function SizeRow({ size, onSaved }: { size: DeliverySize; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(size.name);
  const [weight, setWeight] = useState(size.weight);
  const [example, setExample] = useState(size.example);
  const [moto, setMoto] = useState(size.allow_moto);
  const [car, setCar] = useState(size.allow_car);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  useDismissOk(msg, setMsg);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.rpc('staff_set_delivery_size', {
      p_size: size.size,
      p_name: name,
      p_weight: weight,
      p_example: example,
      p_allow_moto: moto,
      p_allow_car: car,
    });
    setBusy(false);
    if (error) {
      setMsg({ kind: 'error', text: friendlyError(error) });
      return;
    }
    setMsg({ kind: 'ok', text: 'Tamanho salvo.' });
    await onSaved();
  }

  return (
    <details open>
      <summary>
        Tamanho {size.size}: {size.name}
      </summary>
      <div className="grid">
        <label className="field">
          Nome
          <input value={name} maxLength={30} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          Faixa de peso
          <input value={weight} maxLength={40} onChange={(e) => setWeight(e.target.value)} />
        </label>
        <label className="field">
          Exemplo
          <input value={example} maxLength={160} onChange={(e) => setExample(e.target.value)} />
        </label>
      </div>
      <label className="check">
        <input type="checkbox" checked={moto} onChange={(e) => setMoto(e.target.checked)} />
        Moto leva
      </label>
      <label className="check">
        <input type="checkbox" checked={car} onChange={(e) => setCar(e.target.checked)} />
        Carro leva
      </label>
      {msg ? <div className={`msg ${msg.kind}`}>{msg.text}</div> : null}
      <div>
        <button className="btn" disabled={busy || (!moto && !car)} onClick={save}>
          Salvar tamanho {size.size}
        </button>
      </div>
    </details>
  );
}

// ---------------------------------------------------------------------------
// Tarifas dentro da cidade
// ---------------------------------------------------------------------------

function FaresCard({ data, onSaved }: { data: Overview; onSaved: () => Promise<void> }) {
  const today = todayIso();

  // A tarifa em vigor de cada cidade e veículo: a mais recente que já começou.
  const current = useMemo(() => {
    const map = new Map<string, Fare>();
    for (const fare of data.fares) {
      if (fare.effective_from > today) continue;
      const key = `${fare.city_id}-${fare.vehicle_type}`;
      const existing = map.get(key);
      if (!existing || fare.effective_from > existing.effective_from) map.set(key, fare);
    }
    return [...map.values()];
  }, [data.fares, today]);

  const activeCities = data.cities.filter((c) => c.active);
  const [cityId, setCityId] = useState<number>(activeCities[0]?.id ?? data.cities[0]?.id ?? 0);
  const [vehicle, setVehicle] = useState<'car' | 'moto'>('car');
  const base = current.find((f) => f.city_id === cityId && f.vehicle_type === vehicle);
  const [fields, setFields] = useState({ base: '', per_km: '', per_min: '' });
  const [from, setFrom] = useState(today);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  useDismissOk(msg, setMsg);
  const [busy, setBusy] = useState(false);

  // Ao trocar de cidade ou veículo, o formulário parte da tarifa atual.
  useEffect(() => {
    setFields({
      base: toField(base?.base),
      per_km: toField(base?.per_km),
      per_min: toField(base?.per_min),
    });
  }, [base?.city_id, base?.vehicle_type, base?.effective_from, base?.base, base?.per_km, base?.per_min]);

  async function save() {
    const values = {
      base: parseDecimal(fields.base),
      per_km: parseDecimal(fields.per_km),
      per_min: parseDecimal(fields.per_min),
    };
    if (Object.values(values).some((v) => v === null)) {
      setMsg({ kind: 'error', text: 'Preencha os três valores com números.' });
      return;
    }
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.rpc('staff_add_fare', {
      p_city_id: cityId,
      p_vehicle_type: vehicle,
      p_base: values.base,
      p_per_km: values.per_km,
      p_per_min: values.per_min,
      p_effective_from: from,
    });
    setBusy(false);
    if (error) {
      setMsg({ kind: 'error', text: friendlyError(error) });
      return;
    }
    setMsg({
      kind: 'ok',
      text: from > today ? `Nova tarifa salva. Vale a partir de ${formatDate(from)}.` : 'Nova tarifa salva. Já vale.',
    });
    await onSaved();
  }

  return (
    <section className="card">
      <div>
        <h2>Tarifas dentro da cidade</h2>
        <p className="hint">
          Preço = bandeirada + valor por km + valor por minuto (sem valor mínimo). Para mudar, crie uma tarifa
          nova com a data em que passa a valer: a antiga fica no histórico.
        </p>
      </div>

      <table>
        <thead>
          <tr>
            <th>Cidade</th>
            <th>Veículo</th>
            <th>Bandeirada</th>
            <th>Por km</th>
            <th>Por minuto</th>
                        <th>Vale desde</th>
          </tr>
        </thead>
        <tbody>
          {current.map((f) => (
            <tr key={`${f.city_id}-${f.vehicle_type}`}>
              <td>{f.city_name}</td>
              <td>{vehicleLabel[f.vehicle_type]}</td>
              <td>{money(f.base)}</td>
              <td>{money(f.per_km)}</td>
              <td>{money(f.per_min)}</td>
                            <td>{formatDate(f.effective_from)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Nova tarifa</h2>
      <div className="grid">
        <label className="field">
          Cidade
          <select value={cityId} onChange={(e) => setCityId(Number(e.target.value))}>
            {data.cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Veículo
          <select value={vehicle} onChange={(e) => setVehicle(e.target.value as 'car' | 'moto')}>
            <option value="car">Carro</option>
            <option value="moto">Moto</option>
          </select>
        </label>
        <Field label="Bandeirada (R$)" value={fields.base} onChange={(v) => setFields({ ...fields, base: v })} />
        <Field label="Por km (R$)" value={fields.per_km} onChange={(v) => setFields({ ...fields, per_km: v })} />
        <Field label="Por minuto (R$)" value={fields.per_min} onChange={(v) => setFields({ ...fields, per_min: v })} />
        <label className="field">
          Vale a partir de
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
      </div>
      {msg ? <div className={`msg ${msg.kind}`}>{msg.text}</div> : null}
      <div>
        <button className="btn" disabled={busy || !from} onClick={save}>
          Salvar tarifa
        </button>
      </div>

      <details>
        <summary>Histórico de tarifas</summary>
        <table>
          <thead>
            <tr>
              <th>Cidade</th>
              <th>Veículo</th>
              <th>Bandeirada</th>
              <th>Por km</th>
              <th>Por minuto</th>
                            <th>Vale desde</th>
            </tr>
          </thead>
          <tbody>
            {data.fares.map((f) => (
              <tr key={`${f.city_id}-${f.vehicle_type}-${f.effective_from}`}>
                <td>{f.city_name}</td>
                <td>{vehicleLabel[f.vehicle_type]}</td>
                <td>{money(f.base)}</td>
                <td>{money(f.per_km)}</td>
                <td>{money(f.per_min)}</td>
                                <td>{formatDate(f.effective_from)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
