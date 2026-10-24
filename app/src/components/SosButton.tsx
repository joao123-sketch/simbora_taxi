import { useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { openSosWhatsApp, type SosRole } from '../lib/sos';
import type { Ride } from '../lib/rides';
import { colors, fontSize, touchTarget } from '../theme';
import { BigButton } from './BigButton';

const HOLD_MS = 5000;

type Props = {
  ride: Ride;
  role: SosRole;
};

// SOS discreto, sem som: segurar o botão por 5 segundos e confirmar em seguida,
// para não ser acionado sem querer. Abre o WhatsApp da equipe com a mensagem
// pronta (corrida, motorista, placa e localização).
export function SosButton({ ride, role }: Props) {
  const fill = useRef(new Animated.Value(0)).current;
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startHold() {
    fill.setValue(0);
    Animated.timing(fill, {
      toValue: 1,
      duration: HOLD_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) {
        setConfirming(true);
      }
    });
  }

  function cancelHold() {
    fill.stopAnimation();
    fill.setValue(0);
  }

  async function send() {
    setSending(true);
    setError(null);
    try {
      await openSosWhatsApp(ride, role);
      setConfirming(false);
    } catch (e) {
      setError((e as { message?: string }).message || 'Não conseguimos abrir o WhatsApp.');
    } finally {
      setSending(false);
    }
  }

  if (confirming) {
    return (
      <View style={styles.confirmBox}>
        <Text accessibilityRole="header" style={styles.confirmTitle}>
          Precisa de ajuda?
        </Text>
        <Text style={styles.confirmText}>
          Vamos abrir o WhatsApp da equipe do Simbora Car com a sua localização. É só tocar em enviar.
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <BigButton label="Pedir ajuda" onPress={send} loading={sending} />
        <BigButton
          label="Foi sem querer"
          onPress={() => {
            setConfirming(false);
            setError(null);
          }}
          variant="link"
        />
      </View>
    );
  }

  const width = fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="SOS"
      accessibilityHint="Segure por 5 segundos para pedir ajuda"
      onPressIn={startHold}
      onPressOut={cancelHold}
      style={styles.button}
    >
      <Animated.View style={[styles.progress, { width }]} />
      <Text style={styles.label}>SOS · segure 5 segundos</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignSelf: 'stretch',
    minHeight: touchTarget - 16,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.primaryDark,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  // Enche aos poucos enquanto o botão está pressionado.
  progress: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#F9D3D3',
  },
  label: {
    fontSize: fontSize.body - 2,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  confirmBox: {
    gap: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  confirmTitle: {
    fontSize: fontSize.body + 6,
    fontWeight: '700',
    color: colors.text,
  },
  confirmText: {
    fontSize: fontSize.body,
    color: colors.text,
  },
  error: {
    fontSize: fontSize.body - 2,
    fontWeight: '700',
    color: colors.primaryDark,
  },
});
