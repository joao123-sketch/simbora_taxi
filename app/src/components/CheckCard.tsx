import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fontSize, touchTarget } from '../theme';

type Props = {
  label: string;
  hint?: string;
  checked: boolean;
  onPress: () => void;
};

// Opção grande de marcar e desmarcar (várias podem ficar marcadas).
export function CheckCard({ label, hint, checked, onPress }: Props) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={hint ? `${label}. ${hint}` : label}
      onPress={onPress}
      style={[styles.card, checked && styles.checked]}
    >
      <View style={[styles.box, checked && styles.boxChecked]}>
        {checked ? <Text style={styles.tick}>✓</Text> : null}
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
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#CCCCCC',
    backgroundColor: colors.background,
  },
  checked: {
    borderColor: colors.primary,
    backgroundColor: '#FDECEC',
  },
  box: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tick: {
    color: colors.onPrimary,
    fontSize: 22,
    fontWeight: '700',
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
    fontSize: fontSize.body - 4,
    color: colors.textMuted,
  },
});
