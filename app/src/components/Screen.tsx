import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fontSize, gradients, radius, shadows } from '../theme';
import { BackdropMap } from './BackdropMap';
import { BeetleLogo } from './BeetleLogo';
import type { BackdropMapProps } from './BackdropMap.types';

type Props = {
  title: string;
  subtitle?: string;
  error?: string | null;
  // Fica sempre visível embaixo, sem rolar com a tela (ex.: o botão Voltar de
  // uma lista longa, ou a barra de abas do início).
  footer?: ReactNode;
  // Fica no canto de cima à direita, na linha do nome do app (ex.: "Sou motorista").
  corner?: ReactNode;
  // Com mapa: ele ocupa a tela toda e o conteúdo sobe num painel por baixo.
  backdrop?: BackdropMapProps;
  // Mostra a seta de voltar (no mapa, flutuando; sem mapa, no topo).
  onBack?: () => void;
  children: ReactNode;
};

function BackButton({ onBack, floating }: { onBack: () => void; floating?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Voltar"
      onPress={onBack}
      style={({ pressed }) => [styles.back, floating && styles.backFloating, pressed && styles.backPressed]}
    >
      <Ionicons name="arrow-back" size={24} color={colors.ink} />
    </Pressable>
  );
}

function ErrorBox({ error }: { error?: string | null }) {
  if (!error) return null;
  return (
    <View accessibilityRole="alert" style={styles.error}>
      <Text style={styles.errorText}>{error}</Text>
    </View>
  );
}

// Moldura comum das telas. Sem mapa: fundo branco, título grande à esquerda e
// conteúdo rolando. Com mapa: o mapa ocupa tudo e o conteúdo fica num painel
// que sobe por baixo, como nos aplicativos de corrida. Fica dentro da área
// segura (fora da barra de status e dos botões do Android) e sobe junto com o teclado.
export function Screen({ title, subtitle, error, footer, corner, backdrop, onBack, children }: Props) {
  const [sheetHeight, setSheetHeight] = useState(0);
  const scrollRef = useRef<ScrollViewInstance>(null);

  // O aviso de erro fica no topo e o botão que o causou, embaixo: sobe a tela
  // para a pessoa ver o aviso em vez de achar que nada aconteceu.
  useEffect(() => {
    if (error) scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [error]);

  if (backdrop) {
    return (
      <View style={styles.container}>
        <BackdropMap {...backdrop} bottomInset={sheetHeight} />
        <SafeAreaView edges={['top']} style={styles.overlay} pointerEvents="box-none">
          <View style={styles.overlayRow} pointerEvents="box-none">
            {onBack ? <BackButton onBack={onBack} floating /> : <View />}
            {corner ? <View style={styles.corner}>{corner}</View> : null}
          </View>
        </SafeAreaView>
        <KeyboardAvoidingView style={styles.sheetWrap} behavior="padding" pointerEvents="box-none">
          <SafeAreaView
            edges={['bottom']}
            style={styles.sheet}
            onLayout={(e) => setSheetHeight(Math.round(e.nativeEvent.layout.height))}
          >
            <View style={styles.handle} />
            <ScrollView
              ref={scrollRef}
              style={styles.sheetScroll}
              contentContainerStyle={styles.sheetContent}
              keyboardShouldPersistTaps="handled"
            >
              <Text accessibilityRole="header" style={styles.sheetTitle}>
                {title}
              </Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
              <ErrorBox error={error} />
              {children}
            </ScrollView>
            {footer ? <View style={styles.sheetFooter}>{footer}</View> : null}
          </SafeAreaView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  return (
    <LinearGradient colors={gradients.page} style={styles.container}>
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={styles.container} behavior="padding">
          <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <View style={styles.content}>
              <View style={styles.header}>
                {onBack ? (
                  <BackButton onBack={onBack} />
                ) : (
                  <View style={styles.brandRow}>
                    <LinearGradient colors={gradients.primary} style={styles.logo}>
                      <BeetleLogo size={26} color={colors.onPrimary} cutout="#CD2525" />
                    </LinearGradient>
                    <Text style={styles.brand}>Simbora Car</Text>
                  </View>
                )}
                {corner ? <View style={styles.corner}>{corner}</View> : null}
              </View>
              <Text accessibilityRole="header" style={styles.title}>
                {title}
              </Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
              <ErrorBox error={error} />
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
    backgroundColor: colors.background,
  },
  scroll: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    gap: 16,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  footer: {
    gap: 4,
    paddingHorizontal: 20,
    paddingVertical: 6,
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
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: {
    fontSize: fontSize.body,
    fontWeight: '800',
    color: colors.primaryDark,
    letterSpacing: 0.2,
  },
  title: {
    fontSize: fontSize.title - 2,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.5,
    lineHeight: 36,
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
  back: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backFloating: {
    backgroundColor: colors.surface,
    ...shadows.floating,
  },
  backPressed: {
    opacity: 0.8,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  overlayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 14,
    paddingTop: 8,
  },
  sheetWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '78%',
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    ...shadows.sheet,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginTop: 10,
  },
  sheetScroll: {
    flexGrow: 0,
  },
  sheetContent: {
    padding: 20,
    paddingTop: 14,
    gap: 14,
  },
  sheetTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.3,
  },
  sheetFooter: {
    paddingHorizontal: 20,
    paddingBottom: 6,
    gap: 4,
  },
});
