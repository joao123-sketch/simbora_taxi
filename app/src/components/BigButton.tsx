import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { colors, fontSize, touchTarget } from '../theme';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  // secondary: botão menor, só com borda (ex.: Configurações).
  variant?: 'primary' | 'link' | 'secondary';
};

export function BigButton({ label, onPress, disabled, loading, variant = 'primary' }: Props) {
  const isLink = variant === 'link';
  const isSecondary = variant === 'secondary';
  const inactive = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        isLink ? styles.link : isSecondary ? styles.secondary : styles.button,
        !isLink && !isSecondary && pressed && styles.pressed,
        isSecondary && pressed && styles.secondaryPressed,
        !isLink && inactive && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.onPrimary} size="large" />
      ) : (
        <Text style={isLink ? styles.linkText : isSecondary ? styles.secondaryText : styles.text}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignSelf: 'stretch',
    minHeight: touchTarget,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  pressed: {
    backgroundColor: colors.primaryDark,
  },
  secondary: {
    alignSelf: 'stretch',
    minHeight: 56,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondaryPressed: {
    backgroundColor: '#FDECEC',
  },
  secondaryText: {
    fontSize: fontSize.body + 2,
    fontWeight: '700',
    color: colors.primary,
  },
  disabled: {
    opacity: 0.4,
  },
  text: {
    fontSize: fontSize.button,
    fontWeight: '700',
    color: colors.onPrimary,
  },
  link: {
    alignSelf: 'center',
    minHeight: 56,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  linkText: {
    fontSize: fontSize.body,
    color: colors.primary,
    textDecorationLine: 'underline',
  },
});
