import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

// Como a pessoa pode instalar o Simbora Car agora:
// - 'prompt': Android/Chrome, dá para instalar com um toque.
// - 'ios-safari': iPhone/iPad no Safari, só pelo menu Compartilhar.
// - 'ios-other': iPhone em outro navegador, precisa abrir no Safari.
// - 'android-menu': Android sem o botão de instalar pronto, só pelo menu do navegador.
// - 'none': já instalado, fora da web ou navegador sem instalação.
export type InstallMode = 'prompt' | 'ios-safari' | 'ios-other' | 'android-menu' | 'none';

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true;
}

function iosMode(): InstallMode {
  const ua = window.navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && window.navigator.maxTouchPoints > 1);
  if (!isIos) return /Android/i.test(ua) ? 'android-menu' : 'none';
  // Chrome, Firefox, Edge e outros no iOS trazem CriOS, FxiOS, EdgiOS etc.
  return /CriOS|FxiOS|EdgiOS|OPiOS|GSA|Instagram|FBAN|FBAV/.test(ua) ? 'ios-other' : 'ios-safari';
}

export function useInstall() {
  const [mode, setMode] = useState<InstallMode>('none');
  const [event, setEvent] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || isStandalone()) return;
    setMode(iosMode());

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallPromptEvent);
      setMode('prompt');
    };
    const onInstalled = () => {
      setEvent(null);
      setMode('none');
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function install() {
    if (!event) return;
    await event.prompt();
    await event.userChoice;
    setEvent(null);
    setMode('none');
  }

  return { mode, install };
}
