import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Share, StyleSheet, Text, View } from 'react-native';

import { PassengerAdvanceNote } from '../components/AdvancePayment';
import { notify } from '../lib/notify';
import { fetchPhotoPath } from '../lib/profile';
import { Avatar } from '../components/Avatar';
import { BigButton } from '../components/BigButton';
import { RatingPrompt } from '../components/RatingPrompt';
import { Screen } from '../components/Screen';
import { SosButton } from '../components/SosButton';
import { TrackingCard } from '../components/TrackingCard';
import { useDriverPosition } from '../hooks/useDriverPosition';
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
import { confirmState, tripEvents, type TripSnapshot } from '../lib/intercity';
import { confirmScheduledRide, formatScheduled, isScheduledWait } from '../lib/scheduling';
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
  const [confirming, setConfirming] = useState(false);
  const delivery = isDelivery(ride);
  const { status } = ride;
  // Aviso do sistema quando o estado da corrida muda e o app está em segundo plano.
  const lastStatus = useRef(status);
  useEffect(() => {
    if (lastStatus.current === status) return;
    lastStatus.current = status;
    const texts: Partial<Record<RideStatus, [string, string]>> = {
      accepted: ['Motorista a caminho', 'Um motorista aceitou a sua corrida.'],
      arrived: ['O motorista chegou', 'Ele está esperando você.'],
      completed: ['Corrida concluída', 'Obrigado por andar com o Simbora Car.'],
      cancelled: ['Corrida cancelada', 'Toque para voltar ao início.'],
    };
    // Viagem entre cidades: o aviso de cancelamento sai pelo acompanhamento da viagem (abaixo).
    const text = isIntercity(ride) && status === 'cancelled' ? undefined : texts[status];
    if (text) notify(text[0], text[1], { tag: `corrida-${ride.id}` });
  }, [status, ride.id]);
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
  const { position: driverPosition, stale: driverStale } = useDriverPosition(ride.driver_id, inRide);

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
  const waitingProposals = status === 'requested' && isIntercity(ride);

  // Avisos da viagem entre cidades: nova proposta, cancelamento, viagem sem efeito.
  const lastTrip = useRef<TripSnapshot | null>(null);
  useEffect(() => {
    if (!isIntercity(ride)) return;
    const next: TripSnapshot = {
      status,
      proposals: proposals.length,
      confirmedAt: ride.confirmed_at ?? null,
      voided: ride.void_reason === 'not_confirmed',
    };
    for (const event of tripEvents(lastTrip.current, next, 'passenger')) {
      notify(event.title, event.body, { tag: `${event.tag}-${ride.id}` });
    }
    lastTrip.current = next;
  }, [status, proposals.length, ride]);

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

  // Motoristas aceitam o valor ou propõem outro nas viagens para outra cidade; as propostas chegam em tempo real.
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
      const result = await respondProposal(proposal.proposal_id, accept);
      if (result === 'unavailable') setError('Esse motorista não está mais disponível. Escolha outra proposta.');
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

  async function confirmTrip() {
    setConfirming(true);
    setError(null);
    try {
      await confirmScheduledRide(ride.id);
      setRide(await fetchRide(ride.id));
    } catch (e) {
      setError((e as { message?: string }).message || 'Não conseguimos confirmar. Tente de novo.');
    } finally {
      setConfirming(false);
    }
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
  const [driverPhoto, setDriverPhoto] = useState<string | null>(null);
  useEffect(() => {
    if (!ride.driver_id || !hasDriver) {
      setDriverPhoto(null);
      return;
    }
    let alive = true;
    fetchPhotoPath(ride.driver_id)
      .then((path) => alive && setDriverPhoto(path))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [ride.driver_id, hasDriver]);

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
      backdrop={{
        center: { lat: ride.origin_lat, lng: ride.origin_lng },
        line: !driverPosition,
        markers: [
          { coord: { lat: ride.origin_lat, lng: ride.origin_lng }, kind: 'origin' },
          { coord: { lat: ride.destination_lat, lng: ride.destination_lng }, kind: 'dest' },
          ...(driverPosition ? [{ coord: driverPosition, kind: ride.vehicle_type === 'moto' ? ('moto' as const) : ('car' as const) }] : []),
        ],
      }}
    >
      {ride.scheduled_for && scheduledWait ? (
        <Text style={styles.price}>Marcada para {formatScheduled(ride.scheduled_for)}</Text>
      ) : null}
      {status === 'requested' ? <ActivityIndicator size="large" color={colors.primary} /> : null}

      {inRide ? <TrackingCard ride={ride} position={driverPosition} stale={driverStale} /> : null}
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

      {ride.void_reason === 'not_confirmed' ? (
        <Text style={styles.hint}>Viagem sem efeito: você não confirmou a tempo. Peça de novo quando quiser.</Text>
      ) : null}

      {ride.scheduled_for && status === 'accepted' && !!ride.driver_id
        ? (() => {
            const state = confirmState(ride.scheduled_for, ride.confirmed_at ?? null, new Date());
            if (state === 'open') {
              return (
                <>
                  <Text style={styles.hint}>Confirme a viagem para ela valer. Sem confirmar até 2 horas antes, ela fica sem efeito.</Text>
                  <BigButton label="Confirmar viagem" onPress={confirmTrip} loading={confirming} />
                </>
              );
            }
            if (state === 'too_early') {
              return <Text style={styles.hint}>Você poderá confirmar a viagem a partir de 12 horas antes da hora marcada.</Text>;
            }
            if (state === 'not_needed') return <Text style={styles.hint}>Viagem confirmada.</Text>;
            return null;
          })()
        : null}

      {hasDriver ? (
        <View style={styles.driverCard}>
          <View style={styles.driverRow}>
            <Avatar path={driverPhoto} size={64} />
            <Text style={styles.driverName}>{ride.driver_name}</Text>
          </View>
          <Text style={styles.line}>
            {ride.vehicle_model} {ride.vehicle_color}
          </Text>
          <Text style={styles.plate}>{ride.vehicle_plate}</Text>
        </View>
      ) : null}

      {waitingProposals ? (
        <Text style={styles.hint}>
          {ride.round_trip ? 'Você pediu ida e volta. ' : ''}
          Os motoristas podem aceitar pelo valor ou propor outro. Você escolhe com quem ir.
        </Text>
      ) : null}

      {proposals.map((proposal) => (
        <View key={proposal.proposal_id} style={styles.driverCard}>
          <View style={styles.driverRow}>
            <Avatar path={proposal.driver_photo_path} size={64} />
            <Text style={styles.driverName}>{proposal.driver_name}</Text>
          </View>
          <Text style={styles.line}>
            {proposal.vehicle_model} {proposal.vehicle_color} · {proposal.vehicle_plate}
          </Text>
          <Text style={styles.price}>
            {proposal.extra_amount > 0
              ? `Propõe ${formatMoney(ride.estimated_price + proposal.extra_amount)} (+ ${formatMoney(proposal.extra_amount)})`
              : `Aceita o valor: ${formatMoney(ride.estimated_price)}`}
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
        {ride.rider_name ? <Text style={styles.line}>Quem vai andar: {ride.rider_name}</Text> : null}
        <Text style={styles.line}>{delivery ? 'Pegar em' : 'De'}: {ride.origin_address}</Text>
        <Text style={styles.line}>
          {delivery ? 'Entregar em' : 'Para'}: {ride.destination_address}
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
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  driverName: {
    flex: 1,
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
