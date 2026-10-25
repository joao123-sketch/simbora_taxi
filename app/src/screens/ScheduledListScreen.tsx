import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BigButton } from '../components/BigButton';
import { Screen } from '../components/Screen';
import { formatMoney, type Ride } from '../lib/rides';
import { formatScheduled } from '../lib/scheduling';
import { colors, fontSize } from '../theme';

type Props = {
  rides: Ride[];
  onOpen: (ride: Ride) => void;
  onBack: () => void;
};

// As viagens agendadas do passageiro. Tocar abre a viagem (propostas, cancelar).
export function ScheduledListScreen({ rides, onOpen, onBack }: Props) {
  return (
    <Screen
      title="Viagens agendadas"
      subtitle={rides.length === 0 ? 'Você não tem viagem agendada.' : undefined}
      footer={<BigButton label="Voltar" onPress={onBack} variant="link" />}
    >
      {rides.map((ride) => (
        <Pressable
          key={ride.id}
          accessibilityRole="button"
          accessibilityLabel={`Viagem agendada ${formatScheduled(ride.scheduled_for)}`}
          onPress={() => onOpen(ride)}
          style={styles.card}
        >
          <Text style={styles.when}>{formatScheduled(ride.scheduled_for)}</Text>
          <Text style={styles.line}>Para: {ride.destination_address}</Text>
          <Text style={styles.line}>
            {ride.status === 'requested' ? 'Procurando motorista' : `Motorista: ${ride.driver_name ?? ''}`}
          </Text>
          <Text style={styles.price}>{formatMoney(ride.estimated_price)}</Text>
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 4,
    padding: 16,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  when: { fontSize: fontSize.body + 4, fontWeight: '800', color: colors.text },
  line: { fontSize: fontSize.body, color: colors.text },
  price: { fontSize: fontSize.body + 2, fontWeight: '700', color: colors.text },
});
