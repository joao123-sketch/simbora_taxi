// Links que abrem o app já no motorista certo:
//   simboracar://motorista/CODIGO            (o botão "Já tenho o app: abrir" da página do convite)
//   https://<site>/m/CODIGO                  (o link do convite, quando as lojas existirem)
// Devolve o código do motorista ou null se o link for de outra coisa.
export function driverCodeFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/(?:simboracar:\/\/(?:\/)?motorista\/|\/m\/)([A-Za-z0-9]{4,16})(?:[/?#]|$)/);
  return match ? match[1].toUpperCase() : null;
}
