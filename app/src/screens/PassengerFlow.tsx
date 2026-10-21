import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { BigButton } from '../components/BigButton';
import type { Coord } from '../components/PinMap.types';
import { Screen } from '../components/Screen';
import { fetchActiveRide, fetchCities, type City, type Place, type Ride } from '../lib/rides';
import { colors } from '../theme';
import { ConfirmRideScreen } from './ConfirmRideScreen';
import { DestinationScreen } from './DestinationScreen';
import { HomeScreen } from './HomeScreen';
import { MapPickScreen } from './MapPickScreen';
import { RideStatusScreen } from './RideStatusScreen';

type Step =
  | { kind: 'home' }
  | { kind: 'origin' }
  | { kind: 'destination'; origin: Place }
  | { kind: 'destinationMap'; origin: Place }
  | { kind: 'confirm'; origin: Place; destination: Place }
  | { kind: 'ride'; ride: Ride };

type Props = {
  name: string;
};

export function PassengerFlow({ name }: Props) {
  const [cities, setCities] = useState<City[] | null>(null);
  const [step, setStep] = useState<Step | null>(null);
  const [here, setHere] = useState<Coord | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [cityList, activeRide] = await Promise.all([fetchCities(), fetchActiveRide()]);
      setCities(cityList);
      setStep(activeRide ? { kind: 'ride', ride: activeRide } : { kind: 'home' });
    } catch {
      setError('Sem conexão com o Simbora. Confira a internet.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function startRequest() {
    setStep({ kind: 'origin' });
    try {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted) return;
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setHere({ lat: position.coords.latitude, lng: position.coords.longitude });
    } catch {
      // Sem GPS a pessoa ainda pode marcar no mapa a partir do centro da cidade.
    }
  }

  if (error) {
    return (
      <Screen title="Ops!" error={error}>
        <BigButton label="Tentar de novo" onPress={load} />
      </Screen>
    );
  }

  const city = cities?.find((c) => c.active);
  if (!step || !cities || !city) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const goHome = () => setStep({ kind: 'home' });

  switch (step.kind) {
    case 'home':
      return <HomeScreen name={name} onRequestRide={startRequest} />;

    case 'origin':
      return (
        <MapPickScreen
          title="Onde você está?"
          hint="Arraste o mapa até o alfinete ficar no lugar certo."
          buttonLabel="Estou aqui"
          center={here ?? city}
          fallbackAddress="Local marcado no mapa"
          onConfirm={(origin) => setStep({ kind: 'destination', origin })}
          onBack={goHome}
        />
      );

    case 'destination':
      return (
        <DestinationScreen
          otherCities={cities.filter((c) => c.id !== city.id)}
          onPickOnMap={() => setStep({ kind: 'destinationMap', origin: step.origin })}
          onPickCity={(dest) =>
            setStep({
              kind: 'confirm',
              origin: step.origin,
              destination: { lat: dest.lat, lng: dest.lng, address: dest.name, cityId: dest.id },
            })
          }
          onBack={() => setStep({ kind: 'origin' })}
        />
      );

    case 'destinationMap':
      return (
        <MapPickScreen
          title="Pra onde você vai?"
          hint="Arraste o mapa até o alfinete ficar no destino."
          buttonLabel="É aqui"
          center={step.origin}
          fallbackAddress="Destino marcado no mapa"
          onConfirm={(destination) => setStep({ kind: 'confirm', origin: step.origin, destination })}
          onBack={() => setStep({ kind: 'destination', origin: step.origin })}
        />
      );

    case 'confirm':
      return (
        <ConfirmRideScreen
          cityId={city.id}
          origin={step.origin}
          destination={step.destination}
          onRequested={load}
          onBack={() => setStep({ kind: 'destination', origin: step.origin })}
        />
      );

    case 'ride':
      return <RideStatusScreen ride={step.ride} onFinished={goHome} />;
  }
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
