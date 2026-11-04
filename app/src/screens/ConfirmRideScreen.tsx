import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { BigButton } from '../components/BigButton';
import { ChoiceCard } from '../components/ChoiceCard';
import { Screen } from '../components/Screen';
import { packageLabel } from '../lib/delivery';
import { formatScheduled } from '../lib/scheduling';
import {
  fetchPaymentOptions,
  formatMoney,
  paymentLabel,
  priceFor,
  quoteRide,
  requestRide,
  roundTripLabel,
  vehicleLabel,
  type PaymentMethod,
  type Place,
  type Quote,
  type VehicleType,
} from '../lib/rides';
import { colors, fontSize } from '../theme';

type Props = {
  cityId: number;
  origin: Place;
  destination: Place;
  onRequested: (rideId: number) => void;
  onBack: () => void;
};

// Enquanto as formas não chegam do banco, o padrão é dinheiro e Pix.
const DEFAULT_OPTIONS: PaymentMethod[] = ['cash', 'pix'];

export function ConfirmRideScreen({ cityId, origin, destination, onRequested, onBack }: Props) {
  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  const [vehicle, setVehicle] = useState<VehicleType>('car');
  const [payment, setPayment] = useState<PaymentMethod>('cash');
  const [options, setOptions] = useState<PaymentMethod[]>(DEFAULT_OPTIONS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const delivery = destination.delivery;

  // Busca os preços de agora. Cada cotação vale 2 minutos; depois disso o
  // preço pode ter mudado e o passageiro precisa ver o novo valor.
  async function loadQuotes(): Promise<Quote[]> {
    const result = await quoteRide(cityId, origin, destination);
    setQuotes(result);
    setVehicle((current) =>
      result.length && !result.some((q) => q.vehicle_type === current) ? result[0].vehicle_type : current,
    );
    return result;
  }

  useEffect(() => {
    // As mensagens do banco (ex.: destino fora da cidade) já vêm em português.
    loadQuotes().catch((e) =>
      setError((e as { message?: string }).message || 'Não conseguimos calcular o preço. Tente de novo.'),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityId, origin, destination]);

  // Enquanto a tela está aberta, os preços se renovam sozinhos antes de vencer.
  useEffect(() => {
    const timer = setInterval(() => {
      loadQuotes().catch(() => {});
    }, 60 * 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityId, origin, destination]);

  // Só aparecem as formas que algum motorista online desse veículo aceita.
  useEffect(() => {
    fetchPaymentOptions(cityId, vehicle)
      .then((list) => {
        setOptions(list);
        setPayment((current) => (list.includes(current) ? current : list[0]));
      })
      .catch(() => setOptions(DEFAULT_OPTIONS));
  }, [cityId, vehicle]);

  async function confirm() {
    setLoading(true);
    setError(null);
    try {
      const current = quotes?.find((q) => q.vehicle_type === vehicle);
      if (!current) throw new Error('Confira o preço de novo antes de chamar');

      // Cotação vencida (raro, a tela se atualiza sozinha): só renova os preços
      // na tela, sem aviso, e o passageiro chama de novo vendo o valor atual.
      if (new Date(current.expires_at).getTime() <= Date.now()) {
        await loadQuotes();
        setLoading(false);
        return;
      }

      const rideId = await requestRide({
        cityId,
        vehicleType: vehicle,
        paymentMethod: payment,
        origin,
        destination,
        quoteId: current.quote_id,
      });
      onRequested(rideId);
    } catch (e) {
      setLoading(false);
      // As mensagens do banco (request_ride) já vêm em português.
      setError((e as { message?: string }).message || 'Não conseguimos pedir a corrida.');
    }
  }

  return (
    <Screen
      title={delivery ? 'Confira a entrega' : destination.scheduledFor ? 'Confira o agendamento' : 'Escolha uma viagem'}
      error={error}
      onBack={onBack}
      backdrop={{
        center: origin,
        line: true,
        markers: [
          { coord: origin, kind: 'origin' },
          { coord: destination, kind: 'dest' },
        ],
      }}
    >
      <View style={styles.route}>
        <View style={styles.routeRow}>
          <View style={styles.dotOrigin} />
          <Text numberOfLines={2} style={styles.routeLine}>{origin.address}</Text>
        </View>
        <View style={styles.routeRow}>
          <View style={styles.dotDest} />
          <Text numberOfLines={2} style={styles.routeLine}>
            {destination.address}
          </Text>
        </View>
        {destination.riderName ? <Text style={styles.extraLine}>Quem vai andar: {destination.riderName}</Text> : null}
        {delivery ? (
          <>
            <Text style={styles.extraLine}>Pacote: {packageLabel(delivery.size)}</Text>
            <Text style={styles.extraLine}>Quem recebe: {delivery.recipientName}</Text>
          </>
        ) : null}
        {destination.scheduledFor ? (
          <Text style={styles.extraLine}>Quando: {formatScheduled(destination.scheduledFor)}</Text>
        ) : null}
        {destination.roundTrip ? (
          <Text style={styles.extraLine}>{roundTripLabel({ round_trip: true, wait_minutes: destination.waitMinutes })}</Text>
        ) : null}
      </View>

      {quotes === null && !error ? (
        <ActivityIndicator size="large" color={colors.primary} />
      ) : null}

      {quotes?.map((quote) => (
        <ChoiceCard
          key={quote.vehicle_type}
          label={vehicleLabel[quote.vehicle_type]}
          icon={quote.vehicle_type === 'moto' ? 'bicycle' : 'car-sport'}
          detail={formatMoney(priceFor(quote, payment))}
          selected={vehicle === quote.vehicle_type}
          onPress={() => setVehicle(quote.vehicle_type)}
        />
      ))}

      {quotes?.length ? (
        <>
          <Text style={styles.section}>Pagamento</Text>
          {delivery ? <Text style={styles.extraLine}>Você paga a entrega ao motorista. Quem recebe não paga nada.</Text> : null}
          {options.map((method) => (
            <ChoiceCard
              key={method}
              label={paymentLabel[method]}
              detail={method === 'card' ? '+5%' : undefined}
              selected={payment === method}
              onPress={() => setPayment(method)}
            />
          ))}
          <BigButton
            label={
              delivery
                ? `Pedir entrega de ${vehicleLabel[vehicle].toLowerCase()}`
                : destination.scheduledFor
                  ? `Agendar ${vehicleLabel[vehicle].toLowerCase()}`
                  : `Chamar ${vehicleLabel[vehicle].toLowerCase()}`
            }
            onPress={confirm}
            loading={loading}
          />
        </>
      ) : null}

    </Screen>
  );
}

const styles = StyleSheet.create({
  route: {
    gap: 10,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dotOrigin: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.ink,
  },
  dotDest: {
    width: 12,
    height: 12,
    backgroundColor: colors.primary,
  },
  routeLine: {
    flex: 1,
    fontSize: fontSize.body,
    fontWeight: '600',
    color: colors.text,
  },
  extraLine: {
    fontSize: fontSize.body - 2,
    color: colors.textMuted,
  },
  section: {
    fontSize: fontSize.body - 2,
    fontWeight: '700',
    color: colors.textMuted,
    marginTop: 4,
  },
});
