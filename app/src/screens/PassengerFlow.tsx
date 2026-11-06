import * as Linking from 'expo-linking';
import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { BigButton } from '../components/BigButton';
import type { Coord } from '../components/PinMap.types';
import { Screen } from '../components/Screen';
import { driverCodeFromUrl, isDriverSignupUrl } from '../lib/deeplink';
import { expireScheduled, fetchMyScheduled } from '../lib/scheduling';
import { loadPackageOptions } from '../lib/delivery';
import { fetchMyDriver } from '../lib/drivers';
import { reverseGeocode } from '../lib/geocode';
import { feeNeedsAttention, fetchFeeStatus } from '../lib/fees';
import { reminderText, todayLocal } from '../lib/feeReminder';
import { cityAt, confirmState, tripEvents, type TripSnapshot } from '../lib/intercity';
import { notify, notifyOncePerDay } from '../lib/notify';
import { fetchSuggestedPlaces, type SuggestedPlace } from '../lib/favorites';
import {
  fetchActiveRide,
  fetchCities,
  fetchRide,
  fetchRideProposals,
  type City,
  type DeliveryInfo,
  type Place,
  type Ride,
} from '../lib/rides';
import { colors } from '../theme';
import { TripOptionsScreen } from './TripOptionsScreen';
import { ConfirmRideScreen } from './ConfirmRideScreen';
import { DeliveryDetailsScreen } from './DeliveryDetailsScreen';
import { DestinationScreen } from './DestinationScreen';
import { DriverFlow } from './driver/DriverFlow';
import { FavoriteDriversScreen } from './FavoriteDriversScreen';
import { HistoryScreen } from './HistoryScreen';
import { DeleteAccountScreen } from './DeleteAccountScreen';
import { LegalScreen } from './LegalScreen';
import { HomeScreen } from './HomeScreen';
import { PhotoScreen } from './PhotoScreen';
import { PlaceSearchScreen } from './PlaceSearchScreen';
import { RiderNameScreen } from './RiderNameScreen';
import { RideStatusScreen } from './RideStatusScreen';
import { ScheduledListScreen } from './ScheduledListScreen';
import { SettingsScreen } from './SettingsScreen';

type Step =
  | { kind: 'home' }
  // rider: nome de quem vai andar, quando o pedido é para outra pessoa.
  | { kind: 'riderName' }
  | { kind: 'riderOrigin'; rider: string }
  | { kind: 'destination'; origin: Place; rider?: string }
  | { kind: 'tripOptions'; origin: Place; destination: Place; rider?: string }
  | { kind: 'deliveryOrigin' }
  | { kind: 'deliveryDestination'; origin: Place }
  | { kind: 'deliveryDetails'; origin: Place; destination: Place }
  | { kind: 'confirm'; origin: Place; destination: Place }
  | { kind: 'ride'; ride: Ride }
  | { kind: 'settings' }
  | { kind: 'scheduledList'; created?: boolean }
  | { kind: 'history'; from?: 'home' }
  // from: de onde a pessoa veio, para o Voltar levar de volta (início ou configurações).
  | { kind: 'favorites'; code?: string; from?: 'home' }
  | { kind: 'photo' }
  | { kind: 'legal' }
  | { kind: 'deleteAccount' }
  | { kind: 'driver' };

type Props = {
  userId: string;
  name: string;
};

function outsideAreaText(cities: City[]): string {
  const names = cities.filter((c) => c.active).map((c) => c.name);
  return `O Simbora Car ainda não atende onde você está. Funciona em: ${names.join(', ')}.`;
}

export function PassengerFlow({ userId, name }: Props) {
  const [cities, setCities] = useState<City[] | null>(null);
  const [step, setStep] = useState<Step | null>(null);
  const [here, setHere] = useState<Coord | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestedPlace[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Aviso na tela inicial quando o GPS não deixa chamar a corrida.
  const [locationError, setLocationError] = useState<string | null>(null);
  // Já existe cadastro de motorista para esta conta (qualquer situação)?
  const [isDriver, setIsDriver] = useState(false);
  // Lembrete da mensalidade (só motorista, nos 5 dias antes do vencimento): aparece toda vez que abre.
  const [feeReminder, setFeeReminder] = useState<string | null>(null);
  // Viagens agendadas da pessoa (para o cartão do início e a lista).
  const [scheduled, setScheduled] = useState<Ride[]>([]);
  // Propostas de motoristas esperando resposta, por viagem agendada.
  const [proposalCounts, setProposalCounts] = useState<Record<number, number>>({});
  // A cobrança da mensalidade abre sozinha uma vez a cada vez que o app abre.
  const feeNagged = useRef(false);
  // O link do convite de um motorista (aberto com o app fechado ou aberto).
  const handledLink = useRef<string | null>(null);
  // Link "/motorista" aberto antes de o início carregar: o load() usa depois, uma vez só.
  const pendingDriverLink = useRef(false);

  useEffect(() => {
    function openLink(url: string | null) {
      if (isDriverSignupUrl(url) && handledLink.current !== url) {
        handledLink.current = url;
        setStep((current) => {
          if (current === null) {
            pendingDriverLink.current = true;
            return current;
          }
          return current.kind === 'ride' ? current : { kind: 'driver' };
        });
        return;
      }
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

  // As viagens agendadas e as propostas de cada uma. Compara com a última vez para avisar (aviso local):
  // nova proposta, viagem cancelada, sem efeito ou que venceu sem motorista.
  const tripSnaps = useRef<Record<number, TripSnapshot>>({});
  const refreshScheduled = useCallback(() => {
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

        const previous = tripSnaps.current;
        const next: Record<number, TripSnapshot> = {};
        for (const ride of list) {
          next[ride.id] = {
            status: ride.status,
            proposals: counts[ride.id] ?? 0,
            confirmedAt: ride.confirmed_at ?? null,
            voided: false,
          };
          for (const event of tripEvents(previous[ride.id] ?? null, next[ride.id], 'passenger')) {
            notify(event.title, event.body, { tag: `${event.tag}-${ride.id}` });
          }
          // De manhã (ou ao abrir), lembra de confirmar a viagem que já pode ser confirmada.
          if (ride.status === 'accepted' && ride.scheduled_for && confirmState(ride.scheduled_for, ride.confirmed_at ?? null, new Date()) === 'open') {
            notifyOncePerDay(`confirm-${ride.id}`, 'Confirme sua viagem', 'Toque para confirmar a viagem agendada.', todayLocal());
          }
        }
        // Viagem que saiu da lista: foi cancelada, ficou sem efeito ou venceu.
        for (const id of Object.keys(previous).map(Number).filter((id) => !next[id])) {
          const gone = await fetchRide(id).catch(() => null);
          // Quem cancelou a própria viagem não precisa de aviso.
          if (!gone || gone.status !== 'cancelled' || gone.cancelled_by === userId) continue;
          const after: TripSnapshot = { ...previous[id], status: 'cancelled', voided: gone.void_reason === 'not_confirmed' };
          for (const event of tripEvents(previous[id], after, 'passenger')) {
            notify(event.title, event.body, { tag: `${event.tag}-${id}` });
          }
        }
        tripSnaps.current = next;
      })
      .catch(() => {});
  }, [userId]);

  // Com o app aberto, olha as viagens agendadas de minuto em minuto.
  useEffect(() => {
    const timer = setInterval(refreshScheduled, 60000);
    return () => clearInterval(timer);
  }, [refreshScheduled]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [cityList, activeRide] = await Promise.all([fetchCities(), fetchActiveRide('passenger', userId)]);
      setCities(cityList);
      // O botão do canto diz "Sou motorista" ou "Quero ser motorista"; se a consulta falhar, fica como estava.
      fetchMyDriver(userId)
        .then((driver) => setIsDriver(!!driver))
        .catch(() => {});
      refreshScheduled();
      // O início abre sem esperar a mensalidade (mais uma ida ao servidor); ela chega logo depois.
      const openDriver = pendingDriverLink.current && !activeRide;
      pendingDriverLink.current = false;
      setStep(activeRide ? { kind: 'ride', ride: activeRide } : { kind: openDriver ? 'driver' : 'home' });
      // A mensalidade não trava nada: sem ela (ou sem ser motorista) segue normal.
      fetchFeeStatus()
        .catch(() => null)
        .then((feeStatus) => {
          const reminder = reminderText(feeStatus);
          setFeeReminder(reminder);
          if (reminder) notifyOncePerDay('fee-reminder', 'Mensalidade do Simbora Car', reminder, todayLocal());
          if (!activeRide && !feeNagged.current && feeNeedsAttention(feeStatus)) {
            // Motorista com a mensalidade vencida: o app cobra logo ao abrir (se a pessoa ainda está no início).
            feeNagged.current = true;
            setStep((current) => (current && current.kind === 'home' ? { kind: 'driver' } : current));
          }
        });
    } catch {
      setError('Sem conexão com o Simbora Car. Confira a internet.');
    }
  }, [userId, refreshScheduled]);

  // O mapa do início abre onde a pessoa está. Sem permissão ou sem GPS, abre no centro da cidade.
  useEffect(() => {
    Location.requestForegroundPermissionsAsync()
      .then(({ granted }) => (granted ? Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }) : null))
      .then((position) => {
        if (position) setHere({ lat: position.coords.latitude, lng: position.coords.longitude });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    // Os nomes dos tamanhos de pacote (entrega) vêm do banco.
    loadPackageOptions().catch(() => {});
  }, [load]);

  async function startDelivery() {
    if (outsideArea && cities) {
      setLocationError(outsideAreaText(cities));
      return;
    }
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

  // A corrida sai sempre de onde o aparelho está: sem tela de "onde você está".
  async function startRequest() {
    setLocationError(null);
    // Os lugares de sempre chegam enquanto o GPS responde.
    fetchSuggestedPlaces(userId)
      .then(setSuggestions)
      .catch(() => setSuggestions([]));
    try {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted) {
        setLocationError('Para chamar uma corrida, permita o acesso à localização do aparelho nas configurações do navegador.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const coord = { lat: position.coords.latitude, lng: position.coords.longitude };
      setHere(coord);
      if (cities && !cityAt(coord, cities)) {
        setLocationError(outsideAreaText(cities));
        return;
      }
      const address = (await reverseGeocode(coord)) ?? 'Minha localização';
      setStep({ kind: 'destination', origin: { ...coord, address } });
    } catch {
      setLocationError('Não conseguimos achar você. Ligue o GPS do celular e tente de novo.');
    }
  }

  if (error) {
    return (
      <Screen title="Ops!" error={error}>
        <BigButton label="Tentar de novo" onPress={load} />
      </Screen>
    );
  }

  // A cidade é onde o GPS diz que a pessoa está. Sem GPS ainda, o mapa usa a primeira cidade aberta só como fundo.
  const detected = cities && here ? cityAt(here, cities) : null;
  const city = detected ?? cities?.find((c) => c.active);
  const outsideArea = !!here && !detected;
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
          center={here ?? city}
          here={here}
          error={locationError ?? (outsideArea && cities ? outsideAreaText(cities) : null)}
          scheduled={scheduled}
          proposalTotal={Object.values(proposalCounts).reduce((sum, n) => sum + n, 0)}
          onOpenScheduled={() => setStep({ kind: 'scheduledList' })}
          onRequestRide={startRequest}
          onRequestDelivery={startDelivery}
          onRequestForOther={() => setStep({ kind: 'riderName' })}
          onOpenFavorites={() => setStep({ kind: 'favorites', from: 'home' })}
          onDriverMode={() => (isDriver || detected ? setStep({ kind: 'driver' }) : setLocationError(cities ? outsideAreaText(cities) : null))}
          onOpenHistory={() => setStep({ kind: 'history', from: 'home' })}
          onOpenSettings={() => setStep({ kind: 'settings' })}
          reminder={feeReminder}
          onOpenReminder={() => setStep({ kind: 'driver' })}
        />
      );

    case 'deliveryOrigin':
      return (
        <PlaceSearchScreen
          title="Onde pegar o pacote?"
          hint="Escreva o endereço da coleta, ou use a sua localização."
          allowMyLocation
          city={city}
          fallbackAddress="Local de coleta"
          onConfirm={(origin) => setStep({ kind: 'deliveryDestination', origin })}
          onBack={goHome}
        />
      );

    case 'deliveryDestination':
      return (
        <PlaceSearchScreen
          title="Onde entregar?"
          hint="Escreva o endereço ou o lugar da entrega."
          awayFrom={step.origin}
          city={city}
          fallbackAddress="Local de entrega"
          onConfirm={(destination) => setStep({ kind: 'deliveryDetails', origin: step.origin, destination })}
          onBack={() => setStep({ kind: 'deliveryOrigin' })}
        />
      );

    case 'riderName':
      return <RiderNameScreen onConfirm={(rider) => setStep({ kind: 'riderOrigin', rider })} onBack={goHome} />;

    case 'riderOrigin':
      return (
        <PlaceSearchScreen
          title={`Onde buscar ${step.rider.split(' ')[0]}?`}
          hint="Escreva o endereço ou o lugar do embarque, ou use a sua localização."
          allowMyLocation
          city={city}
          fallbackAddress="Local de embarque"
          onConfirm={(origin) => setStep({ kind: 'destination', origin, rider: step.rider })}
          onBack={() => setStep({ kind: 'riderName' })}
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
          city={city}
          origin={step.origin}
          suggestions={suggestions}
          onPickSuggestion={(place) =>
            setStep({
              kind: 'confirm',
              origin: step.origin,
              destination: { lat: place.lat, lng: place.lng, address: place.title, riderName: step.rider },
            })
          }
          otherCities={cities.filter((c) => c.id !== city.id)}
          onPickPlace={(destination) =>
            setStep({ kind: 'confirm', origin: step.origin, destination: { ...destination, riderName: step.rider } })
          }
          onPickOtherCityPlace={(destination) =>
            setStep({ kind: 'tripOptions', origin: step.origin, destination, rider: step.rider })
          }
          forOther={!!step.rider}
          onBack={step.rider ? () => setStep({ kind: 'riderOrigin', rider: step.rider as string }) : goHome}
        />
      );

    case 'tripOptions':
      return (
        <TripOptionsScreen
          destination={step.destination}
          onConfirm={(destination) =>
            setStep({ kind: 'confirm', origin: step.origin, destination: { ...destination, riderName: step.rider } })
          }
          onBack={() => setStep({ kind: 'destination', origin: step.origin, rider: step.rider })}
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
              : setStep({ kind: 'destination', origin: step.origin, rider: step.destination.riderName })
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
      return (
        <RideStatusScreen
          ride={step.ride}
          onFinished={load}
          onBack={goHome}
          onBecomeDriver={isDriver ? undefined : () => setStep({ kind: 'driver' })}
          cityName={detected?.name}
        />
      );

    case 'settings':
      return (
        <SettingsScreen
          onOpenHistory={() => setStep({ kind: 'history' })}
          onOpenFavorites={() => setStep({ kind: 'favorites' })}
          onOpenPhoto={() => setStep({ kind: 'photo' })}
          onOpenLegal={() => setStep({ kind: 'legal' })}
          onDeleteAccount={() => setStep({ kind: 'deleteAccount' })}
          onBack={goHome}
        />
      );

    case 'history':
      return <HistoryScreen role="passenger" userId={userId} onBack={step.from === 'home' ? goHome : goSettings} />;

    case 'favorites':
      return <FavoriteDriversScreen autoAddCode={step.code} onBack={step.from === 'home' ? goHome : goSettings} />;

    case 'deleteAccount':
      return <DeleteAccountScreen userId={userId} onBack={goSettings} />;

    case 'photo':
      return <PhotoScreen userId={userId} onSaved={goSettings} onBack={goSettings} />;

    case 'legal':
      return <LegalScreen onBack={goSettings} />;

    case 'driver':
      return <DriverFlow userId={userId} cityId={detected?.id ?? null} cityName={detected?.name} onExit={load} />;
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
