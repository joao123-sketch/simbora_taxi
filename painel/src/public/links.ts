// Onde a pessoa baixa o app. Enquanto as lojas não existem, fica vazio e as
// páginas públicas mostram só o nome do app. Depois de publicar, cadastre a
// variável VITE_DOWNLOAD_URL na hospedagem (e compile de novo).
export const DOWNLOAD_URL = (import.meta.env.VITE_DOWNLOAD_URL as string | undefined) || '';
