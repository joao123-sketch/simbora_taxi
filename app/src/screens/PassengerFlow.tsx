import * as Linking from 'expo-linking';
import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { BigButton } from '../components/BigButton';
import type { Coord } from '../components/PinMap.types';
import { Screen } from '../components/Screen';
import { driverCodeFromUrl } from '../lib/deeplink';
import { expireScheduled, fetchMyScheduled } from '../lib/scheduling';
import { loadPackageOptions } from '../lib/delivery';
import { fetchMyDriver } from '../lib/drivers';
import { feeNeedsAttention, fetchFeeStatus } from '../lib/fees';
import { fetchSuggestedPlaces, type SuggestedPlace } from '../lib/favorites';
import {
  fetchActiveRide,
  fetchCities,
  fetchRideProposals,
  type City,
  type DeliveryInfo,
  type Place,
  type Ride,
} from '../lib/rides';
import { colors } from '../theme';
import { CityDropoffScreen } from './CityDropoffScreen';
import { ConfirmRideScreen } from './ConfirmRideScreen';
import { DeliveryDetailsScreen } from './DeliveryDetailsScreen';
import { DestinationScreen } from './DestinationScreen';
import { DriverFlow } from './driver/DriverFlow';
import { FavoriteDriversScreen } from './FavoriteDriversScreen';
import { HistoryScreen } from './HistoryScreen';
import { DeleteAccountScreen } from './DeleteAccountScreen';
import { LegalScreen } from './LegalScreen';
import { HomeScreen } from './HomeScreen';
import { MapPickScreen } from './MapPickScreen';
import { RideStatusScreen } from './RideStatusScreen';
import { ScheduledListScreen } from './ScheduledListScreen';
import { SettingsScreen } from './SettingsScreen';

type Step =
  | { kind: 'home' }
  | { kind: 'origin' }
  | { kind: 'destination'; origin: Place }
  | { kind: 'destinationMap'; origin: Place }
  | { kind: 'cityDropoff'; origin: Place; city: City }
  | { kind: 'deliveryOrigin' }
  | { kind: 'deliveryDestination'; origin: Place }
  | { kind: 'deliveryDetails'; origin: Place; destination: Place }
  | { kind: 'confirm'; origin: Place; destination: Place }
  | { kind: 'ride'; ride: Ride }
  | { kind: 'settings' }
  | { kind: 'scheduledList'; created?: boolean }
  | { kind: 'history' }
  // from: de onde a pessoa veio, para o Voltar levar de volta (início ou configurações).
  | { kind: 'favorites'; code?: string; from?: 'home' }
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
  // Já existe cadastro de motorista para esta conta (qualquer situação)?
  const [isDriver, setIsDriver] = useState(false);
  // Viagens agendadas da pessoa (para o cartão do início e a lista).
  const [scheduled, setScheduled] = useState<Ride[]>([]);
  // Propostas de motoristas esperando resposta, por viagem agendada.
  const [proposalCounts, setProposalCounts] = useState<Record<number, number>>({});
  // A cobrança da mensalidade abre sozinha uma vez a cada vez que o app abre.
  const feeNagged = useRef(false);
  // O link do convite de um motorista (aberto com o app fechado ou aberto).
  const handledLink = useRef<string | null>(null);

  useEffect(() => {
    function openLink(url: string | null) {
      const code = driverCodeFromUrl(url);
      if (!code || handledLink.current === url) return;
      handledLink.current = url;
      setStep((current) => (current && current.kind === 'ride' ? current : { kind: 'favorites', code, from: 'home' }));
    }
    Linking.getInitialURL()
      .then(openLink)
      .catch(() => {});
    const subscription = Linking.addEventListener('url', ({ url }) => openLink(url));
    return () => subscription.remove();
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [cityList, activeRide] = await Promise.all([fetchCities(), fetchActiveRide('passenger', userId)]);
      setCities(cityList);
      // O botão do canto diz "Sou motorista" ou "Quero ser motorista"; se a consulta falhar, fica como estava.
      fetchMyDriver(userId)
        .then((driver) => setIsDriver(!!driver))
        .catch(() => {});
      expireScheduled()
        .catch(() => {})
        .then(() => fetchMyScheduled('passenger', userId))
        .then(async (list) => {
          setScheduled(list);
          const counts: Record<number, number> = {};
          await Promise.all(
            list
              .filter((r) => r.status === 'requested')
              .map(async (r) => {
                counts[r.id] = (await fetchRideProposals(r.id).catch(() => [])).length;
              }),
          );
          setProposalCounts(counts);
        })
        .catch(() => {});
      if (activeRide) {
        setStep({ kind: 'ride', ride: activeRide });
      } else if (!feeNagged.current && feeNeedsAttention(await fetchFeeStatus().catch(() => null))) {
        // Motorista com a mensalidade vencida: o app cobra logo ao abrir.
        feeNagged.current = true;
        setStep({ kind: 'driver' });
      } else {
        setStep({ kind: 'home' });
      }
    } catch {
      setError('Sem conexão com o Simbora Car. Confira a internet.');
    }
  }, [userId]);

  useEffect(() => {
    load();
    // Os nomes dos tamanhos de pacote (entrega) vêm do banco.
    loadPackageOptions().catch(() => {});
  }, [load]);

  async function startDelivery() {
    setStep({ kind: 'deliveryOrigin' });
    try {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted) return;
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setHere({ lat: position.coords.latitude, lng: position.coords.longitude });
    } catch {
      // Sem GPS a pessoa ainda pode marcar no mapa a partir do centro da cidade.
    }
  }

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
  const goSettings = () => setStep({ kind: 'settings' });

  switch (step.kind) {
    case 'home':
      return (
        <HomeScreen
          name={name}
          isDriver={isDriver}
          scheduled={scheduled}
          proposalTotal={Object.values(proposalCounts).reduce((sum, n) => sum + n, 0)}
          onOpenScheduled={() => setStep({ kind: 'scheduledList' })}
          onRequestRide={startRequest}
          onRequestDelivery={startDelivery}
          onOpenFavorites={() => setStep({ kind: 'favorites', from: 'home' })}
          onDriverMode={() => setStep({ kind: 'driver' })}
          onOpenSettings={() => setStep({ kind: 'settings' })}
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

    case 'deliveryOrigin':
      return (
        <MapPickScreen
          title="Onde pegar o pacote?"
          hint="O alfinete está onde você está. Arraste o mapa até o lugar da coleta."
          withSearch
          buttonLabel="Pegar aqui"
          center={here ?? city}
          city={city}
          fallbackAddress="Local de coleta marcado no mapa"
          onConfirm={(origin) => setStep({ kind: 'deliveryDestination', origin })}
          onBack={goHome}
        />
      );

    case 'deliveryDestination':
      return (
        <MapPickScreen
          title="Onde entregar?"
          hint="Escreva o endereço ou arraste o mapa até o alfinete ficar no lugar da entrega."
          withSearch
          awayFrom={step.origin}
          buttonLabel="Entregar aqui"
          center={step.origin}
          city={city}
          fallbackAddress="Local de entrega marcado no mapa"
          onConfirm={(destination) => setStep({ kind: 'deliveryDetails', origin: step.origin, destination })}
          onBack={() => setStep({ kind: 'deliveryOrigin' })}
        />
      );

    case 'deliveryDetails':
      return (
        <DeliveryDetailsScreen
          initial={step.destination.delivery}
          onConfirm={(info: DeliveryInfo) =>
            setStep({
              kind: 'confirm',
              origin: step.origin,
              destination: { ...step.destination, delivery: info },
            })
          }
          onBack={() => setStep({ kind: 'deliveryDestination', origin: step.origin })}
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
          onRequested={async () => {
            await load();
            // Viagem agendada não abre a tela de corrida: vai para a lista de agendadas.
            if (step.destination.scheduledFor) setStep({ kind: 'scheduledList', created: true });
          }}
          onBack={() =>
            step.destination.delivery
              ? setStep({ kind: 'deliveryDetails', origin: step.origin, destination: step.destination })
              : setStep({ kind: 'destination', origin: step.origin })
          }
        />
      );

    case 'scheduledList':
      return (
        <ScheduledListScreen
          rides={scheduled}
          proposalCounts={proposalCounts}
          justCreated={step.created}
          onOpen={(ride) => setStep({ kind: 'ride', ride })}
          onBack={goHome}
        />
      );

    case 'ride':
      return <RideStatusScreen ride={step.ride} onFinished={load} />;

    case 'settings':
      return (
        <SettingsScreen
          onOpenHistory={() => setStep({ kind: 'history' })}
          onOpenFavorites={() => setStep({ kind: 'favorites' })}
          onOpenLegal={() => setStep({ kind: 'legal' })}
          onDeleteAccount={() => setStep({ kind: 'deleteAccount' })}
          onBack={goHome}
        />
      );

    case 'history':
      return <HistoryScreen role="passenger" userId={userId} onBack={goSettings} />;

    case 'favorites':
      return <FavoriteDriversScreen autoAddCode={step.code} onBack={step.from === 'home' ? goHome : goSettings} />;

    case 'deleteAccount':
      return <DeleteAccountScreen onBack={goSettings} />;

    case 'legal':
      return <LegalScreen onBack={goSettings} />;

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
