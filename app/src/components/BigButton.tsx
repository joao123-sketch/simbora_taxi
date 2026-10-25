import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fontSize, gradients, radius, shadows, touchTarget } from '../theme';

type IconName = keyof typeof Ionicons.glyphMap;

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  // primary: botão principal com gradiente. secondary: menor, com borda (ex.: Configurações).
  // link: texto sublinhado.
  variant?: 'primary' | 'link' | 'secondary';
  // Ícone decorativo ao lado do texto (o leitor de tela lê só o texto).
  icon?: IconName;
};

export function BigButton({ label, onPress, disabled, loading, variant = 'primary', icon }: Props) {
  const isLink = variant === 'link';
  const isSecondary = variant === 'secondary';
  const inactive = disabled || loading;

  const content = loading ? (
    <ActivityIndicator color={isSecondary ? colors.primary : colors.onPrimary} size="large" />
  ) : (
    <View style={styles.row}>
      {icon ? (
        <Ionicons
          name={icon}
          size={isSecondary ? 24 : 30}
          color={isSecondary ? colors.primary : colors.onPrimary}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      ) : null}
      <Text style={isLink ? styles.linkText : isSecondary ? styles.secondaryText : styles.text}>{label}</Text>
    </View>
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        isLink ? styles.link : isSecondary ? styles.secondary : styles.button,
        isSecondary && pressed && styles.secondaryPressed,
        !isLink && pressed && styles.pressed,
        !isLink && inactive && styles.disabled,
      ]}
    >
      {isLink || isSecondary ? (
        content
      ) : (
        <LinearGradient colors={gradients.primary} style={styles.gradient}>
          {content}
        </LinearGradient>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignSelf: 'stretch',
    minHeight: touchTarget,
    borderRadius: radius.lg,
    ...shadows.button,
  },
  gradient: {
    flex: 1,
    minHeight: touchTarget,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  pressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.92,
  },
  disabled: {
    opacity: 0.45,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  text: {
    fontSize: fontSize.button,
    fontWeight: '800',
    color: colors.onPrimary,
    textAlign: 'center',
  },
  secondary: {
    alignSelf: 'stretch',
    minHeight: 60,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  secondaryPressed: {
    backgroundColor: colors.surfaceTint,
  },
  secondaryText: {
    fontSize: fontSize.body + 2,
    fontWeight: '700',
    color: colors.primary,
    textAlign: 'center',
  },
  link: {
    alignSelf: 'center',
    minHeight: 56,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  linkText: {
    fontSize: fontSize.body,
    fontWeight: '600',
    color: colors.primary,
    textDecorationLine: 'underline',
  },
});
