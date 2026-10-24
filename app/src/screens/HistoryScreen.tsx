import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BigButton } from '../components/BigButton';
import { Dashboard } from '../components/Dashboard';
import { Screen } from '../components/Screen';
import { StarRating } from '../components/StarRating';
import { fetchHistory, formatDateTime, formatMoney, paymentLabel, rateRide, roundTripLabel, vehicleLabel, type Ride } from '../lib/rides';
import { colors, fontSize } from '../theme';

type Props = {
  role: 'passenger' | 'driver';
  userId: string;
  onBack: () => void;
};

// As corridas já encerradas do usuário, as mais novas primeiro. Quem ainda não
// avaliou uma corrida concluída pode avaliar daqui.
export function HistoryScreen({ role, userId, onBack }: Props) {
  const [rides, setRides] = useState<Ride[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchHistory(role, userId)
      .then(setRides)
      .catch(() => setError('Não conseguimos carregar as corridas. Confira a internet.'));
  }, [role, userId]);

  useEffect(() => {
    load();
  }, [load]);

  async function rate(ride: Ride, stars: number) {
    setError(null);
    try {
      await rateRide(ride.id, stars);
      load();
    } catch (e) {
      setError((e as { message?: string }).message || 'Não conseguimos enviar a nota.');
    }
  }

  const other = (ride: Ride) => (role === 'passenger' ? ride.driver_name : ride.passenger_name);

  return (
    <Screen
      title="Minhas corridas"
      error={error}
      footer={<BigButton label="Voltar" onPress={onBack} variant="link" />}
    >
      <Dashboard role={role} userId={userId} />

      {rides === null && !error ? <Text style={styles.empty}>Carregando...</Text> : null}
      {rides?.length === 0 ? <Text style={styles.empty}>Você ainda não fez nenhuma corrida.</Text> : null}

      {rides?.map((ride) => {
        const cancelled = ride.status === 'cancelled';
        const when = formatDateTime((cancelled ? ride.cancelled_at : ride.completed_at) ?? ride.requested_at);
        return (
          <View key={ride.id} style={styles.card}>
            <Text style={styles.when}>
              {when} · {vehicleLabel[ride.vehicle_type]}
              {cancelled ? ' · Cancelada' : ''}
            </Text>
            <Text style={styles.line}>De: {ride.origin_address}</Text>
            <Text style={styles.line}>
              Para: {ride.destination_address}
              {ride.destination_place ? ` — ${ride.destination_place}` : ''}
            </Text>
            {roundTripLabel(ride) ? <Text style={styles.line}>{roundTripLabel(ride)}</Text> : null}
            {other(ride) ? <Text style={styles.line}>{role === 'passenger' ? 'Motorista' : 'Passageiro'}: {other(ride)}</Text> : null}
            <Text style={styles.price}>
              {formatMoney(ride.final_price ?? ride.estimated_price)} · {paymentLabel[ride.payment_method]}
            </Text>
            {!cancelled ? (
              ride.my_rating ? (
                <StarRating value={ride.my_rating} size={32} />
              ) : (
                <View style={styles.rate}>
                  <Text style={styles.line}>Avalie esta corrida:</Text>
                  <StarRating onRate={(stars) => rate(ride, stars)} size={44} />
                </View>
              )
            ) : null}
          </View>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: {
    fontSize: fontSize.body,
    color: colors.textMuted,
    textAlign: 'center',
  },
  card: {
    gap: 4,
    padding: 16,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#CCCCCC',
  },
  when: {
    fontSize: fontSize.body - 2,
    fontWeight: '700',
    color: colors.textMuted,
  },
  line: {
    fontSize: fontSize.body,
    color: colors.text,
  },
  price: {
    fontSize: fontSize.body + 2,
    fontWeight: '700',
    color: colors.text,
    marginTop: 4,
  },
  rate: {
    gap: 4,
    marginTop: 6,
  },
});
