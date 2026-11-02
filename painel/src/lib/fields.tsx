import { useEffect } from 'react';

export type Msg = { kind: 'ok' | 'error'; text: string } | null;

// O aviso de "salvo" some depois de alguns segundos, para não ficar velho na tela.
// Os de erro ficam até a próxima ação.
export function useDismissOk(msg: Msg, setMsg: (value: null) => void) {
  useEffect(() => {
    if (msg?.kind !== 'ok') return;
    const timer = setTimeout(() => setMsg(null), 6000);
    return () => clearTimeout(timer);
  }, [msg, setMsg]);
}

export function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="field">
      {label}
      <input type={type} inputMode={type === 'text' ? 'decimal' : undefined} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
