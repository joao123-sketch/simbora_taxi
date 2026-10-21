import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fontSize, touchTarget } from '../theme';

type Props = {
  label: string;
  detail?: string;
  selected?: boolean;
  onPress: () => void;
};

// Opção grande de escolha (carro ou moto, dinheiro ou Pix, cidade de destino).
export function ChoiceCard({ label, detail, selected, onPress }: Props) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      onPress={onPress}
      style={[styles.card, selected && styles.selected]}
    >
      <View style={[styles.radio, selected && styles.radioSelected]} />
      <Text style={styles.label}>{label}</Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: touchTarget,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#CCCCCC',
    backgroundColor: colors.background,
  },
  selected: {
    borderColor: colors.primary,
    backgroundColor: '#FDECEC',
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.textMuted,
  },
  radioSelected: {
    borderWidth: 8,
    borderColor: colors.primary,
  },
  label: {
    flex: 1,
    fontSize: fontSize.body + 2,
    fontWeight: '700',
    color: colors.text,
  },
  detail: {
    fontSize: fontSize.body + 2,
    fontWeight: '700',
    color: colors.text,
  },
});
