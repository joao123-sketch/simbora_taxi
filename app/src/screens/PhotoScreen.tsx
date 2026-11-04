import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { Avatar } from '../components/Avatar';
import { BigButton } from '../components/BigButton';
import { Screen } from '../components/Screen';
import { SelfieCamera } from '../components/SelfieCamera';
import { canUseWebCamera, shrinkToJpeg, takeSelfie, uploadMyPhoto } from '../lib/photo';

type Props = {
  userId: string;
  onSaved: (path: string) => void;
  // Só quando a pessoa pode desistir (trocar a foto em Configurações); no cadastro não tem volta.
  onBack?: () => void;
  // Foto atual, para mostrar enquanto ela não tira outra.
  currentPath?: string | null;
  // Texto de apoio; o padrão fala com o passageiro.
  subtitle?: string;
};

// Selfie obrigatória: o motorista vê esta foto antes de aceitar a corrida.
export function PhotoScreen({ userId, onSaved, onBack, currentPath, subtitle }: Props) {
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function take() {
    setError(null);
    if (canUseWebCamera()) {
      setCameraOpen(true);
      return;
    }
    const uri = await takeSelfie();
    if (!uri) {
      setError('Não conseguimos abrir a câmera. Permita o acesso à câmera e tente de novo.');
      return;
    }
    setPreview(uri);
  }

  async function save() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await shrinkToJpeg(preview);
      onSaved(await uploadMyPhoto(userId, blob));
    } catch {
      setBusy(false);
      setError('Não conseguimos enviar a foto. Confira a internet e tente de novo.');
    }
  }

  return (
    <Screen
      title="Sua foto"
      subtitle={subtitle ?? 'O motorista vê esta foto antes de aceitar a corrida. Tire uma selfie de rosto, com boa luz.'}
      error={error}
      onBack={onBack}
    >
      {cameraOpen ? (
        <SelfieCamera
          onCapture={(uri) => {
            setPreview(uri);
            setCameraOpen(false);
          }}
          onCancel={() => setCameraOpen(false)}
          onUnavailable={(reason) => {
            setCameraOpen(false);
            setError(
              reason === 'missing'
                ? 'Não encontramos uma câmera neste aparelho. Use um celular ou ligue uma câmera.'
                : 'A câmera está bloqueada. Permita o acesso à câmera no navegador e tente de novo.',
            );
          }}
        />
      ) : null}
      <View style={cameraOpen ? styles.hidden : styles.center}>
        {preview ? (
          <Image accessibilityLabel="Prévia da foto" source={{ uri: preview }} style={styles.preview} />
        ) : (
          <Avatar path={currentPath} size={160} />
        )}
      </View>
      {preview ? (
        <>
          <BigButton label="Usar esta foto" icon="checkmark" onPress={save} loading={busy} />
          <BigButton label="Tirar de novo" icon="camera" onPress={take} variant="secondary" disabled={busy} />
        </>
      ) : (
        <BigButton label="Tirar foto" icon="camera" onPress={take} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
  },
  hidden: {
    display: 'none',
  },
  preview: {
    width: 160,
    height: 160,
    borderRadius: 80,
  },
});
