import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BigButton } from './BigButton';

type Props = {
  // Recebe a foto tirada (uma imagem em data URL).
  onCapture: (uri: string) => void;
  onCancel: () => void;
  // A câmera não abriu (sem câmera no aparelho ou a pessoa não deixou usar).
  // 'busy': a câmera ainda estava presa pela abertura anterior (acontece no iPhone ao tirar de novo).
  onUnavailable: (reason: 'denied' | 'missing' | 'busy') => void;
};

// Câmera ao vivo no navegador (computador ou celular), com a câmera da frente.
// O seletor de arquivos do navegador só abre a câmera no celular; no computador não.
export function SelfieCamera({ onCapture, onCancel, onUnavailable }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | null = null;

    const open = (attempt: number) => {
      navigator.mediaDevices
        .getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 } }, audio: false })
        .then((stream) => {
          if (cancelled) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          streamRef.current = stream;
          const video = videoRef.current;
          if (video) {
            video.srcObject = stream;
            video.play().then(() => setReady(true)).catch(() => setReady(true));
          }
        })
        .catch((e: { name?: string }) => {
          if (cancelled) return;
          const name = e?.name;
          // Logo depois de fechar a câmera, o iPhone ainda a segura por um instante: tenta de novo.
          const busy = name === 'NotReadableError' || name === 'AbortError' || name === 'TrackStartError';
          if (busy && attempt < 4) {
            retry = setTimeout(() => open(attempt + 1), 700);
            return;
          }
          onUnavailable(busy ? 'busy' : name === 'NotFoundError' || name === 'OverconstrainedError' ? 'missing' : 'denied');
        });
    };
    open(0);

    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };
    // Abre a câmera uma vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    onCapture(canvas.toDataURL('image/jpeg', 0.92));
  }

  return (
    <View style={styles.box}>
      {/* Espelhado na tela, como num espelho; a foto salva não é espelhada. */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ width: '100%', maxHeight: 360, borderRadius: 16, background: '#000', transform: 'scaleX(-1)', objectFit: 'cover' }}
      />
      <BigButton label="Tirar a foto" icon="camera" onPress={capture} disabled={!ready} />
      <BigButton label="Cancelar" onPress={onCancel} variant="link" />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: 12,
  },
});
