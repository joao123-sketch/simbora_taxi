import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Share, StyleSheet, Text, View } from 'react-native';

import { PassengerAdvanceNote } from '../components/AdvancePayment';
import { BigButton } from '../components/BigButton';
import { RatingPrompt } from '../components/RatingPrompt';
import { Screen } from '../components/Screen';
import { SosButton } from '../components/SosButton';
import { TrackingCard } from '../components/TrackingCard';
import { useChat } from '../hooks/useChat';
import { usePassengerLocation } from '../hooks/usePassengerLocation';
import { fetchDeliveryCode, isDelivery, packageLabel } from '../lib/delivery';
import {
  cancelRide,
  fetchRide,
  fetchRideProposals,
  formatMoney,
  isIntercity,
  paymentLabel,
  respondProposal,
  roundTripLabel,
  subscribeToProposals,
  subscribeToRides,
  type Ride,
  type RideProposal,
  type RideStatus,
} from '../lib/rides';
import { formatScheduled, isScheduledWait } from '../lib/scheduling';
import { createRideShare, recipientMessage, tripShareMessage } from '../lib/share';
import { colors, fontSize, cardSurface } from '../theme';
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

const deliveryStatusText: Record<RideStatus, string> = {
  requested: 'Procurando entregador...',
  accepted: 'O entregador está indo buscar o pacote',
  arrived: 'O entregador chegou para pegar o pacote',
  in_progress: 'O pacote está a caminho',
  completed: 'Entrega concluída',
  cancelled: 'Entrega cancelada',
};

const CANCELABLE: RideStatus[] = ['requested', 'accepted', 'arrived'];
const ACTIVE_FOR_SHARE: RideStatus[] = ['requested', 'accepted', 'arrived', 'in_progress'];

export function RideStatusScreen({ ride: initialRide, onFinished }: Props) {
  const [ride, setRide] = useState(initialRide);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposals, setProposals] = useState<RideProposal[]>([]);
  const [answering, setAnswering] = useState<number | null>(null);
  const [rated, setRated] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [deliveryCode, setDeliveryCode] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const delivery = isDelivery(ride);
  const { status } = ride;
  // Viagem agendada ainda longe da hora: o pedido e o motorista existem, mas ninguém está a caminho.
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(timer);
  }, []);
  const scheduledWait = isScheduledWait(ride);
  // Mapa e conversa existem enquanto a corrida está em andamento.
  const inRide = !!ride.driver_id && ['accepted', 'arrived', 'in_progress'].includes(status) && !scheduledWait;
  const { messages, unread } = useChat(ride.id, ride.passenger_id, inRide, chatOpen);
  // Enquanto espera o motorista, o passageiro compartilha onde está; ao embarcar para.
  const waitingForDriver = !!ride.driver_id && (status === 'accepted' || status === 'arrived') && !scheduledWait;
  usePassengerLocation(waitingForDriver);

  // O código de 4 dígitos da entrega: quem pediu manda a quem recebe.
  useEffect(() => {
    if (!delivery) return;
    fetchDeliveryCode(ride.id)
      .then(setDeliveryCode)
      .catch(() => {});
  }, [delivery, ride.id]);

  // Gera o link do trajeto e abre o compartilhamento (WhatsApp, copiar...).
  async function shareTrip() {
    setSharing(true);
    setError(null);
    try {
      const url = await createRideShare(ride.id);
      const message =
        delivery && deliveryCode
          ? recipientMessage(ride.recipient_name ?? '', deliveryCode, url)
          : tripShareMessage(ride, url);
      await Share.share({ message });
    } catch {
      setError('Não conseguimos gerar o link. Confira a internet.');
    } finally {
      setSharing(false);
    }
  }

  // Quando a corrida acaba o chat fecha sozinho, para a avaliação aparecer.
  useEffect(() => {
    if (!inRide) setChatOpen(false);
  }, [inRide]);
  const waitingProposals =
    status === 'requested' && (!!ride.destination_place || !!ride.round_trip || !!ride.scheduled_for);

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

  // A cancelada espera o passageiro tocar em "Voltar ao início"; a concluída
  // espera a avaliação (ou o "Pular").
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
    } catch (e) {
      // A mensagem do banco (já em português) diz o motivo; sem ela, um aviso genérico.
      setError((e as { message?: string }).message || 'Não conseguimos cancelar. Tente de novo.');
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
    <Screen
      title={
        scheduledWait && status === 'requested'
          ? 'Viagem agendada: procurando motorista'
          : scheduledWait && status === 'accepted'
            ? 'Viagem agendada'
            : (delivery ? deliveryStatusText : statusText)[status]
      }
      error={error}
    >
      {ride.scheduled_for && scheduledWait ? (
        <Text style={styles.price}>Marcada para {formatScheduled(ride.scheduled_for)}</Text>
      ) : null}
      {status === 'requested' ? <ActivityIndicator size="large" color={colors.primary} /> : null}

      {inRide ? <TrackingCard ride={ride} /> : null}
      {waitingForDriver && !delivery ? (
        <Text style={styles.hint}>O motorista vê onde você está enquanto vem te buscar.</Text>
      ) : null}

      {delivery && deliveryCode && ride.status !== 'cancelled' && ride.status !== 'completed' ? (
        <View style={styles.driverCard}>
          <Text style={styles.line}>Código da entrega (quem recebe diz ao entregador):</Text>
          <Text style={styles.code}>{deliveryCode}</Text>
        </View>
      ) : null}

      {waitingForDriver && isIntercity(ride) ? <PassengerAdvanceNote ride={ride} /> : null}

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
          {ride.destination_place
            ? `Você pediu para ser deixado em ${ride.destination_place}. `
            : ride.round_trip
              ? 'Você pediu ida e volta. '
              : 'Você agendou a viagem. '}
          O motorista pode aceitar pelo valor ou propor um acréscimo.
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
          {proposal.advance_percent === 0 ? (
            <Text style={styles.line}>Sem adiantamento: você paga ao motorista no fim da viagem.</Text>
          ) : null}
          {proposal.advance_percent ? (
            <Text style={styles.line}>
              Pede {proposal.advance_percent}% adiantado:{' '}
              {formatMoney(Math.round((ride.estimated_price + proposal.extra_amount) * proposal.advance_percent) / 100)}.
              Você paga direto ao motorista antes de a viagem começar.
            </Text>
          ) : null}
          <BigButton
            label="Aceitar proposta"
            onPress={() => answer(proposal, true)}
            loading={answering === proposal.proposal_id}
          />
          <BigButton label="Recusar" onPress={() => answer(proposal, false)} variant="link" />
        </View>
      ))}

      <View style={styles.details}>
        <Text style={styles.line}>{delivery ? 'Pegar em' : 'De'}: {ride.origin_address}</Text>
        <Text style={styles.line}>
          {delivery ? 'Entregar em' : 'Para'}: {ride.destination_address}
          {ride.destination_place ? ` — ${ride.destination_place}` : ''}
        </Text>
        {delivery ? (
          <>
            <Text style={styles.line}>Pacote: {packageLabel(ride.package_size)}</Text>
            <Text style={styles.line}>Quem recebe: {ride.recipient_name}</Text>
          </>
        ) : null}
        {roundTripLabel(ride) ? <Text style={styles.line}>{roundTripLabel(ride)}</Text> : null}
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

      {ACTIVE_FOR_SHARE.includes(status) ? (
        <BigButton
          label={delivery ? 'Mandar mensagem para quem recebe' : 'Compartilhar meu trajeto'}
          onPress={shareTrip}
          loading={sharing}
          variant="link"
        />
      ) : null}

      {CANCELABLE.includes(status) ? (
        <BigButton label={delivery ? 'Cancelar entrega' : 'Cancelar corrida'} onPress={cancel} loading={cancelling} variant="link" />
      ) : null}

      {inRide ? <SosButton ride={ride} role="passenger" /> : null}

      {status === 'cancelled' ? <BigButton label="Voltar ao início" onPress={onFinished} /> : null}

      {status === 'completed' ? (
        rated ? (
          <Text style={styles.line}>Obrigado!</Text>
        ) : (
          <RatingPrompt rideId={ride.id} question={delivery ? 'Como foi o entregador?' : 'Como foi o motorista?'} onDone={finishRating} />
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
    ...cardSurface,
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
  code: {
    fontSize: 44,
    fontWeight: '800',
    letterSpacing: 8,
    color: colors.text,
    textAlign: 'center',
  },
  price: {
    fontSize: fontSize.body + 4,
    fontWeight: '700',
    color: colors.text,
    marginTop: 8,
  },
});
