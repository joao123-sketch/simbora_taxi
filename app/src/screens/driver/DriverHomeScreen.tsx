import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BigButton } from '../../components/BigButton';
import type { Coord } from '../../components/PinMap.types';
import { Screen } from '../../components/Screen';
import { distanceKm, formatKm } from '../../lib/geo';
import { acceptRide, fetchOpenRequests, formatMoney, paymentLabel, subscribeToRides, type Ride } from '../../lib/rides';
import { colors, fontSize } from '../../theme';

type Props = {
  online: boolean;
  position: Coord | null;
  locationDenied: boolean;
  onToggleOnline: () => Promise<void>;
  onAccepted: () => void;
  onExit: () => void;
};

const POLL_MS = 10000;

export function DriverHomeScreen({ online, position, locationDenied, onToggleOnline, onAccepted, onExit }: Props) {
  const [requests, setRequests] = useState<Ride[]>([]);
  const [toggling, setToggling] = useState(false);
  const [accepting, setAccepting] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    fetchOpenRequests()
      .then(setRequests)
      .catch(() => {});
  }, []);

  // Realtime avisa na hora; a consulta periódica cobre chamados que outro
  // motorista aceitou (que somem da visão deste sem gerar evento).
  useEffect(() => {
    if (!online) {
      setRequests([]);
      return;
    }
    refresh();
    const unsubscribe = subscribeToRides('driver-requests', refresh);
    const timer = setInterval(refresh, POLL_MS);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, [online, refresh]);

  async function toggle() {
    setToggling(true);
    setError(null);
    try {
      await onToggleOnline();
    } catch (e) {
      setError((e as { message?: string }).message || 'Não conseguimos mudar seu status.');
    } finally {
      setToggling(false);
    }
  }

  async function accept(rideId: number) {
    setAccepting(rideId);
    setError(null);
    try {
      await acceptRide(rideId);
      onAccepted();
    } catch {
      setError('Outro motorista pegou essa corrida.');
      refresh();
    } finally {
      setAccepting(null);
    }
  }

  return (
    <Screen
      title={online ? 'Você está online' : 'Você está offline'}
      subtitle={online ? 'Os chamados aparecem aqui.' : 'Fique online para receber chamados.'}
      error={error}
    >
      {online && locationDenied ? (
        <Text style={styles.warning}>Libere a localização para os passageiros te acharem.</Text>
      ) : null}

      <BigButton label={online ? 'Ficar offline' : 'Ficar online'} onPress={toggle} loading={toggling} />

      {online && requests.length === 0 ? <Text style={styles.empty}>Nenhum chamado agora.</Text> : null}

      {requests.map((ride) => {
        const away = position ? distanceKm(position, { lat: ride.origin_lat, lng: ride.origin_lng }) : null;
        return (
          <View key={ride.id} style={styles.card}>
            <Text style={styles.price}>
              {formatMoney(ride.estimated_price)} · {paymentLabel[ride.payment_method]}
            </Text>
            {away !== null ? <Text style={styles.line}>Passageiro a {formatKm(away)} de você</Text> : null}
            <Text style={styles.line}>Buscar: {ride.origin_address}</Text>
            <Text style={styles.line}>Levar: {ride.destination_address}</Text>
            <BigButton label="Aceitar" onPress={() => accept(ride.id)} loading={accepting === ride.id} />
          </View>
        );
      })}

      <BigButton label="Voltar para passageiro" onPress={onExit} variant="link" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  warning: {
    fontSize: fontSize.body - 2,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  empty: {
    fontSize: fontSize.body,
    color: colors.textMuted,
    textAlign: 'center',
  },
  card: {
    gap: 6,
    padding: 16,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  price: {
    fontSize: fontSize.body + 4,
    fontWeight: '700',
    color: colors.text,
  },
  line: {
    fontSize: fontSize.body,
    color: colors.text,
  },
});
