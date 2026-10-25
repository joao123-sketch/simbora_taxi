import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ReactNode } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fontSize, gradients, radius, shadows } from '../theme';

type Props = {
  title: string;
  subtitle?: string;
  error?: string | null;
  // Fica sempre visível embaixo, sem rolar com a tela (ex.: o botão Voltar de
  // uma lista longa).
  footer?: ReactNode;
  // Fica no canto de cima à direita, na linha do nome do app (ex.: "Sou motorista").
  corner?: ReactNode;
  children: ReactNode;
};

// Moldura comum das telas: fundo suave com gradiente, marca do app, título grande,
// explicação curta e erro em destaque. Fica dentro da área segura (fora da barra de
// status e dos botões do Android) e sobe junto com o teclado.
export function Screen({ title, subtitle, error, footer, corner, children }: Props) {
  return (
    <LinearGradient colors={gradients.page} style={styles.container}>
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={styles.container} behavior="padding">
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <View style={styles.content}>
              <View style={styles.header}>
                <View style={styles.brandRow}>
                  <LinearGradient colors={gradients.primary} style={styles.logo}>
                    <Ionicons
                      name="car-sport"
                      size={20}
                      color={colors.onPrimary}
                      accessibilityElementsHidden
                      importantForAccessibility="no"
                    />
                  </LinearGradient>
                  <Text style={styles.brand}>Simbora Car</Text>
                </View>
                {corner ? <View style={styles.corner}>{corner}</View> : null}
              </View>
              <Text accessibilityRole="header" style={styles.title}>
                {title}
              </Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
              {error ? (
                <View accessibilityRole="alert" style={styles.error}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}
              {children}
            </View>
          </ScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 18,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  footer: {
    gap: 4,
    paddingHorizontal: 24,
    paddingVertical: 8,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
  },
  // O canto encolhe (e o texto quebra em duas linhas) em vez de vazar pela borda da tela.
  corner: {
    flexShrink: 1,
  },
  logo: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.button,
  },
  brand: {
    fontSize: fontSize.body,
    fontWeight: '800',
    color: colors.primaryDark,
    letterSpacing: 0.2,
  },
  title: {
    fontSize: fontSize.title,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.4,
    lineHeight: 38,
  },
  subtitle: {
    fontSize: fontSize.body,
    color: colors.textMuted,
    lineHeight: 28,
  },
  error: {
    borderRadius: radius.md,
    borderLeftWidth: 6,
    borderLeftColor: colors.primary,
    backgroundColor: colors.dangerBg,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  errorText: {
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.primaryDark,
    lineHeight: 26,
  },
});
