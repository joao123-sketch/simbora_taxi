import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { BigButton } from '../components/BigButton';
import type { Coord } from '../components/PinMap.types';
import { Screen } from '../components/Screen';
import { fetchSuggestedPlaces, type SuggestedPlace } from '../lib/favorites';
import { fetchActiveRide, fetchCities, type City, type Place, type Ride } from '../lib/rides';
import { colors } from '../theme';
import { CityDropoffScreen } from './CityDropoffScreen';
import { ConfirmRideScreen } from './ConfirmRideScreen';
import { DestinationScreen } from './DestinationScreen';
import { DriverFlow } from './driver/DriverFlow';
import { HistoryScreen } from './HistoryScreen';
import { DeleteAccountScreen } from './DeleteAccountScreen';
import { LegalScreen } from './LegalScreen';
import { HomeScreen } from './HomeScreen';
import { MapPickScreen } from './MapPickScreen';
import { RideStatusScreen } from './RideStatusScreen';

type Step =
  | { kind: 'home' }
  | { kind: 'origin' }
  | { kind: 'destination'; origin: Place }
  | { kind: 'destinationMap'; origin: Place }
  | { kind: 'cityDropoff'; origin: Place; city: City }
  | { kind: 'confirm'; origin: Place; destination: Place }
  | { kind: 'ride'; ride: Ride }
  | { kind: 'history' }
  | { kind: 'legal' }
  | { kind: 'deleteAccount' }
  | { kind: 'driver' };

type Props = {
  userId: string;
  name: string;
};

export function PassengerFlow({ userId, name }: Props) {
  const [cities, setCities] = useState<City[] | null>(null);
  const [step, setStep] = useState<Step | null>(null);
  const [here, setHere] = useState<Coord | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestedPlace[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [cityList, activeRide] = await Promise.all([fetchCities(), fetchActiveRide('passenger', userId)]);
      setCities(cityList);
      setStep(activeRide ? { kind: 'ride', ride: activeRide } : { kind: 'home' });
    } catch {
      setError('Sem conexão com o Simbora Car. Confira a internet.');
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  async function startRequest() {
    setStep({ kind: 'origin' });
    // Os lugares de sempre chegam enquanto a pessoa marca onde está.
    fetchSuggestedPlaces(userId)
      .then(setSuggestions)
      .catch(() => setSuggestions([]));
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
      return (
        <HomeScreen
          name={name}
          onRequestRide={startRequest}
          onDriverMode={() => setStep({ kind: 'driver' })}
          onOpenHistory={() => setStep({ kind: 'history' })}
          onOpenLegal={() => setStep({ kind: 'legal' })}
          onDeleteAccount={() => setStep({ kind: 'deleteAccount' })}
        />
      );

    case 'origin':
      return (
        <MapPickScreen
          title="Onde você está?"
          hint="O alfinete está onde você está. Se precisar, arraste o mapa."
          buttonLabel="Estou aqui"
          center={here ?? city}
          city={city}
          fallbackAddress="Local marcado no mapa"
          onConfirm={(origin) => setStep({ kind: 'destination', origin })}
          onBack={goHome}
        />
      );

    case 'destination':
      return (
        <DestinationScreen
          suggestions={suggestions}
          onPickSuggestion={(place) =>
            setStep({
              kind: 'confirm',
              origin: step.origin,
              destination: { lat: place.lat, lng: place.lng, address: place.title },
            })
          }
          otherCities={cities.filter((c) => c.id !== city.id)}
          onPickOnMap={() => setStep({ kind: 'destinationMap', origin: step.origin })}
          onPickCity={(dest) => setStep({ kind: 'cityDropoff', origin: step.origin, city: dest })}
          onBack={() => setStep({ kind: 'origin' })}
        />
      );

    case 'destinationMap':
      return (
        <MapPickScreen
          title="Pra onde você vai?"
          hint="Escreva o endereço ou o lugar, ou arraste o mapa até o alfinete ficar no destino."
          withSearch
          awayFrom={step.origin}
          buttonLabel="É aqui"
          center={step.origin}
          city={city}
          fallbackAddress="Destino marcado no mapa"
          onConfirm={(destination) => setStep({ kind: 'confirm', origin: step.origin, destination })}
          onBack={() => setStep({ kind: 'destination', origin: step.origin })}
        />
      );

    case 'cityDropoff':
      return (
        <CityDropoffScreen
          city={step.city}
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

    case 'history':
      return <HistoryScreen role="passenger" userId={userId} onBack={goHome} />;

    case 'deleteAccount':
      return <DeleteAccountScreen onBack={goHome} />;

    case 'legal':
      return <LegalScreen onBack={goHome} />;

    case 'driver':
      return <DriverFlow userId={userId} cityId={city.id} onExit={load} />;
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
