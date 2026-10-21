import { ScrollView, StyleSheet, Text } from 'react-native';

import { BigButton } from '../components/BigButton';
import { ChoiceCard } from '../components/ChoiceCard';
import { Screen } from '../components/Screen';
import type { City } from '../lib/rides';
import { colors, fontSize } from '../theme';

type Props = {
  otherCities: City[];
  onPickOnMap: () => void;
  onPickCity: (city: City) => void;
  onBack: () => void;
};

export function DestinationScreen({ otherCities, onPickOnMap, onPickCity, onBack }: Props) {
  return (
    <Screen title="Pra onde você vai?">
      <BigButton label="Aqui na cidade" onPress={onPickOnMap} />
      {otherCities.length > 0 ? (
        <>
          <Text style={styles.section}>Outra cidade (preço fechado)</Text>
          <ScrollView contentContainerStyle={styles.list}>
            {otherCities.map((city) => (
              <ChoiceCard key={city.id} label={city.name} onPress={() => onPickCity(city)} />
            ))}
          </ScrollView>
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
  list: {
    gap: 12,
  },
});
