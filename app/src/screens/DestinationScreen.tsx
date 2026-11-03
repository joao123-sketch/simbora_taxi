import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { ChoiceCard } from '../components/ChoiceCard';
import { PlaceSearch } from '../components/PlaceSearch';
import { Screen } from '../components/Screen';
import { distanceKm } from '../lib/geo';
import { nearestCity } from '../lib/intercity';
import type { SuggestedPlace } from '../lib/favorites';
import type { City, Place } from '../lib/rides';
import { colors, fontSize } from '../theme';

type Props = {
  // Cidade de onde a corrida sai: a busca de endereço procura nela.
  city: City;
  // De onde a corrida sai: o mapa de fundo abre nesse ponto.
  origin: Place;
  // Lugares para onde o passageiro já foi várias vezes (favoritos automáticos).
  suggestions: SuggestedPlace[];
  onPickSuggestion: (place: SuggestedPlace) => void;
  otherCities: City[];
  // Destino escolhido na busca ("Aqui na cidade").
  onPickPlace: (place: Place) => void;
  // Destino escolhido na busca de "Em outra cidade": já vem com a cidade mais próxima (`cityId`).
  onPickOtherCityPlace: (place: Place) => void;
  // Pedido para outra pessoa: a pergunta muda e os lugares de sempre (do titular) não aparecem.
  forOther?: boolean;
  onBack: () => void;
};

// Destino mais perto que isso da origem é o mesmo lugar.
const MIN_TRIP_KM = 0.05;

function otherCitiesBias(cities: City[]): { center: City; box: number } {
  const lat = cities.reduce((sum, c) => sum + c.lat, 0) / (cities.length || 1);
  const lng = cities.reduce((sum, c) => sum + c.lng, 0) / (cities.length || 1);
  const spread = cities.reduce((max, c) => Math.max(max, Math.abs(c.lat - lat), Math.abs(c.lng - lng)), 0);
  return { center: { ...(cities[0] as City), lat, lng }, box: spread + 0.1 };
}

export function DestinationScreen({ city, origin, suggestions, onPickSuggestion, otherCities, onPickPlace, onPickOtherCityPlace, forOther, onBack }: Props) {
  // "Aqui na cidade" e "Em outra cidade" abrem a busca de endereço nesta mesma tela; as duas escondem o resto.
  const [mode, setMode] = useState<'choose' | 'search' | 'other'>('choose');
  const [problem, setProblem] = useState<string | null>(null);

  // A busca de outra cidade cobre todas as cidades atendidas (o centro delas, com folga de ~11 km).
  const otherBias = otherCitiesBias(otherCities);

  function leave() {
    setMode('choose');
    setProblem(null);
  }

  return (
    <Screen
      title={forOther ? 'Para onde a pessoa vai?' : 'Pra onde você vai?'}
      error={problem}
      onBack={mode === 'choose' ? onBack : leave}
      backdrop={{ center: origin, markers: [{ coord: origin, kind: 'origin' }] }}
    >
      {mode === 'search' ? (
        <PlaceSearch
          city={city}
          autoFocus
          onPick={(place) => {
            if (distanceKm(place, origin) < MIN_TRIP_KM) {
              setProblem('Esse lugar é igual ao ponto de partida. Procure outro.');
              return;
            }
            setProblem(null);
            onPickPlace({ lat: place.lat, lng: place.lng, address: place.title });
          }}
        />
      ) : mode === 'other' ? (
        <PlaceSearch
          city={otherBias.center}
          box={otherBias.box}
          autoFocus
          onPick={(place) => {
            const found = nearestCity(place, otherCities);
            if (!found) return;
            setProblem(null);
            onPickOtherCityPlace({ lat: place.lat, lng: place.lng, address: place.title, cityId: found.id });
          }}
        />
      ) : (
        <>
          <ChoiceCard label="Aqui na cidade" icon="search" onPress={() => setMode('search')} />
          {otherCities.length > 0 ? (
            <ChoiceCard label="Em outra cidade" icon="location" onPress={() => setMode('other')} />
          ) : null}
          {!forOther && suggestions.length > 0 ? (
            <>
              <Text style={styles.section}>Seus lugares de sempre</Text>
              {suggestions.map((place) => (
                <ChoiceCard
                  key={`${place.lat},${place.lng}`}
                  label={place.title}
                  icon="star"
                  caption={`${place.trips} viagens`}
                  onPress={() => onPickSuggestion(place)}
                />
              ))}
            </>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: {
    fontSize: fontSize.body - 2,
    fontWeight: '700',
    color: colors.textMuted,
    marginTop: 4,
  },
});
