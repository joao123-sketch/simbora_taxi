import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { configured } from './lib/supabase';
import { DriverInvitePage } from './public/DriverInvite';
import { SharedRidePage } from './public/SharedRide';
import './styles.css';

// Páginas públicas, sem login: /t/CODIGO (trajeto compartilhado) e
// /m/CODIGO (convite do motorista). Tudo o mais é o painel da equipe.
function Root() {
  const [, kind, code] = window.location.pathname.split('/');
  if (configured && code && kind === 't') return <SharedRidePage code={code} />;
  if (configured && code && kind === 'm') return <DriverInvitePage code={code} />;
  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
