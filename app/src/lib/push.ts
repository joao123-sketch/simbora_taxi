import { Platform } from 'react-native';

import { toStored, urlBase64ToUint8Array } from './pushHelpers';
import { supabase } from './supabase';

// Web Push: o servidor avisa mesmo com o app em segundo plano ou fechado (no iPhone, só com o app
// instalado na tela inicial, iOS 16.4 ou mais). A chave pública (VAPID) vem do build.

const VAPID_PUBLIC_KEY = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY ?? '';

export function pushSupported(): boolean {
  return (
    Platform.OS === 'web' &&
    VAPID_PUBLIC_KEY !== '' &&
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window
  );
}

// Cria (ou renova) a inscrição deste aparelho e grava no banco. Precisa da permissão de avisos já dada.
// Nunca lança erro: sem push o app segue com os avisos locais.
export async function enablePush(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== 'granted') return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    const sub =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      }));
    const stored = toStored(sub);
    if (!stored) return false;
    const { error } = await supabase.rpc('save_push_subscription', {
      p_endpoint: stored.endpoint,
      p_p256dh: stored.p256dh,
      p_auth: stored.auth,
    });
    return !error;
  } catch {
    return false;
  }
}

// Apaga a inscrição deste aparelho (no banco e no navegador). Chamar ANTES de encerrar a sessão,
// porque o banco só deixa a própria pessoa apagar.
export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const sub = await registration?.pushManager.getSubscription();
    if (!sub) return;
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  } catch {
    // Sem internet: o servidor apaga a inscrição sozinho quando o aviso der erro 404 ou 410.
  }
}

export async function signOutAndDisablePush(): Promise<void> {
  await disablePush();
  await supabase.auth.signOut();
}
