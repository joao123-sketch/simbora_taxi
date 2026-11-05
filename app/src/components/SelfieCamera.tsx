type Props = {
  onCapture: (uri: string) => void;
  onCancel: () => void;
  onUnavailable: (reason: 'denied' | 'missing' | 'busy') => void;
};

// Fora do navegador (Expo Go, só para desenvolver) a foto vem do seletor do sistema:
// a câmera ao vivo está em SelfieCamera.web.tsx, que é o que o app publicado usa.
export function SelfieCamera(_props: Props) {
  return null;
}
