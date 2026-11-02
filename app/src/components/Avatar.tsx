import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { photoUrl } from '../lib/photo';
import { colors } from '../theme';

type Props = {
  // Caminho da foto no Storage; sem ele (ou se a foto não abrir) aparece o ícone de pessoa.
  path: string | null | undefined;
  size?: number;
};

// Foto redonda de uma pessoa (o link temporário é buscado aqui).
export function Avatar({ path, size = 56 }: Props) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setUrl(null);
    if (path) {
      photoUrl(path)
        .then((u) => alive && setUrl(u))
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [path]);

  const box = { width: size, height: size, borderRadius: size / 2 };
  return (
    <View accessibilityLabel="Foto" style={[styles.box, box]}>
      {url ? (
        <Image source={{ uri: url }} style={box} resizeMode="cover" />
      ) : (
        <Ionicons name="person" size={size * 0.55} color={colors.textMuted} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
