import { useEffect, useRef, useState } from 'react';

import { friendlyError, supabase } from '../lib/supabase';

type Released = { code: string | null; code_at: string | null; expires_at: string };

const POLL_MS = 2000;
const POLL_TRIES = 22;

// Para quem não recebe o SMS (ex.: chip de operadora pequena): a equipe digita o número, o sistema pede o código
// ao login e mostra aqui, em vez de mandar o SMS. A equipe passa o código à pessoa por WhatsApp ou ligação.
export function ReleasePage() {
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [shownPhone, setShownPhone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  async function release() {
    setBusy(true);
    setError(null);
    setCode(null);
    setTimedOut(false);
    const { error: rpcError } = await supabase.rpc('staff_release_phone', { p_phone: phone });
    if (rpcError) {
      setBusy(false);
      setError(friendlyError(rpcError));
      return;
    }
    setShownPhone(phone);

    // O código chega ao banco em alguns segundos: o login chama o hook, que o guarda.
    for (let i = 0; i < POLL_TRIES && alive.current; i++) {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      const { data, error: readError } = await supabase.rpc('staff_released_code', { p_phone: phone });
      if (readError) {
        setError(friendlyError(readError));
        break;
      }
      const row = (data as Released[] | null)?.[0];
      if (row?.code) {
        if (alive.current) setCode(row.code);
        setBusy(false);
        return;
      }
    }
    if (alive.current) {
      setBusy(false);
      setTimedOut(true);
    }
  }

  async function cancel() {
    if (shownPhone) await supabase.rpc('staff_cancel_release', { p_phone: shownPhone });
    setCode(null);
    setShownPhone(null);
    setTimedOut(false);
  }

  return (
    <>
      <div>
        <h1>Liberar número</h1>
        <p className="hint">
          Para quem não recebe o SMS de entrada. Digite o celular da pessoa: o código aparece aqui em vez de ir por SMS.
          Passe o código a ela por WhatsApp ou ligação.
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
          {busy ? 'Pedindo o código...' : 'Gerar código de entrada'}
        </button>
        {error ? <div className="msg error">{error}</div> : null}
      </div>

      {code ? (
        <div className="card">
          <p className="hint">Código para {shownPhone}:</p>
          <p style={{ fontSize: 44, fontWeight: 800, letterSpacing: 8, margin: '8px 0' }}>{code}</p>
          <ol className="steps">
            <li>Peça para a pessoa abrir o app e digitar o número dela (se ainda não digitou).</li>
            <li>Na tela “Digite o código”, ela digita estes 6 números.</li>
          </ol>
          <p className="hint">
            O código vale por até 1 hora. Se a pessoa pedir outro código no app, este deixa de valer: gere de novo aqui.
          </p>
          <button type="button" className="btn" onClick={cancel}>
            Terminei
          </button>
        </div>
      ) : null}

      {timedOut ? (
        <div className="msg error">
          O código não apareceu. Se a pessoa acabou de pedir um código no app, espere 1 minuto e gere de novo. Se
          continuar, veja Authentication e Edge Functions (send-sms) no Supabase.
        </div>
      ) : null}
    </>
  );
}
