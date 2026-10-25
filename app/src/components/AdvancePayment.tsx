import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  ADVANCE_OPTIONS,
  advanceAmount,
  advanceLabel,
  confirmAdvanceReceived,
  fetchRide,
  formatMoney,
  setAdvancePercent,
  type Ride,
} from '../lib/rides';
import { colors, fontSize, cardSurface } from '../theme';
import { BigButton } from './BigButton';
import { ChoiceCard } from './ChoiceCard';

// Viagem para outra cidade: o passageiro paga adiantado direto ao motorista, e
// a viagem só começa depois que o motorista marca que recebeu.

type DriverProps = {
  ride: Ride;
  // Devolve a corrida atualizada para a tela.
  onChange: (ride: Ride) => void;
};

export function DriverAdvanceCard({ ride, onChange }: DriverProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const received = !!ride.advance_received_at;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChange(await fetchRide(ride.id));
    } catch (e) {
      setError((e as { message?: string }).message || 'Não conseguimos atualizar o adiantamento.');
    } finally {
      setBusy(false);
    }
  }

  if (ride.advance_percent === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Sem adiantamento</Text>
        <Text style={styles.line}>Você recebe no fim da viagem. Pode iniciar quando o passageiro embarcar.</Text>
        {ADVANCE_OPTIONS.filter((p) => p > 0).map((percent) => (
          <ChoiceCard
            key={percent}
            label={advanceLabel(percent)}
            detail={formatMoney(Math.round(ride.estimated_price * percent) / 100)}
            selected={false}
            onPress={() => run(() => setAdvancePercent(ride.id, percent))}
          />
        ))}
        <Text style={styles.line}>Quer pedir adiantado? Escolha acima.</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    );
  }

  if (received) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Adiantamento recebido</Text>
        <Text style={styles.line}>
          {ride.advance_percent}% · {formatMoney(advanceAmount(ride) ?? 0)}. Pode iniciar a viagem.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Pagamento adiantado</Text>
      <Text style={styles.line}>
        Viagem para outra cidade: escolha quanto o passageiro paga antes. Ele paga direto a você, e a viagem só
        começa depois que você marcar que recebeu. Com "Sem adiantamento" você recebe no fim.
      </Text>
      {ADVANCE_OPTIONS.map((percent) => (
        <ChoiceCard
          key={percent}
          label={advanceLabel(percent)}
          detail={percent === 0 ? 'recebe no fim' : formatMoney(Math.round(ride.estimated_price * percent) / 100)}
          selected={ride.advance_percent === percent}
          onPress={() => run(() => setAdvancePercent(ride.id, percent))}
        />
      ))}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {ride.advance_percent && ride.advance_percent > 0 ? (
        <BigButton
          label={`Recebi ${formatMoney(advanceAmount(ride) ?? 0)}`}
          onPress={() => run(() => confirmAdvanceReceived(ride.id))}
          loading={busy}
        />
      ) : null}
    </View>
  );
}

// O que o passageiro vê.
export function PassengerAdvanceNote({ ride }: { ride: Ride }) {
  if (ride.advance_percent === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Sem pagamento adiantado</Text>
        <Text style={styles.line}>Você paga ao motorista no fim da viagem.</Text>
      </View>
    );
  }

  if (ride.advance_received_at) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Adiantamento confirmado</Text>
        <Text style={styles.line}>O motorista confirmou o pagamento. A viagem pode começar.</Text>
      </View>
    );
  }

  if (ride.advance_percent) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>
          Pague {formatMoney(advanceAmount(ride) ?? 0)} adiantado ({ride.advance_percent}%)
        </Text>
        <Text style={styles.line}>
          Pague direto ao motorista, em Pix ou dinheiro. A viagem começa quando ele confirmar que recebeu.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Pagamento adiantado</Text>
      <Text style={styles.line}>O motorista vai informar quanto precisa receber antes de sair para a outra cidade.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 8,
    ...cardSurface,
  },
  title: {
    fontSize: fontSize.body + 4,
    fontWeight: '700',
    color: colors.text,
  },
  line: {
    fontSize: fontSize.body,
    color: colors.text,
  },
  error: {
    fontSize: fontSize.body - 2,
    fontWeight: '700',
    color: colors.primaryDark,
  },
});
