import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BigButton } from '../../components/BigButton';
import { BigInput } from '../../components/BigInput';
import { ChoiceCard } from '../../components/ChoiceCard';
import { isDelivery, packageLabel } from '../../lib/delivery';
import { formatScheduled } from '../../lib/scheduling';
import { formatKm } from '../../lib/geo';
import {
  ADVANCE_OPTIONS,
  advanceLabel,
  formatMoney,
  isIntercity,
  parseMoney,
  paymentLabel,
  roundTripLabel,
  type MyProposal,
  type Ride,
} from '../../lib/rides';
import { colors, fontSize } from '../../theme';

type Props = {
  ride: Ride;
  awayKm: number | null;
  proposal?: MyProposal;
  accepting: boolean;
  // Em viagem para outra cidade o motorista já escolhe o adiantamento (50, 70 ou 100%).
  onAccept: (advance: number | null) => void;
  onPropose: (extra: number, advance: number | null) => Promise<void>;
  onWithdraw: () => Promise<void>;
  onDecline: () => Promise<void>;
};

export function OpenRequestCard({
  ride,
  awayKm,
  proposal,
  accepting,
  onAccept,
  onPropose,
  onWithdraw,
  onDecline,
}: Props) {
  const [proposing, setProposing] = useState(false);
  const [extraText, setExtraText] = useState('');
  const [sending, setSending] = useState(false);
  const [advance, setAdvance] = useState<number | null>(null);
  const extra = parseMoney(extraText);
  const waiting = proposal?.status === 'pending';
  // Viagem para outra cidade: o adiantamento é escolhido junto com o aceite.
  const intercity = isIntercity(ride);
  const needsAdvance = intercity && advance === null;
  // O adiantamento incide sobre o valor final (com o acréscimo, se houver).
  const baseForAdvance = proposing ? ride.estimated_price + (extra ?? 0) : ride.estimated_price;

  const advanceChoices = intercity ? (
    <View style={styles.advance}>
      <Text style={styles.line}>Quanto você quer receber adiantado?</Text>
      {ADVANCE_OPTIONS.map((percent) => (
        <ChoiceCard
          key={percent}
          label={advanceLabel(percent)}
          detail={percent === 0 ? 'recebe no fim' : formatMoney(Math.round(baseForAdvance * percent) / 100)}
          selected={advance === percent}
          onPress={() => setAdvance(percent)}
        />
      ))}
    </View>
  ) : null;

  async function send() {
    if (extra === null) return;
    setSending(true);
    try {
      await onPropose(extra, advance);
      setProposing(false);
      setExtraText('');
    } finally {
      setSending(false);
    }
  }

  async function decline() {
    setSending(true);
    try {
      await onDecline();
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
      {awayKm !== null ? (
        <Text style={styles.line}>
          {isDelivery(ride) ? 'Coleta' : 'Passageiro'} a {formatKm(awayKm)} de você
        </Text>
      ) : null}
      <Text style={styles.line}>{isDelivery(ride) ? 'Pegar' : 'Buscar'}: {ride.origin_address}</Text>
      <Text style={styles.line}>{isDelivery(ride) ? 'Entregar' : 'Levar'}: {ride.destination_address}</Text>

      {isDelivery(ride) ? (
        <View style={styles.place}>
          <Text style={styles.placeLabel}>Entrega</Text>
          <Text style={styles.placeText}>{packageLabel(ride.package_size)}</Text>
          <Text style={styles.line}>Quem recebe: {ride.recipient_name}</Text>
          {ride.recipient_note ? <Text style={styles.line}>Recado: {ride.recipient_note}</Text> : null}
          <Text style={styles.warning}>Para finalizar, peça o código a quem recebe.</Text>
        </View>
      ) : null}

      {ride.scheduled_for ? (
        <View style={styles.place}>
          <Text style={styles.placeLabel}>Viagem agendada</Text>
          <Text style={styles.placeText}>{formatScheduled(ride.scheduled_for)}</Text>
          <Text style={styles.warning}>Aceite pelo valor, ou proponha um acréscimo. Fica marcada na sua agenda.</Text>
        </View>
      ) : null}

      {roundTripLabel(ride) ? (
        <View style={styles.place}>
          <Text style={styles.placeLabel}>Viagem</Text>
          <Text style={styles.placeText}>{roundTripLabel(ride)}</Text>
          <Text style={styles.warning}>
            O valor já inclui a volta e a espera. Aceite, ou proponha um acréscimo.
          </Text>
        </View>
      ) : null}

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
            Proposta de + {formatMoney(proposal.extra_amount)}
            {proposal.advance_percent === 0
              ? ', sem adiantamento,'
              : proposal.advance_percent
                ? `, adiantamento de ${proposal.advance_percent}%`
                : ''}{' '}
            enviada. Aguardando o passageiro.
          </Text>
          <BigButton label="Retirar proposta" onPress={withdraw} loading={sending} variant="link" />
          {!ride.scheduled_for ? <BigButton label="Recusar pedido" onPress={decline} variant="link" /> : null}
        </>
      ) : proposing ? (
        <>
          <Text style={styles.line}>Quanto a mais você quer pedir? (em reais)</Text>
          <BigInput
            accessibilityLabel="Acréscimo em reais"
            placeholder="20,00"
            keyboardType="decimal-pad"
            value={extraText}
            onChangeText={setExtraText}
          />
          {extra !== null ? (
            <Text style={styles.line}>Total para o passageiro: {formatMoney(ride.estimated_price + extra)}</Text>
          ) : null}
          {advanceChoices}
          <BigButton
            label="Enviar proposta"
            onPress={send}
            disabled={extra === null || needsAdvance}
            loading={sending}
          />
          <BigButton label="Voltar" onPress={() => setProposing(false)} variant="link" />
        </>
      ) : (
        <>
          {advanceChoices}
          <BigButton
            label="Aceitar"
            onPress={() => onAccept(advance)}
            disabled={needsAdvance}
            loading={accepting}
          />
          {ride.destination_place || ride.round_trip || ride.scheduled_for ? (
            <BigButton label="Propor acréscimo" onPress={() => setProposing(true)} variant="link" />
          ) : null}
          {!ride.scheduled_for ? (
            <BigButton label="Recusar pedido" onPress={decline} loading={sending} variant="link" />
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
  advance: {
    gap: 6,
  },
  place: {
    gap: 2,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FDECEC',
  },
  placeLabel: {
    fontSize: fontSize.body - 2,
    fontWeight: '700',
    color: colors.textMuted,
  },
  placeText: {
    fontSize: fontSize.body + 2,
    fontWeight: '700',
    color: colors.text,
  },
  warning: {
    fontSize: fontSize.body - 2,
    color: colors.primaryDark,
  },
  waiting: {
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.primaryDark,
  },
});
