import { StyleSheet, View } from 'react-native';

import { colors } from '../theme';

// Alfinete fixo no meio do mapa: a pessoa arrasta o mapa até o ponto ficar
// embaixo da ponta dele. Formato de gota (um quadrado girado com três cantos
// redondos), com um furo branco e uma sombrinha no chão.
export function CenterPin() {
  return (
    <View pointerEvents="none" style={styles.wrapper}>
      <View style={styles.groundShadow} />
      <View style={styles.drop} />
      <View style={styles.hole} />
    </View>
  );
}

// Lado do quadrado e distância do centro dele até a ponta (lado x raiz de 2 / 2).
const SIDE = 40;
const TIP = Math.round((SIDE * Math.SQRT2) / 2);
const HEIGHT = SIDE / 2 + TIP;
const HOLE = 16;

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: SIDE,
    height: HEIGHT,
    marginLeft: -SIDE / 2,
    // A ponta fica exatamente no centro do mapa.
    marginTop: -HEIGHT,
    // Acima das camadas do mapa (o Leaflet usa z-index até 1000).
    zIndex: 1100,
  },
  groundShadow: {
    position: 'absolute',
    left: SIDE / 2 - 9,
    top: HEIGHT - 3,
    width: 18,
    height: 6,
    borderRadius: 9,
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
  },
  drop: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: SIDE,
    height: SIDE,
    borderRadius: SIDE / 2,
    // O canto de baixo à esquerda fica reto e, com a rotação, vira a ponta.
    borderBottomLeftRadius: 0,
    transform: [{ rotate: '-45deg' }],
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: colors.onPrimary,
    boxShadow: '0 3px 6px rgba(0, 0, 0, 0.35)',
  },
  hole: {
    position: 'absolute',
    left: SIDE / 2 - HOLE / 2,
    top: SIDE / 2 - HOLE / 2,
    width: HOLE,
    height: HOLE,
    borderRadius: HOLE / 2,
    backgroundColor: colors.onPrimary,
  },
});
