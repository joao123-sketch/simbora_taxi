import { ReactNode } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fontSize } from '../theme';

type Props = {
  title: string;
  subtitle?: string;
  error?: string | null;
  // Fica sempre visível embaixo, sem rolar com a tela (ex.: o botão Voltar de
  // uma lista longa).
  footer?: ReactNode;
  children: ReactNode;
};

// Moldura comum das telas: título grande, explicação curta e erro em destaque.
// Fica dentro da área segura (fora da barra de status e dos botões do
// Android) e sobe junto com o teclado.
export function Screen({ title, subtitle, error, footer, children }: Props) {
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.container} behavior="padding">
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.content}>
            <Text style={styles.brand}>Simbora Car</Text>
            <Text accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            {error ? (
              <Text accessibilityRole="alert" style={styles.error}>
                {error}
              </Text>
            ) : null}
            {children}
          </View>
        </ScrollView>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 20,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  footer: {
    paddingHorizontal: 24,
    paddingVertical: 8,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    borderTopWidth: 1,
    borderTopColor: '#E4E4E4',
    backgroundColor: colors.background,
  },
  brand: {
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.primary,
  },
  title: {
    fontSize: fontSize.title,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    fontSize: fontSize.body,
    color: colors.textMuted,
  },
  error: {
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.primaryDark,
  },
});
