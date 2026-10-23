import { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { BigButton } from '../../components/BigButton';
import { RatingPrompt } from '../../components/RatingPrompt';
import { useChat } from '../../hooks/useChat';
import { Screen } from '../../components/Screen';
import { directionsUrl } from '../../lib/geo';
import {
  advanceRide,
  cancelRide,
  fetchRide,
  formatMoney,
  paymentLabel,
  subscribeToRides,
  type Ride,
  type RideStatus,
} from '../../lib/rides';
import { colors, fontSize } from '../../theme';
import { ChatScreen } from '../ChatScreen';

type Props = {
  ride: Ride;
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

export function DriverRideScreen({ ride: initialRide, onFinished }: Props) {
  const [ride, setRide] = useState(initialRide);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rated, setRated] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const inRide = ['accepted', 'arrived', 'in_progress'].includes(ride.status);
  const myId = ride.driver_id ?? '';
  const { messages, unread } = useChat(ride.id, myId, inRide && !!myId, chatOpen);

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
        <Text style={styles.price}>
          {ride.status === 'completed' ? 'Receba ' : ''}
          {formatMoney(ride.estimated_price)} · {paymentLabel[ride.payment_method]}
        </Text>
        {ride.extra_amount > 0 ? (
          <Text style={styles.line}>Já inclui o acréscimo combinado de {formatMoney(ride.extra_amount)}</Text>
        ) : null}
      </View>

      {finished ? (
        <>
          {ride.status === 'completed' && !rated ? (
            <RatingPrompt rideId={ride.id} question="Como foi o passageiro?" onDone={() => setRated(true)} />
          ) : null}
          <BigButton label="Voltar aos chamados" onPress={onFinished} />
        </>
      ) : (
        <>
          <BigButton label={nextAction[ride.status] ?? ''} onPress={advance} loading={loading} />
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
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  details: {
    gap: 4,
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
