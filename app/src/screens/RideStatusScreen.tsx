import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';

import { BigButton } from '../components/BigButton';
import { Screen } from '../components/Screen';
import {
  cancelRide,
  fetchRide,
  formatMoney,
  formatPhoneNumber,
  paymentLabel,
  subscribeToRides,
  type Ride,
  type RideStatus,
} from '../lib/rides';
import { colors, fontSize } from '../theme';

type Props = {
  ride: Ride;
  onFinished: () => void;
};

const statusText: Record<RideStatus, string> = {
  requested: 'Procurando motorista...',
  accepted: 'O motorista está a caminho',
  arrived: 'O motorista chegou!',
  in_progress: 'Boa viagem!',
  completed: 'Corrida concluída',
  cancelled: 'Corrida cancelada',
};

const CANCELABLE: RideStatus[] = ['requested', 'accepted', 'arrived'];

export function RideStatusScreen({ ride: initialRide, onFinished }: Props) {
  const [ride, setRide] = useState(initialRide);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { status } = ride;

  // A cada mudança (motorista aceitou, chegou...) busca de novo os detalhes,
  // que trazem nome, carro e placa do motorista.
  useEffect(
    () =>
      subscribeToRides(
        `ride-${initialRide.id}`,
        () => fetchRide(initialRide.id).then(setRide).catch(() => {}),
        `id=eq.${initialRide.id}`,
      ),
    [initialRide.id],
  );

  useEffect(() => {
    if (status === 'completed' || status === 'cancelled') {
      const timer = setTimeout(onFinished, 4000);
      return () => clearTimeout(timer);
    }
  }, [status, onFinished]);

  async function cancel() {
    setCancelling(true);
    setError(null);
    try {
      await cancelRide(ride.id);
      setRide({ ...ride, status: 'cancelled' });
    } catch {
      setError('Não conseguimos cancelar. Tente de novo.');
    } finally {
      setCancelling(false);
    }
  }

  const hasDriver = ride.driver_name && status !== 'requested';

  return (
    <Screen title={statusText[status]} error={error}>
      {status === 'requested' ? <ActivityIndicator size="large" color={colors.primary} /> : null}

      {hasDriver ? (
        <View style={styles.driverCard}>
          <Text style={styles.driverName}>{ride.driver_name}</Text>
          <Text style={styles.line}>
            {ride.vehicle_model} {ride.vehicle_color}
          </Text>
          <Text style={styles.plate}>{ride.vehicle_plate}</Text>
          {ride.driver_phone && CANCELABLE.includes(status) ? (
            <BigButton
              label={`Ligar: ${formatPhoneNumber(ride.driver_phone)}`}
              onPress={() => Linking.openURL(`tel:+${ride.driver_phone}`)}
              variant="link"
            />
          ) : null}
        </View>
      ) : null}

      <View style={styles.details}>
        <Text style={styles.line}>De: {ride.origin_address}</Text>
        <Text style={styles.line}>Para: {ride.destination_address}</Text>
        <Text style={styles.price}>
          {formatMoney(ride.estimated_price)} · {paymentLabel[ride.payment_method]}
        </Text>
      </View>
      {CANCELABLE.includes(status) ? (
        <BigButton label="Cancelar corrida" onPress={cancel} loading={cancelling} variant="link" />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  driverCard: {
    gap: 4,
    padding: 16,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  driverName: {
    fontSize: fontSize.body + 6,
    fontWeight: '700',
    color: colors.text,
  },
  plate: {
    alignSelf: 'flex-start',
    fontSize: fontSize.body + 4,
    fontWeight: '700',
    letterSpacing: 2,
    color: colors.text,
    borderWidth: 2,
    borderColor: colors.text,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 2,
    marginTop: 4,
  },
  details: {
    gap: 4,
  },
  line: {
    fontSize: fontSize.body,
    color: colors.text,
  },
  price: {
    fontSize: fontSize.body + 4,
    fontWeight: '700',
    color: colors.text,
    marginTop: 8,
  },
});
