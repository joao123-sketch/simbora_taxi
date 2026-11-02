import { useEffect } from 'react';
import { Platform } from 'react-native';

type WakeLockSentinelLike = { release: () => Promise<void> };
type WakeLockNavigator = Navigator & {
  wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
};

// Na web (PWA) o celular para o GPS quando a tela apaga. Enquanto `enabled`,
// pede ao navegador para manter a tela ligada e pede de novo ao voltar para o app.
export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || Platform.OS !== 'web' || typeof navigator === 'undefined') return;
    const wakeLock = (navigator as WakeLockNavigator).wakeLock;
    if (!wakeLock) return;

    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;

    const acquire = () => {
      wakeLock
        .request('screen')
        .then((lock) => {
          if (cancelled) lock.release().catch(() => {});
          else sentinel = lock;
        })
        .catch(() => {
          // Bateria fraca ou aba escondida: tenta de novo quando o app voltar.
        });
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') acquire();
    };

    acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      sentinel?.release().catch(() => {});
    };
  }, [enabled]);
}
