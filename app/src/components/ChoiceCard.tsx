import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fontSize, radius, shadows, touchTarget } from '../theme';

type Props = {
  label: string;
  detail?: string;
  selected?: boolean;
  onPress: () => void;
};

// Opção grande de escolha (carro ou moto, dinheiro ou Pix, cidade de destino). A opção
// escolhida ganha borda vermelha, fundo rosado e a bolinha cheia: não depende só da cor.
export function ChoiceCard({ label, detail, selected, onPress }: Props) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      onPress={onPress}
      style={({ pressed }) => [styles.card, selected && styles.selected, pressed && styles.pressed]}
    >
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
      <Text style={styles.label}>{label}</Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: touchTarget,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  selected: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceTint,
    ...shadows.soft,
  },
  pressed: {
    opacity: 0.9,
  },
  radio: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: colors.primary,
  },
  radioDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.primary,
  },
  label: {
    flex: 1,
    fontSize: fontSize.body + 2,
    fontWeight: '700',
    color: colors.text,
  },
  detail: {
    fontSize: fontSize.body + 2,
    fontWeight: '800',
    color: colors.primaryDark,
  },
});
