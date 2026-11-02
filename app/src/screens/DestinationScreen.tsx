import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { ChoiceCard } from '../components/ChoiceCard';
import { PlaceSearch } from '../components/PlaceSearch';
import { Screen } from '../components/Screen';
import { distanceKm } from '../lib/geo';
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
  onPickCity: (city: City) => void;
  onBack: () => void;
};

// Destino mais perto que isso da origem é o mesmo lugar.
const MIN_TRIP_KM = 0.05;

export function DestinationScreen({ city, origin, suggestions, onPickSuggestion, otherCities, onPickPlace, onPickCity, onBack }: Props) {
  // "Aqui na cidade" abre a busca nesta mesma tela e esconde o resto.
  const [searching, setSearching] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  function leaveSearch() {
    setSearching(false);
    setProblem(null);
  }

  return (
    <Screen
      title="Pra onde você vai?"
      error={problem}
      onBack={searching ? leaveSearch : onBack}
      backdrop={{ center: origin, markers: [{ coord: origin, kind: 'origin' }] }}
    >
      {searching ? (
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
      ) : (
        <>
          <ChoiceCard label="Aqui na cidade" icon="search" onPress={() => setSearching(true)} />
          {suggestions.length > 0 ? (
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
          {otherCities.length > 0 ? (
            <>
              <Text style={styles.section}>Outra cidade (preço fechado)</Text>
              {otherCities.map((other) => (
                <ChoiceCard key={other.id} label={other.name} icon="location" onPress={() => onPickCity(other)} />
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
