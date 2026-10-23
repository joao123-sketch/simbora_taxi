import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BigButton } from '../../components/BigButton';
import { BigInput } from '../../components/BigInput';
import { formatKm } from '../../lib/geo';
import { formatMoney, parseMoney, paymentLabel, type MyProposal, type Ride } from '../../lib/rides';
import { colors, fontSize } from '../../theme';

type Props = {
  ride: Ride;
  awayKm: number | null;
  proposal?: MyProposal;
  accepting: boolean;
  onAccept: () => void;
  onPropose: (extra: number) => Promise<void>;
  onWithdraw: () => Promise<void>;
};

export function OpenRequestCard({ ride, awayKm, proposal, accepting, onAccept, onPropose, onWithdraw }: Props) {
  const [proposing, setProposing] = useState(false);
  const [extraText, setExtraText] = useState('');
  const [sending, setSending] = useState(false);
  const extra = parseMoney(extraText);
  const waiting = proposal?.status === 'pending';

  async function send() {
    if (extra === null) return;
    setSending(true);
    try {
      await onPropose(extra);
      setProposing(false);
      setExtraText('');
    } finally {
      setSending(false);
    }
  }

  async function withdraw() {
    setSending(true);
    try {
      await onWithdraw();
    } finally {
      setSending(false);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.price}>
        {formatMoney(ride.estimated_price)} · {paymentLabel[ride.payment_method]}
      </Text>
      {awayKm !== null ? <Text style={styles.line}>Passageiro a {formatKm(awayKm)} de você</Text> : null}
      <Text style={styles.line}>Buscar: {ride.origin_address}</Text>
      <Text style={styles.line}>Levar: {ride.destination_address}</Text>

      {ride.destination_place ? (
        <View style={styles.place}>
          <Text style={styles.placeLabel}>Deixar em</Text>
          <Text style={styles.placeText}>{ride.destination_place}</Text>
          <Text style={styles.warning}>
            O passageiro quer ser deixado fora do centro. Aceite pelo valor, ou proponha um acréscimo.
          </Text>
        </View>
      ) : null}

      {waiting ? (
        <>
          <Text style={styles.waiting}>
            Proposta de + {formatMoney(proposal.extra_amount)} enviada. Aguardando o passageiro.
          </Text>
          <BigButton label="Retirar proposta" onPress={withdraw} loading={sending} variant="link" />
        </>
      ) : proposing ? (
        <>
          <BigInput
            accessibilityLabel="Acréscimo em reais"
            placeholder="Acréscimo (ex.: 20)"
            keyboardType="decimal-pad"
            value={extraText}
            onChangeText={setExtraText}
          />
          {extra !== null ? (
            <Text style={styles.line}>Total para o passageiro: {formatMoney(ride.estimated_price + extra)}</Text>
          ) : null}
          <BigButton label="Enviar proposta" onPress={send} disabled={extra === null} loading={sending} />
          <BigButton label="Voltar" onPress={() => setProposing(false)} variant="link" />
        </>
      ) : (
        <>
          <BigButton label="Aceitar" onPress={onAccept} loading={accepting} />
          {ride.destination_place ? (
            <BigButton label="Propor acréscimo" onPress={() => setProposing(true)} variant="link" />
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 6,
    padding: 16,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  price: {
    fontSize: fontSize.body + 4,
    fontWeight: '700',
    color: colors.text,
  },
  line: {
    fontSize: fontSize.body,
    color: colors.text,
  },
  place: {
    gap: 2,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FDECEC',
  },
  placeLabel: {
    fontSize: fontSize.body - 4,
    fontWeight: '700',
    color: colors.textMuted,
  },
  placeText: {
    fontSize: fontSize.body + 2,
    fontWeight: '700',
    color: colors.text,
  },
  warning: {
    fontSize: fontSize.body - 4,
    color: colors.primaryDark,
  },
  waiting: {
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.primaryDark,
  },
});
