import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { BigButton } from '../../components/BigButton';
import { Screen } from '../../components/Screen';
import { useDriverLocation } from '../../hooks/useDriverLocation';
import { fetchMyDriver, setOnline, type Driver } from '../../lib/drivers';
import { fetchActiveRide, type Ride } from '../../lib/rides';
import { colors } from '../../theme';
import { DriverHomeScreen } from './DriverHomeScreen';
import { DriverPendingScreen } from './DriverPendingScreen';
import { PaymentSettingsScreen } from './PaymentSettingsScreen';
import { DriverRideScreen } from './DriverRideScreen';
import { DriverSignupScreen } from './DriverSignupScreen';

type Props = {
  userId: string;
  cityId: number;
  onExit: () => void;
};

export function DriverFlow({ userId, cityId, onExit }: Props) {
  // undefined = carregando; null = ainda não se cadastrou.
  const [driver, setDriver] = useState<Driver | null | undefined>(undefined);
  const [ride, setRide] = useState<Ride | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingPayments, setEditingPayments] = useState(false);

  const online = driver?.status === 'approved' && driver.is_online;
  const { position, denied } = useDriverLocation(online);

  const load = useCallback(async () => {
    setError(null);
    try {
      const me = await fetchMyDriver(userId);
      setRide(me?.status === 'approved' ? await fetchActiveRide('driver', userId) : null);
      setDriver(me);
    } catch {
      setError('Sem conexão com o Simbora Car. Confira a internet.');
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  // O passageiro pode aceitar uma proposta deste motorista a qualquer momento;
  // quando isso acontece a corrida passa a ser dele e a tela troca sozinha.
  const checkActiveRide = useCallback(() => {
    fetchActiveRide('driver', userId)
      .then((active) => {
        if (active) setRide(active);
      })
      .catch(() => {});
  }, [userId]);

  async function toggleOnline() {
    if (!driver) return;
    await setOnline(!driver.is_online);
    setDriver({ ...driver, is_online: !driver.is_online });
  }

  if (error) {
    return (
      <Screen title="Ops!" error={error}>
        <BigButton label="Tentar de novo" onPress={load} />
      </Screen>
    );
  }

  if (driver === undefined) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (driver === null) {
    return <DriverSignupScreen cityId={cityId} onRegistered={load} onBack={onExit} />;
  }

  if (driver.status !== 'approved') {
    return <DriverPendingScreen status={driver.status} onRefresh={load} onBack={onExit} />;
  }

  if (ride) {
    return <DriverRideScreen ride={ride} onFinished={load} />;
  }

  if (editingPayments) {
    return (
      <PaymentSettingsScreen
        accepted={driver.accepted_payments}
        onSaved={(methods) => {
          setDriver({ ...driver, accepted_payments: methods });
          setEditingPayments(false);
        }}
        onBack={() => setEditingPayments(false)}
      />
    );
  }

  return (
    <DriverHomeScreen
      online={online}
      acceptedPayments={driver.accepted_payments}
      onOpenPayments={() => setEditingPayments(true)}
      position={position}
      locationDenied={denied}
      onToggleOnline={toggleOnline}
      onAccepted={load}
      onCheckActive={checkActiveRide}
      onExit={onExit}
    />
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
