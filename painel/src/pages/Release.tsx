import { useEffect, useState } from 'react';

import { friendlyError, supabase } from '../lib/supabase';

type Released = { code: string | null; code_at: string | null; expires_at: string };

const POLL_MS = 3000;

function timeOf(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

// Para quem não recebe o SMS (ex.: chip de operadora pequena): a equipe libera o número aqui e a pessoa pede o
// código no app. Em vez de ir por SMS, o código aparece nesta tela (sempre o último pedido). A equipe passa o
// código à pessoa por WhatsApp ou ligação.
export function ReleasePage() {
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [shownPhone, setShownPhone] = useState<string | null>(null);
  const [released, setReleased] = useState<Released | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function release() {
    setBusy(true);
    setError(null);
    setReleased(null);
    const { error: rpcError } = await supabase.rpc('staff_release_phone', { p_phone: phone });
    setBusy(false);
    if (rpcError) {
      setError(friendlyError(rpcError));
      return;
    }
    setShownPhone(phone);
  }

  // Enquanto o número está liberado, olha a cada 3 s se chegou (ou mudou) o código.
  useEffect(() => {
    if (!shownPhone) return;
    let alive = true;
    const look = async () => {
      const { data, error: readError } = await supabase.rpc('staff_released_code', { p_phone: shownPhone });
      if (!alive) return;
      if (readError) {
        setError(friendlyError(readError));
        return;
      }
      const row = (data as Released[] | null)?.[0] ?? null;
      setReleased(row);
      if (!row) {
        // A liberação venceu (30 minutos).
        setShownPhone(null);
        setError('A liberação venceu. Libere o número de novo.');
      }
    };
    look();
    const timer = setInterval(look, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [shownPhone]);

  async function finish() {
    if (shownPhone) await supabase.rpc('staff_cancel_release', { p_phone: shownPhone });
    setShownPhone(null);
    setReleased(null);
  }

  return (
    <>
      <div>
        <h1>Liberar número</h1>
        <p className="hint">
          Para quem não recebe o SMS de entrada. Libere o celular da pessoa aqui e peça para ela tocar em “Receber
          código” no app. Em vez de ir por SMS, o código aparece nesta tela. Passe o código a ela por WhatsApp ou
          ligação.
        </p>
      </div>

      <div className="card">
        <label className="field">
          Celular com DDD
          <input
            type="tel"
            inputMode="tel"
            placeholder="(88) 99999-0000"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && phone.trim() && !busy && release()}
          />
        </label>
        <button type="button" className="btn" disabled={busy || !phone.trim()} onClick={release}>
          {busy ? 'Liberando...' : 'Liberar este número'}
        </button>
        {error ? <div className="msg error">{error}</div> : null}
      </div>

      {shownPhone ? (
        <div className="card">
          <p className="hint">Número liberado: {shownPhone}</p>
          {released?.code ? (
            <>
              <p style={{ fontSize: 44, fontWeight: 800, letterSpacing: 8, margin: '8px 0' }}>{released.code}</p>
              {released.code_at ? <p className="hint">Código pedido às {timeOf(released.code_at)}.</p> : null}
              <ol className="steps">
                <li>Passe estes 6 números à pessoa.</li>
                <li>Ela digita na tela “Digite o código” do app, sem pedir outro código.</li>
              </ol>
              <p className="hint">
                Se ela tocar em “Reenviar código”, este número muda sozinho aqui: use sempre o que está na tela.
              </p>
            </>
          ) : (
            <p className="hint">
              Aguardando a pessoa pedir o código no app. Peça para ela digitar o número e tocar em “Receber código”
              (ou “Reenviar código”). Ele aparece aqui em poucos segundos.
            </p>
          )}
          <button type="button" className="btn" onClick={finish}>
            Terminei
          </button>
        </div>
      ) : null}
    </>
  );
}
