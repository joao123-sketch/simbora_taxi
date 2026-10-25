import { useEffect, useState } from 'react';

import { supabase } from '../lib/supabase';
import { DOWNLOAD_URL } from './links';

type Invite = {
  first_name: string;
  vehicle_type: 'car' | 'moto';
  vehicle_model: string;
  vehicle_color: string;
};

// Página aberta pelo QR ou pelo link do motorista: quem recebe ainda pode não
// ter o app, então explica como pedir corridas com ele.
export function DriverInvitePage({ code }: { code: string }) {
  const clean = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const [invite, setInvite] = useState<Invite | null | undefined>(undefined);

  useEffect(() => {
    supabase.rpc('driver_invite', { p_code: clean }).then(({ data, error }) => {
      setInvite(error ? null : ((data as Invite[])[0] ?? null));
    });
  }, [clean]);

  if (invite === undefined) {
    return <div className="public-page"><p className="hint">Carregando...</p></div>;
  }

  if (invite === null) {
    return (
      <div className="public-page">
        <div className="card">
          <h1>Código não encontrado</h1>
          <p className="hint">Peça o código de novo ao seu motorista.</p>
        </div>
      </div>
    );
  }

  const vehicle = `${invite.vehicle_type === 'moto' ? 'Moto' : 'Carro'} ${invite.vehicle_model}, ${invite.vehicle_color.toLowerCase()}`;

  return (
    <div className="public-page">
      <header className="public-head">
        <span className="brand">Simbora Car</span>
      </header>
      <div className="card">
        <h1>Peça corridas com {invite.first_name}</h1>
        <p className="hint">{vehicle}</p>
        <p>Seu código de motorista:</p>
        <p className="invite-code">{clean}</p>
        <ol className="steps">
          <li>{DOWNLOAD_URL ? <a href={DOWNLOAD_URL}>Baixe o Simbora Car</a> : 'Instale o Simbora Car (em breve nas lojas).'}</li>
          <li>Entre com o seu celular.</li>
          <li>Toque em “Meus motoristas” e digite o código acima, ou leia o QR do motorista.</li>
        </ol>
        <p className="hint">Quando {invite.first_name} estiver online, os seus pedidos chegam primeiro para ele.</p>
        <a className="btn" href={`simboracar://motorista/${clean}`}>
          Já tenho o app: abrir
        </a>
      </div>
    </div>
  );
}
