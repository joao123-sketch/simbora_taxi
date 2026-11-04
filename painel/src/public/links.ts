// Onde a pessoa baixa o app. Enquanto as lojas não existem, fica vazio e as
// páginas públicas mostram só o nome do app. Depois de publicar, cadastre a
// variável VITE_DOWNLOAD_URL na hospedagem (e compile de novo).
export const DOWNLOAD_URL = (import.meta.env.VITE_DOWNLOAD_URL as string | undefined) || '';

// Endereço do app (onde a pessoa já entrou). O botão "Já tenho o app" abre o convite aqui: o app lê o código
// do endereço e põe o motorista nos favoritos. Troque por VITE_APP_URL quando houver domínio próprio.
export const APP_URL = (
  (import.meta.env.VITE_APP_URL as string | undefined) || 'https://simbora-app.joaovictordesouza123-9.workers.dev'
).replace(/\/+$/, '');
