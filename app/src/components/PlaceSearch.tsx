import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  newSearchSession,
  resolveSuggestion,
  suggestPlaces,
  type PlaceResult,
  type PlaceSuggestion,
  type SearchSession,
} from '../lib/geocode';
import type { City } from '../lib/rides';
import { colors, fontSize, touchTarget } from '../theme';

type Props = {
  city: City;
  onPick: (place: PlaceResult) => void;
};

// Espera a pessoa parar de digitar antes de consultar (cada consulta custa).
const TYPING_PAUSE_MS = 350;

// Campo para escrever um endereço ou lugar, com sugestões enquanto digita.
// Ao escolher uma sugestão, quem usa o componente recebe o lugar com as coordenadas.
export function PlaceSearch({ city, onPick }: Props) {
  const [text, setText] = useState('');
  const [results, setResults] = useState<PlaceSuggestion[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const session = useRef<SearchSession>(null);
  // Só a resposta da última digitação vale; as antigas chegam fora de ordem.
  const latest = useRef(0);
  const picked = useRef('');

  useEffect(() => {
    const query = text.trim();
    if (query.length < 2 || query === picked.current) {
      setResults(null);
      setFailed(false);
      return;
    }
    const id = ++latest.current;
    const timer = setTimeout(async () => {
      setSearching(true);
      setFailed(false);
      try {
        if (!session.current) session.current = await newSearchSession();
        const found = await suggestPlaces(city, query, session.current);
        if (id === latest.current) setResults(found);
      } catch {
        if (id === latest.current) {
          setResults(null);
          setFailed(true);
        }
      } finally {
        if (id === latest.current) setSearching(false);
      }
    }, TYPING_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [text, city]);

  async function pick(suggestion: PlaceSuggestion) {
    latest.current += 1;
    setSearching(true);
    setFailed(false);
    try {
      const place = await resolveSuggestion(suggestion);
      picked.current = suggestion.title;
      setText(suggestion.title);
      setResults(null);
      // A cobrança da sessão fecha aqui; a próxima busca abre uma nova.
      session.current = null;
      onPick(place);
    } catch {
      setFailed(true);
    } finally {
      setSearching(false);
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Ionicons name="search" size={22} color={colors.textMuted} style={styles.icon} />
        <TextInput
          accessibilityLabel="Endereço ou lugar"
          placeholder="Digite o endereço ou lugar"
          placeholderTextColor={colors.textMuted}
          value={text}
          onChangeText={setText}
          autoCorrect={false}
          returnKeyType="search"
          style={styles.input}
        />
        {searching ? <ActivityIndicator color={colors.primary} style={styles.spinner} /> : null}
      </View>

      {failed ? <Text style={styles.note}>Não conseguimos buscar agora. Confira a internet e tente de novo.</Text> : null}

      {results && results.length === 0 ? (
        <Text style={styles.note}>Não achamos esse lugar. Tente outro nome, ou a rua e o bairro.</Text>
      ) : null}

      {results?.map((place) => (
        <Pressable
          key={place.id}
          accessibilityRole="button"
          accessibilityLabel={place.subtitle ? `${place.title}, ${place.subtitle}` : place.title}
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
    padding: 4,
    borderRadius: 14,
    backgroundColor: colors.surfaceMuted,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  icon: {
    marginLeft: 12,
  },
  input: {
    flex: 1,
    minHeight: touchTarget - 8,
    paddingHorizontal: 10,
    fontSize: fontSize.body,
    color: colors.text,
  },
  spinner: {
    marginRight: 12,
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
    borderTopColor: colors.border,
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
