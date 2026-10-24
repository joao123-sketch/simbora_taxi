import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { searchPlaces, type PlaceResult } from '../lib/geocode';
import type { City } from '../lib/rides';
import { colors, fontSize, touchTarget } from '../theme';

type Props = {
  city: City;
  onPick: (place: PlaceResult) => void;
};

// Cartão para escrever um endereço ou lugar. A busca roda ao tocar em "Buscar"
// (o serviço grátis de endereços não aceita autocompletar). Ao escolher um
// resultado o alfinete vai para lá e a pessoa ainda pode ajustar no mapa.
export function PlaceSearch({ city, onPick }: Props) {
  const [text, setText] = useState('');
  const [results, setResults] = useState<PlaceResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);

  async function search() {
    if (text.trim().length < 2) return;
    setSearching(true);
    setFailed(false);
    try {
      setResults(await searchPlaces(city, text));
    } catch {
      setResults(null);
      setFailed(true);
    } finally {
      setSearching(false);
    }
  }

  function pick(place: PlaceResult) {
    setResults(null);
    setText(place.title);
    onPick(place);
  }

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <TextInput
          accessibilityLabel="Endereço ou lugar de destino"
          placeholder="Digite o endereço ou lugar"
          placeholderTextColor={colors.textMuted}
          value={text}
          onChangeText={setText}
          onSubmitEditing={search}
          returnKeyType="search"
          style={styles.input}
        />
        <Pressable accessibilityRole="button" accessibilityLabel="Buscar" onPress={search} style={styles.button}>
          {searching ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.buttonText}>Buscar</Text>}
        </Pressable>
      </View>

      {failed ? <Text style={styles.note}>Não conseguimos buscar agora. Arraste o mapa até o lugar.</Text> : null}

      {results && results.length === 0 ? (
        <Text style={styles.note}>Não achamos esse lugar. Tente outro nome ou arraste o mapa.</Text>
      ) : null}

      {results?.map((place) => (
        <Pressable
          key={place.id}
          accessibilityRole="button"
          accessibilityLabel={place.title}
          onPress={() => pick(place)}
          style={styles.result}
        >
          <Text style={styles.resultTitle}>{place.title}</Text>
          {place.subtitle ? <Text style={styles.resultSubtitle}>{place.subtitle}</Text> : null}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 4,
    padding: 8,
    borderRadius: 24,
    backgroundColor: colors.background,
    boxShadow: '0 4px 14px rgba(0, 0, 0, 0.22)',
    elevation: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: touchTarget - 8,
    paddingHorizontal: 14,
    fontSize: fontSize.body,
    color: colors.text,
  },
  button: {
    minHeight: touchTarget - 8,
    paddingHorizontal: 22,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  buttonText: {
    color: colors.onPrimary,
    fontSize: fontSize.body,
    fontWeight: '700',
  },
  note: {
    fontSize: fontSize.body - 2,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  result: {
    minHeight: touchTarget - 8,
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderTopWidth: 1,
    borderTopColor: '#E4E4E4',
  },
  resultTitle: {
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.text,
  },
  resultSubtitle: {
    fontSize: fontSize.body - 2,
    color: colors.textMuted,
  },
});
