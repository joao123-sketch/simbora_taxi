import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';

import { supabase } from './supabase';

// Uma conta, um celular: ao entrar num celular novo ele "toma" a conta
// (claim_session) e os outros celulares são desconectados. Quem só reabre o app com
// o mesmo login não toma nada: só confere se ainda é o válido.

const KEY = 'simbora:claimed_session';

export const KICKED_MESSAGE = 'Sua conta foi aberta em outro celular. Você saiu aqui. Entre de novo se quiser voltar.';

// O id do login dentro do token (muda a cada login novo, não muda quando o token se renova).
export function sessionIdOf(accessToken: string): string | null {
  try {
    const payload = accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(globalThis.atob(payload + '='.repeat((4 - (payload.length % 4)) % 4)));
    return typeof json.session_id === 'string' ? json.session_id : null;
  } catch {
    return null;
  }
}

// Chamada quando a sessão aparece (login novo ou app reaberto). Devolve false se
// este celular NÃO é mais o válido.
export async function ensureSession(session: Session): Promise<boolean> {
  const sid = sessionIdOf(session.access_token);
  const stored = await AsyncStorage.getItem(KEY).catch(() => null);

  if (sid && stored !== sid) {
    // Login novo neste celular: ele passa a ser o válido.
    const { error } = await supabase.rpc('claim_session');
    if (!error) await AsyncStorage.setItem(KEY, sid).catch(() => {});
    return true;
  }
  return checkSession();
}

// Este celular ainda é o válido? Sem resposta do servidor, vale como sim (não derruba ninguém sem internet).
export async function checkSession(): Promise<boolean> {
  const { data, error } = await supabase.rpc('session_is_current');
  if (error) return true;
  return data !== false;
}

export async function forgetClaimedSession(): Promise<void> {
  await AsyncStorage.removeItem(KEY).catch(() => {});
}
