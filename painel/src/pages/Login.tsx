import { useState, type FormEvent } from 'react';

import { supabase } from '../lib/supabase';

// Entrada da equipe, com e-mail e senha. Quem não está em `staff` entra, mas o
// painel avisa que não tem acesso.
export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (signInError) {
      setError('E-mail ou senha incorretos.');
    }
  }

  return (
    <div className="login">
      <form className="card" onSubmit={submit}>
        <h1>Painel Simbora Car</h1>
        <p className="hint">Acesso só para a equipe.</p>
        <label className="field">
          E-mail
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="field">
          Senha
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error ? <div className="msg error">{error}</div> : null}
        <button className="btn" type="submit" disabled={loading || !email || !password}>
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
