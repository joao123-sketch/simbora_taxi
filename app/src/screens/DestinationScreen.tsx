import { StyleSheet, Text } from 'react-native';

import { BigButton } from '../components/BigButton';
import { ChoiceCard } from '../components/ChoiceCard';
import { Screen } from '../components/Screen';
import type { SuggestedPlace } from '../lib/favorites';
import type { City } from '../lib/rides';
import { colors, fontSize } from '../theme';

type Props = {
  // Lugares para onde o passageiro já foi várias vezes (favoritos automáticos).
  suggestions: SuggestedPlace[];
  onPickSuggestion: (place: SuggestedPlace) => void;
  otherCities: City[];
  onPickOnMap: () => void;
  onPickCity: (city: City) => void;
  onBack: () => void;
};

export function DestinationScreen({ suggestions, onPickSuggestion, otherCities, onPickOnMap, onPickCity, onBack }: Props) {
  return (
    <Screen title="Pra onde você vai?">
      {suggestions.length > 0 ? (
        <>
          <Text style={styles.section}>Seus lugares de sempre</Text>
          {suggestions.map((place) => (
            <ChoiceCard
              key={`${place.lat},${place.lng}`}
              label={place.title}
              detail={`${place.trips} viagens`}
              onPress={() => onPickSuggestion(place)}
            />
          ))}
        </>
      ) : null}
      <BigButton label="Aqui na cidade" onPress={onPickOnMap} />
      {otherCities.length > 0 ? (
        <>
          <Text style={styles.section}>Outra cidade (preço fechado)</Text>
          {otherCities.map((city) => (
            <ChoiceCard key={city.id} label={city.name} onPress={() => onPickCity(city)} />
          ))}
        </>
      ) : null}
      <BigButton label="Voltar" onPress={onBack} variant="link" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: {
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.textMuted,
    marginTop: 8,
  },
});
