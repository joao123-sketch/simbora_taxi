import { StyleSheet, View } from 'react-native';

import { colors } from '../theme';

// Alfinete fixo no meio do mapa: a pessoa arrasta o mapa até o ponto ficar embaixo dele.
export function CenterPin() {
  return (
    <View pointerEvents="none" style={styles.wrapper}>
      <View style={styles.head}>
        <View style={styles.dot} />
      </View>
      <View style={styles.stem} />
    </View>
  );
}

const HEAD = 40;
const STEM = 20;

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    marginLeft: -HEAD / 2,
    marginTop: -(HEAD + STEM),
    alignItems: 'center',
    // Acima das camadas do mapa (o Leaflet usa z-index até 1000).
    zIndex: 1100,
  },
  head: {
    width: HEAD,
    height: HEAD,
    borderRadius: HEAD / 2,
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: colors.onPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.onPrimary,
  },
  stem: {
    width: 4,
    height: STEM,
    backgroundColor: colors.primary,
  },
});
