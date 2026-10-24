import { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { DriverAdvanceCard } from '../../components/AdvancePayment';
import { BigButton } from '../../components/BigButton';
import { LiveMap } from '../../components/LiveMap';
import type { Coord } from '../../components/PinMap.types';
import { RatingPrompt } from '../../components/RatingPrompt';
import { SosButton } from '../../components/SosButton';
import { useChat } from '../../hooks/useChat';
import { usePassengerPosition } from '../../hooks/usePassengerPosition';
import { Screen } from '../../components/Screen';
import { directionsUrl, distanceKm, formatKm } from '../../lib/geo';
import {
  advanceRide,
  cancelRide,
  fetchRide,
  formatMoney,
  isIntercity,
  roundTripLabel,
  paymentLabel,
  subscribeToRides,
  type Ride,
  type RideStatus,
} from '../../lib/rides';
import { colors, fontSize } from '../../theme';
import { ChatScreen } from '../ChatScreen';

type Props = {
  ride: Ride;
  // Onde o motorista está agora (o DriverFlow já acompanha o GPS dele).
  position: Coord | null;
  onFinished: () => void;
};

const titles: Partial<Record<RideStatus, string>> = {
  accepted: 'Vá buscar o passageiro',
  arrived: 'Aguardando o passageiro',
  in_progress: 'Leve ao destino',
  completed: 'Corrida concluída!',
  cancelled: 'Corrida cancelada',
};

const nextAction: Partial<Record<RideStatus, string>> = {
  accepted: 'Cheguei',
  arrived: 'Iniciar corrida',
  in_progress: 'Finalizar corrida',
};

export function DriverRideScreen({ ride: initialRide, position, onFinished }: Props) {
  const [ride, setRide] = useState(initialRide);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rated, setRated] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const inRide = ['accepted', 'arrived', 'in_progress'].includes(ride.status);
  const myId = ride.driver_id ?? '';
  const { messages, unread } = useChat(ride.id, myId, inRide && !!myId, chatOpen);
  // Até o embarque o motorista vê o passageiro se aproximando no mapa.
  const waitingForPassenger = ride.status === 'accepted' || ride.status === 'arrived';
  const passengerPosition = usePassengerPosition(ride.id, waitingForPassenger);

  // Quando a corrida acaba o chat fecha sozinho, para a avaliação aparecer.
  useEffect(() => {
    if (!inRide) setChatOpen(false);
  }, [inRide]);

  // Atualiza se o passageiro cancelar.
  useEffect(
    () =>
      subscribeToRides(
        `driver-ride-${ride.id}`,
        () => fetchRide(ride.id).then(setRide).catch(() => {}),
        `id=eq.${ride.id}`,
      ),
    [ride.id],
  );

  async function advance() {
    setLoading(true);
    setError(null);
    try {
      const status = await advanceRide(ride.id);
      setRide({ ...ride, status });
    } catch {
      setError('Não conseguimos atualizar a corrida. Tente de novo.');
    } finally {
      setLoading(false);
    }
  }

  async function cancel() {
    setLoading(true);
    setError(null);
    try {
      await cancelRide(ride.id);
      setRide({ ...ride, status: 'cancelled' });
    } catch {
      setError('Não conseguimos cancelar.');
    } finally {
      setLoading(false);
    }
  }

  const goingToDestination = ride.status === 'in_progress';
  const target = goingToDestination
    ? { lat: ride.destination_lat, lng: ride.destination_lng }
    : { lat: ride.origin_lat, lng: ride.origin_lng };
  const finished = ride.status === 'completed' || ride.status === 'cancelled';
  // Viagem para outra cidade: só inicia depois do adiantamento recebido.
  const needsAdvance = isIntercity(ride) && ride.status === 'arrived' && !ride.advance_received_at;

  // O que a linha de cima do mapa diz: para onde ir e a que distância está.
  let mapText: string | null = null;
  if (position && inRide) {
    const km = distanceKm(position, target);
    mapText = goingToDestination
      ? `Destino a ${formatKm(km * 1.3)}`
      : km < 0.1
        ? 'Você chegou ao ponto de encontro'
        : `Passageiro a ${formatKm(km * 1.3)} de você`;
  }

  if (chatOpen) {
    return (
      <ChatScreen
        rideId={ride.id}
        myId={myId}
        role="driver"
        messages={messages}
        canSend={inRide}
        onClose={() => setChatOpen(false)}
      />
    );
  }

  return (
    <Screen title={titles[ride.status] ?? ''} error={error}>
      <View style={styles.details}>
        <Text style={styles.name}>{ride.passenger_name ?? 'Passageiro'}</Text>
        <Text style={styles.line}>Buscar: {ride.origin_address}</Text>
        <Text style={styles.line}>Levar: {ride.destination_address}</Text>
        {ride.destination_place ? (
          <Text style={styles.place}>Deixar em: {ride.destination_place}</Text>
        ) : null}
        {roundTripLabel(ride) ? <Text style={styles.place}>{roundTripLabel(ride)}</Text> : null}
        <Text style={styles.price}>
          {ride.status === 'completed' ? 'Receba ' : ''}
          {formatMoney(ride.estimated_price)} · {paymentLabel[ride.payment_method]}
        </Text>
        {ride.extra_amount > 0 ? (
          <Text style={styles.line}>Já inclui o acréscimo combinado de {formatMoney(ride.extra_amount)}</Text>
        ) : null}
      </View>

      {position && inRide ? (
        <View style={styles.mapBox}>
          {mapText ? <Text style={styles.mapText}>{mapText}</Text> : null}
          <LiveMap target={target} driver={position} passenger={passengerPosition} vehicle="car" />
          {passengerPosition ? <Text style={styles.line}>O passageiro está vindo até você.</Text> : null}
        </View>
      ) : null}

      {finished ? (
        <>
          {ride.status === 'completed' && !rated ? (
            <RatingPrompt rideId={ride.id} question="Como foi o passageiro?" onDone={() => setRated(true)} />
          ) : null}
          <BigButton label="Voltar ao início" onPress={onFinished} />
        </>
      ) : (
        <>
          {isIntercity(ride) && waitingForPassenger ? <DriverAdvanceCard ride={ride} onChange={setRide} /> : null}
          {needsAdvance ? (
            <Text style={styles.line}>Marque o recebimento do adiantamento para iniciar a viagem.</Text>
          ) : (
            <BigButton label={nextAction[ride.status] ?? ''} onPress={advance} loading={loading} />
          )}
          <BigButton
            label={unread > 0 ? `Mensagens (${unread} nova${unread > 1 ? 's' : ''})` : 'Mensagens'}
            onPress={() => setChatOpen(true)}
            variant="link"
          />
          <BigButton
            label={goingToDestination ? 'Rota até o destino' : 'Rota até o passageiro'}
            onPress={() => Linking.openURL(directionsUrl(target))}
            variant="link"
          />
          {ride.status !== 'in_progress' ? (
            <BigButton label="Cancelar corrida" onPress={cancel} variant="link" />
          ) : null}
          <SosButton ride={ride} role="driver" />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  details: {
    gap: 4,
  },
  mapBox: {
    gap: 8,
  },
  mapText: {
    fontSize: fontSize.body + 2,
    fontWeight: '700',
    color: colors.text,
  },
  name: {
    fontSize: fontSize.body + 6,
    fontWeight: '700',
    color: colors.text,
  },
  place: {
    fontSize: fontSize.body + 2,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  warning: {
    fontSize: fontSize.body - 2,
    fontWeight: '700',
    color: colors.primaryDark,
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
