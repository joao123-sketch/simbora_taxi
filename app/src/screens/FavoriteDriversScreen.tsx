import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { BigButton } from '../components/BigButton';
import { BigInput } from '../components/BigInput';
import { Screen } from '../components/Screen';
import {
  codeFromText,
  driverDescription,
  favoriteByCode,
  favoriteDriver,
  fetchFavoriteDrivers,
  fetchFrequentDrivers,
  unfavoriteDriver,
  type DriverCard,
  type FavoriteDriver,
  type FrequentDriver,
} from '../lib/favoriteDrivers';
import { colors, fontSize, cardSurface } from '../theme';
import { QrScanScreen } from './QrScanScreen';

type Props = {
  // Código vindo de um link de convite: o motorista é favoritado ao abrir a tela.
  autoAddCode?: string;
  onBack: () => void;
};

function ridesLabel(n: number): string {
  return n === 1 ? '1 corrida com você' : `${n} corridas com você`;
}

// Meus motoristas: os favoritos (que chamam primeiro), quem já levou a pessoa
// e a entrada de um novo por QR ou código.
export function FavoriteDriversScreen({ autoAddCode, onBack }: Props) {
  const [favorites, setFavorites] = useState<FavoriteDriver[] | null>(null);
  const [frequent, setFrequent] = useState<FrequentDriver[]>([]);
  const [code, setCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [fav, freq] = await Promise.all([fetchFavoriteDrivers(), fetchFrequentDrivers()]);
      setFavorites(fav);
      setFrequent(freq);
    } catch {
      setError('Sem conexão com o Simbora Car. Confira a internet.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function add(raw: string) {
    const clean = codeFromText(raw);
    if (!clean) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const driver: DriverCard = await favoriteByCode(clean);
      setMessage(`${driver.full_name ?? 'Motorista'} agora é seu motorista favorito.`);
      setCode('');
      await load();
    } catch (e) {
      setError((e as { message?: string }).message || 'Não conseguimos adicionar esse motorista.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (autoAddCode) add(autoAddCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAddCode]);

  async function favorite(driverId: string) {
    setError(null);
    setMessage(null);
    try {
      await favoriteDriver(driverId);
      await load();
    } catch {
      setError('Não conseguimos favoritar o motorista. Tente de novo.');
    }
  }

  async function remove(driverId: string) {
    setError(null);
    setMessage(null);
    try {
      await unfavoriteDriver(driverId);
      await load();
    } catch {
      setError('Não conseguimos tirar o motorista. Tente de novo.');
    }
  }

  if (scanning) {
    return (
      <QrScanScreen
        onBack={() => setScanning(false)}
        onScanned={(text) => {
          setScanning(false);
          add(text);
        }}
      />
    );
  }

  const others = frequent.filter((d) => !d.is_favorite);

  return (
    <Screen
      title="Meus motoristas"
      subtitle="Seu motorista favorito recebe o seu pedido primeiro."
      error={error}
      footer={<BigButton label="Voltar" onPress={onBack} variant="link" />}
    >
      {message ? (
        <Text accessibilityRole="alert" style={styles.ok}>
          {message}
        </Text>
      ) : null}

      <BigButton label="Ler o QR do motorista" onPress={() => setScanning(true)} />
      <BigInput
        value={code}
        onChangeText={setCode}
        placeholder="Ou digite o código"
        autoCapitalize="characters"
        autoCorrect={false}
        accessibilityLabel="Código do motorista"
      />
      <BigButton label="Adicionar pelo código" onPress={() => add(code)} disabled={!codeFromText(code)} loading={busy} variant="link" />

      <Text style={styles.section}>Favoritos</Text>
      {favorites === null && !error ? <ActivityIndicator size="large" color={colors.primary} /> : null}
      {favorites?.length === 0 ? <Text style={styles.empty}>Você ainda não tem motorista favorito.</Text> : null}
      {favorites?.map((d) => (
        <View key={d.driver_id} style={styles.card}>
          <Text style={styles.name}>{d.full_name ?? 'Motorista'}</Text>
          <Text style={styles.detail}>{driverDescription(d)}</Text>
          <Text style={styles.detail}>
            {d.is_online ? 'Online agora' : 'Offline'}
            {d.rides_together > 0 ? ` · ${ridesLabel(d.rides_together)}` : ''}
          </Text>
          <BigButton label="Tirar dos favoritos" onPress={() => remove(d.driver_id)} variant="link" />
        </View>
      ))}

      {others.length > 0 ? <Text style={styles.section}>Quem já te levou</Text> : null}
      {others.map((d) => (
        <View key={d.driver_id} style={styles.card}>
          <Text style={styles.name}>{d.full_name ?? 'Motorista'}</Text>
          <Text style={styles.detail}>{driverDescription(d)}</Text>
          <Text style={styles.detail}>{ridesLabel(d.rides_together)}</Text>
          <BigButton label="Favoritar" onPress={() => favorite(d.driver_id)} variant="link" />
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  ok: { fontSize: fontSize.body, fontWeight: '700', color: '#1B6E2D', textAlign: 'center' },
  section: { fontSize: fontSize.body + 4, fontWeight: '800', color: colors.text, marginTop: 8 },
  empty: { fontSize: fontSize.body - 2, color: colors.textMuted },
  card: {
    ...cardSurface,
    gap: 4,
  },
  name: { fontSize: fontSize.body + 2, fontWeight: '800', color: colors.text },
  detail: { fontSize: fontSize.body - 2, color: colors.textMuted },
});
