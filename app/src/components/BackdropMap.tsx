// No celular nativo (só Expo Go, para desenvolver) o fundo é liso; o mapa de
// verdade está em BackdropMap.web.tsx, que é o que o app publicado usa.
import { StyleSheet, View } from 'react-native';

import type { BackdropMapProps } from './BackdropMap.types';

export function BackdropMap(_props: BackdropMapProps) {
  return <View style={styles.box} />;
}

const styles = StyleSheet.create({
  box: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#E8E6E4',
  },
});
