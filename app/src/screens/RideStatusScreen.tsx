import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { BigButton } from '../components/BigButton';
import { RatingPrompt } from '../components/RatingPrompt';
import { Screen } from '../components/Screen';
import { TrackingCard } from '../components/TrackingCard';
import { useChat } from '../hooks/useChat';
import {
  cancelRide,
  fetchRide,
  fetchRideProposals,
  formatMoney,
  paymentLabel,
  respondProposal,
  subscribeToProposals,
  subscribeToRides,
  type Ride,
  type RideProposal,
  type RideStatus,
} from '../lib/rides';
import { colors, fontSize } from '../theme';
import { ChatScreen } from './ChatScreen';

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
  const [proposals, setProposals] = useState<RideProposal[]>([]);
  const [answering, setAnswering] = useState<number | null>(null);
  const [rated, setRated] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const { status } = ride;
  // Mapa e conversa existem enquanto a corrida está em andamento.
  const inRide = !!ride.driver_id && ['accepted', 'arrived', 'in_progress'].includes(status);
  const { messages, unread } = useChat(ride.id, ride.passenger_id, inRide, chatOpen);

  // Quando a corrida acaba o chat fecha sozinho, para a avaliação aparecer.
  useEffect(() => {
    if (!inRide) setChatOpen(false);
  }, [inRide]);
  const waitingProposals = status === 'requested' && !!ride.destination_place;

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

  // Motoristas podem propor um acréscimo quando o passageiro pediu um lugar
  // fora do centro de outra cidade; as propostas chegam em tempo real.
  const loadProposals = useCallback(() => {
    fetchRideProposals(initialRide.id)
      .then(setProposals)
      .catch(() => {});
  }, [initialRide.id]);

  useEffect(() => {
    if (!waitingProposals) {
      setProposals([]);
      return;
    }
    loadProposals();
    const unsubscribe = subscribeToProposals(`proposals-${initialRide.id}`, loadProposals);
    const timer = setInterval(loadProposals, 8000);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, [waitingProposals, loadProposals, initialRide.id]);

  async function answer(proposal: RideProposal, accept: boolean) {
    setAnswering(proposal.proposal_id);
    setError(null);
    try {
      await respondProposal(proposal.proposal_id, accept);
      // Aceitar fecha a corrida com o motorista; recusar só tira a proposta da lista.
      setRide(await fetchRide(initialRide.id));
      loadProposals();
    } catch (e) {
      setError((e as { message?: string }).message || 'Não conseguimos responder a proposta.');
      loadProposals();
    } finally {
      setAnswering(null);
    }
  }

  // Corrida cancelada fecha sozinha; a concluída espera a avaliação (ou o "Pular").
  useEffect(() => {
    if (status === 'cancelled') {
      const timer = setTimeout(onFinished, 4000);
      return () => clearTimeout(timer);
    }
  }, [status, onFinished]);

  function finishRating() {
    setRated(true);
    setTimeout(onFinished, 1200);
  }

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

  if (chatOpen) {
    return (
      <ChatScreen
        rideId={ride.id}
        myId={ride.passenger_id}
        role="passenger"
        messages={messages}
        canSend={inRide}
        onClose={() => setChatOpen(false)}
      />
    );
  }

  return (
    <Screen title={statusText[status]} error={error}>
      {status === 'requested' ? <ActivityIndicator size="large" color={colors.primary} /> : null}

      {inRide ? <TrackingCard ride={ride} /> : null}

      {hasDriver ? (
        <View style={styles.driverCard}>
          <Text style={styles.driverName}>{ride.driver_name}</Text>
          <Text style={styles.line}>
            {ride.vehicle_model} {ride.vehicle_color}
          </Text>
          <Text style={styles.plate}>{ride.vehicle_plate}</Text>
        </View>
      ) : null}

      {waitingProposals ? (
        <Text style={styles.hint}>
          Você pediu para ser deixado em {ride.destination_place}. O motorista pode aceitar pelo valor ou propor um
          acréscimo.
        </Text>
      ) : null}

      {proposals.map((proposal) => (
        <View key={proposal.proposal_id} style={styles.driverCard}>
          <Text style={styles.driverName}>{proposal.driver_name}</Text>
          <Text style={styles.line}>
            {proposal.vehicle_model} {proposal.vehicle_color} · {proposal.vehicle_plate}
          </Text>
          <Text style={styles.price}>
            Propõe + {formatMoney(proposal.extra_amount)} (total {formatMoney(ride.estimated_price + proposal.extra_amount)})
          </Text>
          <BigButton
            label="Aceitar proposta"
            onPress={() => answer(proposal, true)}
            loading={answering === proposal.proposal_id}
          />
          <BigButton label="Recusar" onPress={() => answer(proposal, false)} variant="link" />
        </View>
      ))}

      <View style={styles.details}>
        <Text style={styles.line}>De: {ride.origin_address}</Text>
        <Text style={styles.line}>
          Para: {ride.destination_address}
          {ride.destination_place ? ` — ${ride.destination_place}` : ''}
        </Text>
        <Text style={styles.price}>
          {formatMoney(ride.estimated_price)} · {paymentLabel[ride.payment_method]}
        </Text>
        {ride.extra_amount > 0 ? (
          <Text style={styles.line}>Já inclui o acréscimo combinado de {formatMoney(ride.extra_amount)}</Text>
        ) : null}
      </View>
      {inRide ? (
        <BigButton label={unread > 0 ? `Mensagens (${unread} nova${unread > 1 ? 's' : ''})` : 'Mensagens'} onPress={() => setChatOpen(true)} />
      ) : null}

      {CANCELABLE.includes(status) ? (
        <BigButton label="Cancelar corrida" onPress={cancel} loading={cancelling} variant="link" />
      ) : null}

      {status === 'completed' ? (
        rated ? (
          <Text style={styles.line}>Obrigado!</Text>
        ) : (
          <RatingPrompt rideId={ride.id} question="Como foi o motorista?" onDone={finishRating} />
        )
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hint: {
    fontSize: fontSize.body - 2,
    color: colors.textMuted,
  },
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
