import { DRIVER_TERMS } from '../../../app/src/legal/driverTerms';
import { PRIVACY, TERMS, type LegalSection } from '../../../app/src/legal/general';

function Sections({ sections }: { sections: LegalSection[] }) {
  return (
    <>
      {sections.map((item) => (
        <section key={item.title}>
          <h2>{item.title}</h2>
          <p>{item.text}</p>
        </section>
      ))}
    </>
  );
}

// /termos e /privacidade: o mesmo texto que o app mostra, aberto sem login e
// sem instalar nada (também serve de endereço para lojas e anúncios).
export function LegalPage({ kind }: { kind: 'termos' | 'privacidade' }) {
  return (
    <div className="public-page">
      <header className="public-head">
        <span className="brand">Simbora Car</span>
      </header>
      <div className="card legal">
        {kind === 'termos' ? (
          <>
            <h1>Termos de uso</h1>
            <Sections sections={TERMS} />
            <h1>Termos do motorista</h1>
            <Sections sections={DRIVER_TERMS} />
          </>
        ) : (
          <>
            <h1>Política de privacidade</h1>
            <Sections sections={PRIVACY} />
          </>
        )}
      </div>
    </div>
  );
}
