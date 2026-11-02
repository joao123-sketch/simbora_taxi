import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BigButton } from '../components/BigButton';
import { InstallCard } from '../components/InstallCard';
import type { Coord } from '../components/PinMap.types';
import { Screen } from '../components/Screen';
import { TabBar } from '../components/TabBar';
import type { Ride } from '../lib/rides';
import { formatScheduled } from '../lib/scheduling';
import { colors, fontSize, radius, shadows } from '../theme';

type IconName = keyof typeof Ionicons.glyphMap;

type Props = {
  name: string;
  // Já fez o cadastro de motorista (qualquer situação): "Sou motorista". Senão: "Quero ser motorista".
  isDriver: boolean;
  // Onde o mapa do fundo abre (a pessoa, se o GPS respondeu; senão o centro da cidade).
  center: Coord;
  // Onde a pessoa está, para o marcador azul; nulo enquanto o GPS não respondeu.
  here: Coord | null;
  // Viagens agendadas da pessoa (a mais próxima primeiro).
  scheduled: Ride[];
  // Propostas de motoristas esperando resposta nas viagens agendadas.
  proposalTotal: number;
  onOpenScheduled: () => void;
  onRequestRide: () => void;
  onRequestDelivery: () => void;
  onOpenFavorites: () => void;
  onDriverMode: () => void;
  onOpenHistory: () => void;
  onOpenSettings: () => void;
};

type Service = { label: string; icon: IconName; onPress: () => void };

// Início: o mapa ocupa a tela e o painel de baixo tem a busca "Para onde vamos?",
// os serviços (corrida, entrega, motoristas) e a barra de abas. "Sou motorista"
// flutua no canto de cima, e o resto (termos, excluir conta...) fica em Conta.
export function HomeScreen({
  name,
  isDriver,
  center,
  here,
  scheduled,
  proposalTotal,
  onOpenScheduled,
  onRequestRide,
  onRequestDelivery,
  onOpenFavorites,
  onDriverMode,
  onOpenHistory,
  onOpenSettings,
}: Props) {
  const firstName = name.split(' ')[0];
  const services: Service[] = [
    { label: 'Corrida', icon: 'car-sport', onPress: onRequestRide },
    { label: 'Entrega', icon: 'cube', onPress: onRequestDelivery },
    { label: 'Meus motoristas', icon: 'heart', onPress: onOpenFavorites },
  ];

  return (
    <Screen
      title={`Oi, ${firstName}!`}
      backdrop={{ center, markers: here ? [{ coord: here, kind: 'me' }] : [] }}
      corner={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isDriver ? 'Sou motorista' : 'Quero ser motorista'}
          onPress={onDriverMode}
          style={({ pressed }) => [styles.driver, pressed && styles.driverPressed]}
        >
          <Ionicons name="speedometer" size={20} color={colors.ink} />
          <Text style={styles.driverText}>{isDriver ? 'Sou motorista' : 'Quero ser motorista'}</Text>
        </Pressable>
      }
      footer={
        <TabBar
          active="home"
          tabs={[
            { key: 'home', label: 'Início', icon: 'home-outline', activeIcon: 'home', onPress: () => {} },
            { key: 'activity', label: 'Atividade', icon: 'receipt-outline', activeIcon: 'receipt', onPress: onOpenHistory },
            { key: 'account', label: 'Conta', icon: 'person-outline', activeIcon: 'person', onPress: onOpenSettings },
          ]}
        />
      }
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Para onde vamos?"
        onPress={onRequestRide}
        style={({ pressed }) => [styles.search, pressed && styles.searchPressed]}
      >
        <Ionicons name="search" size={24} color={colors.ink} />
        <Text style={styles.searchText}>Para onde vamos?</Text>
      </Pressable>

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

      <View style={styles.services}>
        {services.map((service) => (
          <Pressable
            key={service.label}
            accessibilityRole="button"
            accessibilityLabel={service.label}
            onPress={service.onPress}
            style={({ pressed }) => [styles.service, pressed && styles.servicePressed]}
          >
            <View style={styles.serviceIcon}>
              <Ionicons
                name={service.icon}
                size={30}
                color={colors.ink}
                accessibilityElementsHidden
                importantForAccessibility="no"
              />
            </View>
            <Text style={styles.serviceText}>{service.label}</Text>
          </Pressable>
        ))}
      </View>

      <InstallCard />
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 60,
    paddingHorizontal: 18,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  searchPressed: {
    backgroundColor: colors.border,
  },
  searchText: {
    fontSize: fontSize.body + 2,
    fontWeight: '700',
    color: colors.ink,
  },
  services: {
    flexDirection: 'row',
    gap: 10,
  },
  service: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  servicePressed: {
    opacity: 0.7,
  },
  serviceIcon: {
    width: '100%',
    minHeight: 72,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceText: {
    fontSize: fontSize.body - 4,
    fontWeight: '700',
    textAlign: 'center',
    color: colors.text,
  },
  scheduled: {
    gap: 4,
    borderRadius: radius.md,
    borderLeftWidth: 6,
    borderLeftColor: colors.primary,
    backgroundColor: colors.surfaceTint,
    padding: 14,
  },
  scheduledText: {
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  driver: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 48,
    flexShrink: 1,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    ...shadows.floating,
  },
  driverPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  driverText: {
    flexShrink: 1,
    fontSize: fontSize.body - 3,
    fontWeight: '700',
    color: colors.ink,
  },
});
