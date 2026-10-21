import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { BigButton } from '../components/BigButton';
import { Screen } from '../components/Screen';
import { cancelRide, formatMoney, paymentLabel, type Ride, type RideStatus } from '../lib/rides';
import { supabase } from '../lib/supabase';
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

export function RideStatusScreen({ ride, onFinished }: Props) {
  const [status, setStatus] = useState<RideStatus>(ride.status);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Escuta as mudanças da corrida em tempo real (motorista aceitou, chegou...).
  useEffect(() => {
    const channel = supabase
      .channel(`ride-${ride.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rides', filter: `id=eq.${ride.id}` },
        (payload) => setStatus((payload.new as Ride).status),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [ride.id]);

  useEffect(() => {
    if (status === 'completed' || status === 'cancelled') {
      const timer = setTimeout(onFinished, 2500);
      return () => clearTimeout(timer);
    }
  }, [status, onFinished]);

  async function cancel() {
    setCancelling(true);
    setError(null);
    try {
      await cancelRide(ride.id);
      setStatus('cancelled');
    } catch {
      setError('Não conseguimos cancelar. Tente de novo.');
    } finally {
      setCancelling(false);
    }
  }

  return (
    <Screen title={statusText[status]} error={error}>
      {status === 'requested' ? <ActivityIndicator size="large" color={colors.primary} /> : null}
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
