import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Avatar } from '../../components/Avatar';
import { BigButton } from '../../components/BigButton';
import { Screen } from '../../components/Screen';
import { fetchBlockedPassengers, unblockPassenger, type BlockedPassenger } from '../../lib/blocks';
import { colors, fontSize, cardSurface } from '../../theme';

type Props = {
  onBack: () => void;
};

// Lista de quem o motorista bloqueou, com a opção de desbloquear.
export function BlockedPassengersScreen({ onBack }: Props) {
  const [list, setList] = useState<BlockedPassenger[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchBlockedPassengers()
      .then(setList)
      .catch(() => setError('Sem conexão com o Simbora Car. Confira a internet.'));
  }, []);

  useEffect(load, [load]);

  async function unblock(passengerId: string) {
    setBusy(passengerId);
    setError(null);
    try {
      await unblockPassenger(passengerId);
      load();
    } catch {
      setError('Não conseguimos desbloquear agora. Tente de novo.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen title="Passageiros bloqueados" subtitle="Eles não recebem aviso e nunca chegam até você." error={error} onBack={onBack}>
      {list === null && !error ? <Text style={styles.empty}>Carregando...</Text> : null}
      {list?.length === 0 ? <Text style={styles.empty}>Você não bloqueou ninguém.</Text> : null}
      {list?.map((p) => (
        <View key={p.passenger_id} style={styles.card}>
          <View style={styles.who}>
            <Avatar path={p.photo_path} size={56} />
            <Text style={styles.name}>{p.full_name ?? 'Passageiro'}</Text>
          </View>
          <BigButton
            label="Desbloquear"
            onPress={() => unblock(p.passenger_id)}
            loading={busy === p.passenger_id}
            variant="secondary"
          />
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: {
    fontSize: fontSize.body,
    color: colors.textMuted,
  },
  card: {
    gap: 10,
    ...cardSurface,
  },
  who: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  name: {
    flex: 1,
    fontSize: fontSize.body + 2,
    fontWeight: '700',
    color: colors.text,
  },
});
