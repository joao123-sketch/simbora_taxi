// Links que abrem o app já no motorista certo:
//   simboracar://motorista/CODIGO            (o botão "Já tenho o app: abrir" da página do convite)
//   https://<site>/m/CODIGO                  (o link do convite; no navegador/PWA é o endereço da própria página)
// Devolve o código do motorista ou null se o link for de outra coisa.
export function driverCodeFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/(?:simboracar:\/\/(?:\/)?motorista\/|\/m\/)([A-Za-z0-9]{4,16})(?:[/?#]|$)/);
  return match ? match[1].toUpperCase() : null;
}

// Link do convite para virar motorista: https://<app>/motorista (ou simboracar://motorista).
export function isDriverSignupUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /(?:simboracar:\/\/(?:\/)?|^https?:\/\/[^/]+\/)motorista\/?(?:[?#]|$)/.test(url);
}
