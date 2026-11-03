import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '../components/Screen';
import { formatMoney, type Ride } from '../lib/rides';
import { confirmState } from '../lib/intercity';
import { formatScheduled } from '../lib/scheduling';
import { colors, fontSize, cardSurface } from '../theme';

type Props = {
  rides: Ride[];
  // Quantas propostas de motoristas cada viagem tem esperando resposta.
  proposalCounts: Record<number, number>;
  // Acabou de lançar uma viagem: avisa que pode fechar o app.
  justCreated?: boolean;
  onOpen: (ride: Ride) => void;
  onBack: () => void;
};

// Depois do nome do motorista: se já confirmou, se pode confirmar agora ou se ainda é cedo.
function confirmNote(ride: Ride): string {
  if (!ride.scheduled_for) return '';
  const state = confirmState(ride.scheduled_for, ride.confirmed_at ?? null, new Date());
  if (state === 'open') return ' · toque para confirmar a viagem';
  if (state === 'too_early') return ' · confirmar a partir de 12 h antes';
  if (state === 'not_needed') return ' · confirmada';
  return '';
}

// As viagens agendadas do passageiro. Tocar abre a viagem (propostas, cancelar).
export function ScheduledListScreen({ rides, proposalCounts, justCreated, onOpen, onBack }: Props) {
  return (
    <Screen
      title="Viagens agendadas"
      subtitle={
        justCreated
          ? 'Viagem lançada! Pode fechar o app: ela fica aqui até um motorista aceitar ou fazer uma proposta. Quando voltar, é só abrir.'
          : rides.length === 0
            ? 'Você não tem viagem agendada.'
            : undefined
      }
      onBack={onBack}
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
            {ride.status === 'requested'
              ? proposalCounts[ride.id] > 0
                ? `${proposalCounts[ride.id]} proposta${proposalCounts[ride.id] > 1 ? 's' : ''} de motorista esperando você`
                : 'Procurando motorista'
              : `Motorista: ${ride.driver_name ?? ''}${confirmNote(ride)}`}
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
    ...cardSurface,
  },
  when: { fontSize: fontSize.body + 4, fontWeight: '800', color: colors.text },
  line: { fontSize: fontSize.body, color: colors.text },
  price: { fontSize: fontSize.body + 2, fontWeight: '700', color: colors.text },
});
