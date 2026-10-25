import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fontSize, radius, shadows, touchTarget } from '../theme';

type Props = {
  label: string;
  hint?: string;
  checked: boolean;
  onPress: () => void;
};

// Opção grande de marcar e desmarcar (várias podem ficar marcadas). Marcada: borda
// vermelha, fundo rosado e um "certo" dentro da caixa, para não depender só da cor.
export function CheckCard({ label, hint, checked, onPress }: Props) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={hint ? `${label}. ${hint}` : label}
      onPress={onPress}
      style={({ pressed }) => [styles.card, checked && styles.checked, pressed && styles.pressed]}
    >
      <View style={[styles.box, checked && styles.boxChecked]}>
        {checked ? (
          <Ionicons
            name="checkmark"
            size={22}
            color={colors.onPrimary}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        ) : null}
      </View>
      <View style={styles.texts}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
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
  checked: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceTint,
    ...shadows.soft,
  },
  pressed: {
    opacity: 0.9,
  },
  box: {
    width: 32,
    height: 32,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  texts: {
    flex: 1,
  },
  label: {
    fontSize: fontSize.body + 2,
    fontWeight: '700',
    color: colors.text,
  },
  hint: {
    fontSize: fontSize.body - 2,
    color: colors.textMuted,
  },
});
