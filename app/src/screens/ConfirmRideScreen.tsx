import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { BigButton } from '../components/BigButton';
import { ChoiceCard } from '../components/ChoiceCard';
import { Screen } from '../components/Screen';
import {
  formatMoney,
  paymentLabel,
  quoteRide,
  requestRide,
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

const PAYMENTS: PaymentMethod[] = ['cash', 'pix'];

export function ConfirmRideScreen({ cityId, origin, destination, onRequested, onBack }: Props) {
  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  const [vehicle, setVehicle] = useState<VehicleType>('car');
  const [payment, setPayment] = useState<PaymentMethod>('cash');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    quoteRide(cityId, origin, destination)
      .then((result) => {
        setQuotes(result);
        if (result.length && !result.some((q) => q.vehicle_type === 'car')) {
          setVehicle(result[0].vehicle_type);
        }
      })
      // As mensagens do banco (ex.: destino fora da cidade) já vêm em português.
      .catch((e) => setError((e as { message?: string }).message || 'Não conseguimos calcular o preço. Tente de novo.'));
  }, [cityId, origin, destination]);

  async function confirm() {
    setLoading(true);
    setError(null);
    try {
      const rideId = await requestRide({ cityId, vehicleType: vehicle, paymentMethod: payment, origin, destination });
      onRequested(rideId);
    } catch (e) {
      setLoading(false);
      // As mensagens do banco (request_ride) já vêm em português.
      setError((e as { message?: string }).message || 'Não conseguimos pedir a corrida.');
    }
  }

  return (
    <Screen title="Confira e chame" error={error}>
      <View style={styles.route}>
        <Text style={styles.routeLine}>De: {origin.address}</Text>
        <Text style={styles.routeLine}>
          Para: {destination.address}
          {destination.dropoffPlace ? ` — ${destination.dropoffPlace}` : ''}
        </Text>
      </View>

      {quotes === null && !error ? (
        <ActivityIndicator size="large" color={colors.primary} />
      ) : null}

      {quotes?.map((quote) => (
        <ChoiceCard
          key={quote.vehicle_type}
          label={vehicleLabel[quote.vehicle_type]}
          detail={formatMoney(quote.price)}
          selected={vehicle === quote.vehicle_type}
          onPress={() => setVehicle(quote.vehicle_type)}
        />
      ))}

      {quotes?.length ? (
        <>
          <Text style={styles.section}>Como vai pagar?</Text>
          <View style={styles.row}>
            {PAYMENTS.map((method) => (
              <View key={method} style={styles.rowItem}>
                <ChoiceCard
                  label={paymentLabel[method]}
                  selected={payment === method}
                  onPress={() => setPayment(method)}
                />
              </View>
            ))}
          </View>
          <BigButton label={`Chamar ${vehicleLabel[vehicle].toLowerCase()}`} onPress={confirm} loading={loading} />
        </>
      ) : null}

      <BigButton label="Voltar" onPress={onBack} variant="link" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  route: {
    gap: 4,
  },
  routeLine: {
    fontSize: fontSize.body,
    color: colors.text,
  },
  section: {
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.textMuted,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  rowItem: {
    flex: 1,
  },
});
