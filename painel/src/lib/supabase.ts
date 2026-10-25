import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_KEY as string | undefined;

// Sem as duas variáveis o painel mostra um aviso em vez de uma tela em branco.
export const configured = Boolean(url && key);

// A chave é a publishable (pública, a mesma do app): quem decide o que cada
// pessoa pode fazer é o banco, pelas funções `staff_*`.
export const supabase = createClient(url ?? 'http://invalido.local', key ?? 'invalida');

// As mensagens que o banco escreve de propósito vêm em português; o resto vira
// um aviso genérico.
export function friendlyError(error: { code?: string; message?: string } | null | undefined): string {
  if (!error) return 'Algo deu errado. Tente de novo.';
  if (error.code === 'P0001' && error.message) return error.message;
  // PGRST202: o painel chamou uma função que o banco ainda não tem (falta rodar o SQL da última atualização).
  if (error.code === 'PGRST202') {
    return 'O banco ainda não tem essa função: falta rodar no Supabase o SQL da última atualização do painel.';
  }
  return 'Não foi possível concluir agora. Confira a internet e tente de novo.';
}
