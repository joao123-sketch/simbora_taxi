import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { useInstall } from '../lib/install';
import { cardSurface, colors, fontSize } from '../theme';
import { BigButton } from './BigButton';

// Convite para pôr o Simbora Car na tela inicial do celular. Só aparece na web,
// quando o app ainda não está instalado.
export function InstallCard() {
  const { mode, install } = useInstall();
  if (mode === 'none') return null;

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Ionicons
          name="phone-portrait"
          size={28}
          color={colors.primary}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <Text accessibilityRole="header" style={styles.title}>
          Ponha o Simbora na tela do celular
        </Text>
      </View>
      {mode === 'prompt' ? (
        <>
          <Text style={styles.text}>Fica um ícone igual aos outros aplicativos, e abre mais rápido.</Text>
          <BigButton label="Instalar o app" icon="download" onPress={install} />
        </>
      ) : mode === 'ios-safari' ? (
        <Text style={styles.text}>
          1. Toque no botão Compartilhar (o quadrado com uma seta para cima, embaixo na tela).{'\n'}
          2. Toque em "Adicionar à Tela de Início".{'\n'}
          3. Toque em "Adicionar".
        </Text>
      ) : (
        <Text style={styles.text}>
          Abra este mesmo endereço no Safari. Depois toque em Compartilhar e em "Adicionar à Tela de Início".
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { ...cardSurface, backgroundColor: colors.surfaceTint, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { flex: 1, fontSize: fontSize.body, fontWeight: '700', color: colors.text },
  text: { fontSize: fontSize.body, color: colors.text, lineHeight: 28 },
});
