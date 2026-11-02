import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fontSize, radius, touchTarget } from '../theme';

type IconName = keyof typeof Ionicons.glyphMap;

type Props = {
  label: string;
  detail?: string;
  // Texto pequeno embaixo do nome (ex.: "Chega em 5 min").
  caption?: string;
  // Ícone num círculo cinza à esquerda (ex.: carro, moto). Sem ele, a bolinha de escolha.
  icon?: IconName;
  selected?: boolean;
  onPress: () => void;
};

// Opção de escolha em linha (carro ou moto, dinheiro ou Pix, cidade de destino). A opção
// escolhida ganha borda escura grossa e o fundo cinza claro: não depende só da cor.
export function ChoiceCard({ label, detail, caption, icon, selected, onPress }: Props) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      onPress={onPress}
      style={({ pressed }) => [styles.card, selected && styles.selected, pressed && styles.pressed]}
    >
      {icon ? (
        <View style={[styles.iconBox, selected && styles.iconBoxSelected]}>
          <Ionicons
            name={icon}
            size={26}
            color={selected ? colors.onPrimary : colors.ink}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        </View>
      ) : (
        <View style={[styles.radio, selected && styles.radioSelected]}>
          {selected ? <View style={styles.radioDot} /> : null}
        </View>
      )}
      <View style={styles.texts}>
        <Text style={styles.label}>{label}</Text>
        {caption ? <Text style={styles.caption}>{caption}</Text> : null}
      </View>
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
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: colors.surface,
  },
  selected: {
    borderColor: colors.ink,
    backgroundColor: colors.surfaceMuted,
  },
  pressed: {
    opacity: 0.9,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBoxSelected: {
    backgroundColor: colors.primary,
  },
  radio: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: colors.ink,
  },
  radioDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.ink,
  },
  texts: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: fontSize.body + 1,
    fontWeight: '700',
    color: colors.text,
  },
  caption: {
    fontSize: fontSize.body - 4,
    color: colors.textMuted,
  },
  detail: {
    fontSize: fontSize.body + 1,
    fontWeight: '800',
    color: colors.text,
  },
});
