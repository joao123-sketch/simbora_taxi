import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { enablePush } from './push';

// Avisos do sistema (notificações do navegador). Os locais (notify) aparecem enquanto o app está
// aberto ou em segundo plano no aparelho. Com o app fechado (ou suspenso, como no iPhone) quem avisa é
// o push do servidor (push.ts + Edge Function push). No iPhone só existem com o app instalado na tela
// inicial (iOS 16.4 ou mais).

export type NotifyPermission = 'granted' | 'denied' | 'default' | 'unsupported';

export function notifyPermission(): NotifyPermission {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

// Precisa vir de um toque da pessoa (o navegador recusa pedir sozinho).
export async function askNotifyPermission(): Promise<NotifyPermission> {
  if (notifyPermission() === 'unsupported') return 'unsupported';
  try {
    const result = await Notification.requestPermission();
    // Com a permissão dada, inscreve o aparelho no push do servidor (avisa com o app fechado).
    if (result === 'granted') await enablePush();
    return result;
  } catch {
    return notifyPermission();
  }
}

type Options = {
  // Evita repetir o mesmo aviso (o aviso novo troca o antigo).
  tag?: string;
  // Só avisa se o app está em segundo plano; com o app na frente a tela já mostra a novidade.
  onlyHidden?: boolean;
};

export async function notify(title: string, body: string, { tag, onlyHidden = true }: Options = {}): Promise<void> {
  if (notifyPermission() !== 'granted') return;
  if (onlyHidden && typeof document !== 'undefined' && document.visibilityState === 'visible') return;
  const options = { body, tag, icon: '/icon-192.png', badge: '/icon-192.png', lang: 'pt-BR' };
  try {
    // No Android o aviso precisa sair pelo service worker.
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) {
      await registration.showNotification(title, options);
      return;
    }
    new Notification(title, options);
  } catch {
    // Sem permissão efetiva ou sem suporte: o app segue sem o aviso.
  }
}

// Um aviso por dia para a mesma chave (ex.: lembrete da mensalidade).
export async function notifyOncePerDay(key: string, title: string, body: string, today: string): Promise<void> {
  const storageKey = `simbora:notified:${key}`;
  const last = await AsyncStorage.getItem(storageKey).catch(() => null);
  if (last === today) return;
  await AsyncStorage.setItem(storageKey, today).catch(() => {});
  await notify(title, body, { tag: key, onlyHidden: false });
}

const LATER_KEY = 'simbora:notify_later';
const LATER_DAYS = 7;

// A pessoa tocou em "Agora não": o convite some por alguns dias.
export async function postponeNotifyInvite(): Promise<void> {
  await AsyncStorage.setItem(LATER_KEY, String(Date.now() + LATER_DAYS * 86400000)).catch(() => {});
}

export async function inviteIsPostponed(): Promise<boolean> {
  const until = await AsyncStorage.getItem(LATER_KEY).catch(() => null);
  return !!until && Number(until) > Date.now();
}
