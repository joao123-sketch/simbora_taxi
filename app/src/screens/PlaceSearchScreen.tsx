import * as Location from 'expo-location';
import { useState } from 'react';

import { BigButton } from '../components/BigButton';
import type { Coord } from '../components/PinMap.types';
import { PlaceSearch } from '../components/PlaceSearch';
import { Screen } from '../components/Screen';
import { distanceKm } from '../lib/geo';
import { reverseGeocode } from '../lib/geocode';
import type { City, Place } from '../lib/rides';

type Props = {
  title: string;
  hint: string;
  // Cidade onde a busca de endereço procura.
  city: City;
  // Ponto que não pode ser escolhido de novo (o destino não pode ser a origem).
  awayFrom?: Coord;
  // Mostra "Usar minha localização" (ex.: onde pegar o pacote).
  allowMyLocation?: boolean;
  fallbackAddress: string;
  onConfirm: (place: Place) => void;
  onBack: () => void;
};

// Destino mais perto que isso da origem é o mesmo lugar.
const MIN_TRIP_KM = 0.05;

// Escolher um ponto escrevendo o endereço ou o lugar (sem mapa para arrastar).
// A pessoa escolhe um dos resultados da busca; "Usar minha localização" pega o GPS.
export function PlaceSearchScreen({ title, hint, city, awayFrom, allowMyLocation, fallbackAddress, onConfirm, onBack }: Props) {
  const [locating, setLocating] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  function choose(place: Place) {
    if (awayFrom && distanceKm(place, awayFrom) < MIN_TRIP_KM) {
      setProblem('Esse lugar é igual ao ponto de partida. Procure outro.');
      return;
    }
    onConfirm(place);
  }

  async function useMyLocation() {
    setLocating(true);
    setProblem(null);
    try {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted) {
        setProblem('Permita o acesso à localização nas configurações do navegador.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const coord = { lat: position.coords.latitude, lng: position.coords.longitude };
      choose({ ...coord, address: (await reverseGeocode(coord)) ?? fallbackAddress });
    } catch {
      setProblem('Não conseguimos achar você. Ligue o GPS do celular e tente de novo.');
    } finally {
      setLocating(false);
    }
  }

  return (
    <Screen title={title} subtitle={hint} error={problem} onBack={onBack}>
      <PlaceSearch city={city} onPick={(place) => choose({ lat: place.lat, lng: place.lng, address: place.title })} />
      {allowMyLocation ? (
        <BigButton label="Usar minha localização" icon="locate" onPress={useMyLocation} loading={locating} variant="secondary" />
      ) : null}
    </Screen>
  );
}
