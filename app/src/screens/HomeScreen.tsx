import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BigButton } from '../components/BigButton';
import type { Ride } from '../lib/rides';
import { formatScheduled } from '../lib/scheduling';
import { Screen } from '../components/Screen';
import { colors, fontSize, cardSurface } from '../theme';

type Props = {
  name: string;
  // Já fez o cadastro de motorista (qualquer situação): "Sou motorista". Senão: "Quero ser motorista".
  isDriver: boolean;
  // Viagens agendadas da pessoa (a mais próxima primeiro).
  scheduled: Ride[];
  // Propostas de motoristas esperando resposta nas viagens agendadas.
  proposalTotal: number;
  onOpenScheduled: () => void;
  onRequestRide: () => void;
  onRequestDelivery: () => void;
  onOpenFavorites: () => void;
  onDriverMode: () => void;
  onOpenSettings: () => void;
};

// Início: pedir corrida ou entrega, bem grandes. "Sou motorista" fica no canto
// de cima e o resto (minhas corridas, termos...) em Configurações.
export function HomeScreen({
  name,
  isDriver,
  scheduled,
  proposalTotal,
  onOpenScheduled,
  onRequestRide,
  onRequestDelivery,
  onOpenFavorites,
  onDriverMode,
  onOpenSettings,
}: Props) {
  const firstName = name.split(' ')[0];

  return (
    <Screen
      title={`Oi, ${firstName}!`}
      subtitle="Pra onde a gente vai?"
      corner={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isDriver ? 'Sou motorista' : 'Quero ser motorista'}
          onPress={onDriverMode}
          style={({ pressed }) => [styles.driver, pressed && styles.driverPressed]}
        >
          <Text style={styles.driverText}>{isDriver ? 'Sou motorista' : 'Quero ser motorista'}</Text>
        </Pressable>
      }
    >
      {scheduled.length > 0 ? (
        <View style={styles.scheduled}>
          <Text style={styles.scheduledText}>
            {scheduled.length === 1 ? 'Viagem agendada' : `${scheduled.length} viagens agendadas`}: {formatScheduled(scheduled[0].scheduled_for)}
          </Text>
          {proposalTotal > 0 ? (
            <Text style={styles.scheduledText}>
              {proposalTotal === 1 ? 'Um motorista fez uma proposta' : `${proposalTotal} propostas de motoristas`} esperando você.
            </Text>
          ) : null}
          <BigButton label="Ver viagens agendadas" onPress={onOpenScheduled} variant="link" />
        </View>
      ) : null}
      <BigButton label="Pedir corrida" icon="car-sport" onPress={onRequestRide} />
      <BigButton label="Pedir entrega" icon="cube" onPress={onRequestDelivery} />
      <BigButton label="Meus motoristas" icon="heart" onPress={onOpenFavorites} variant="secondary" />
      <BigButton label="Configurações" icon="settings-sharp" onPress={onOpenSettings} variant="secondary" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scheduled: {
    ...cardSurface,
    gap: 4,
    borderLeftWidth: 6,
    borderLeftColor: colors.primary,
    backgroundColor: colors.surfaceTint,
  },
  scheduledText: {
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  driver: {
    minHeight: 48,
    flexShrink: 1,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.background,
  },
  driverPressed: {
    backgroundColor: '#FDECEC',
  },
  driverText: {
    fontSize: fontSize.body - 2,
    fontWeight: '700',
    textAlign: 'center',
    color: colors.primary,
  },
});
