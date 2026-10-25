import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

import { configured, supabase } from './lib/supabase';
import { DriversPage } from './pages/Drivers';
import { FeesPage } from './pages/Fees';
import { LoginPage } from './pages/Login';
import { PricesPage } from './pages/Prices';
import { ReportsPage } from './pages/Reports';

type Tab = 'drivers' | 'fees' | 'reports' | 'prices';

export function App() {
  // undefined = ainda descobrindo se há alguém logado.
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  // null = ainda perguntando ao banco se a pessoa é da equipe.
  const [isStaff, setIsStaff] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>('drivers');

  useEffect(() => {
    if (!configured) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setIsStaff(null);
      return;
    }
    setIsStaff(null);
    supabase.rpc('staff_me').then(({ data, error }) => setIsStaff(!error && data === true));
  }, [session?.user.id]);

  if (!configured) {
    return (
      <div className="login">
        <div className="card">
          <h1>Painel Simbora Car</h1>
          <p className="msg error">
            Faltam as variáveis VITE_SUPABASE_URL e VITE_SUPABASE_KEY. Veja o arquivo .env.example.
          </p>
        </div>
      </div>
    );
  }

  if (session === undefined) return null;
  if (!session) return <LoginPage />;

  if (isStaff === null) {
    return (
      <div className="login">
        <p className="hint">Conferindo seu acesso...</p>
      </div>
    );
  }

  if (!isStaff) {
    return (
      <div className="login">
        <div className="card">
          <h1>Sem acesso</h1>
          <p className="hint">
            O usuário {session.user.email} não está na equipe do Simbora Car. Peça para liberarem o seu acesso.
          </p>
          <button className="btn secondary" onClick={() => supabase.auth.signOut()}>
            Sair
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <header className="topbar">
        <span className="brand">Simbora Car · Painel</span>
        <nav className="tabs">
          <button className={`tab ${tab === 'drivers' ? 'active' : ''}`} onClick={() => setTab('drivers')}>
            Motoristas
          </button>
          <button className={`tab ${tab === 'fees' ? 'active' : ''}`} onClick={() => setTab('fees')}>
            Mensalidades
          </button>
          <button className={`tab ${tab === 'reports' ? 'active' : ''}`} onClick={() => setTab('reports')}>
            Relatórios
          </button>
          <button className={`tab ${tab === 'prices' ? 'active' : ''}`} onClick={() => setTab('prices')}>
            Preços
          </button>
        </nav>
        <span className="hint">{session.user.email}</span>
        <button className="btn secondary" onClick={() => supabase.auth.signOut()}>
          Sair
        </button>
      </header>
      <main className="page">{tab === 'drivers' ? (
          <DriversPage />
        ) : tab === 'fees' ? (
          <FeesPage />
        ) : tab === 'reports' ? (
          <ReportsPage />
        ) : (
          <PricesPage />
        )}</main>
    </>
  );
}
