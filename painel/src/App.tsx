import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

import { configured, supabase } from './lib/supabase';
import { DriversPage } from './pages/Drivers';
import { FeesPage } from './pages/Fees';
import { LoginPage } from './pages/Login';
import { CitiesPage } from './pages/Cities';
import { PricesPage } from './pages/Prices';
import { PassengersPage } from './pages/Passengers';
import { RegisteredPage } from './pages/Registered';
import { ReportsPage } from './pages/Reports';

const TABS = [
  { id: 'drivers', label: 'Motoristas', Page: DriversPage },
  { id: 'registered', label: 'Cadastrados', Page: RegisteredPage },
  { id: 'passengers', label: 'Passageiros', Page: PassengersPage },
  { id: 'fees', label: 'Mensalidades', Page: FeesPage },
  { id: 'reports', label: 'Relatórios', Page: ReportsPage },
  { id: 'prices', label: 'Preços', Page: PricesPage },
  { id: 'cities', label: 'Cidades', Page: CitiesPage },
] as const;

type Tab = (typeof TABS)[number]['id'];

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

  const ActivePage = TABS.find((t) => t.id === tab)!.Page;

  return (
    <>
      <header className="topbar">
        <span className="brand">Simbora Car · Painel</span>
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
        <span className="hint">{session.user.email}</span>
        <button className="btn secondary" onClick={() => supabase.auth.signOut()}>
          Sair
        </button>
      </header>
      <main className="page">
        <ActivePage />
      </main>
    </>
  );
}
