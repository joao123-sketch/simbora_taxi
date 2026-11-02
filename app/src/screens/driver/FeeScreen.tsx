import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { BigButton } from '../../components/BigButton';
import { CheckCard } from '../../components/CheckCard';
import { Screen } from '../../components/Screen';
import {
  continueContract,
  fetchFeeCharge,
  formatDay,
  formatDate,
  kindLabel,
  nagText,
  moneyLabel,
  type FeeCharge,
  type FeeStatus,
} from '../../lib/fees';
import { DRIVER_TERMS_VERSION } from '../../legal/driverTerms';
import { colors, fontSize } from '../../theme';

type Props = {
  userId: string;
  status: FeeStatus;
  // Recarrega a mensalidade depois de uma ação.
  onChanged: () => Promise<void>;
  // Vencida há menos de 5 dias o motorista pode deixar para depois; em atraso, não.
  onSkip?: () => void;
  onBack: () => void;
};

const statusTitle: Record<FeeStatus['state'], string> = {
  ok: 'Sua mensalidade',
  pending: 'Mensalidade do próximo mês',
  due: 'Hora de pagar a mensalidade',
  overdue: 'Mensalidade em atraso',
};

// De quanto em quanto tempo a tela confere se o pagamento caiu.
const POLL_MS = 10000;

export function FeeScreen({ status, onChanged, onSkip, onBack }: Props) {
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [charge, setCharge] = useState<FeeCharge | null>(null);
  // Aviso (não é erro): a cobrança ainda não abriu, ou outra recusa em português.
  const [chargeNote, setChargeNote] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);

  const hasOpenMonth = status.period_id !== null && !status.needs_renewal;

  // Pede a cobrança do mês ao abrir a tela (o Worker cria no Asaas na primeira vez).
  useEffect(() => {
    if (!hasOpenMonth) return;
    let alive = true;
    setChargeNote(null);
    fetchFeeCharge()
      .then((c) => alive && setCharge(c))
      .catch((e: { message?: string }) => alive && setChargeNote(e.message ?? 'Não conseguimos gerar a cobrança agora.'));
    return () => {
      alive = false;
    };
  }, [hasOpenMonth, status.period_id]);

  // Enquanto há cobrança na tela, confere se o pagamento caiu (o Asaas avisa o banco sozinho).
  useEffect(() => {
    if (!charge || !hasOpenMonth) return;
    const timer = setInterval(() => {
      onChanged().catch(() => {});
    }, POLL_MS);
    return () => clearInterval(timer);
    // onChanged vem do pai e muda a cada render; a conferência só precisa recomeçar com a cobrança.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charge, hasOpenMonth]);

  // O mês deixou de estar aberto depois de uma cobrança: o pagamento caiu.
  useEffect(() => {
    if (charge && !hasOpenMonth && !status.needs_renewal) setPaid(true);
  }, [charge, hasOpenMonth, status.needs_renewal]);

  async function run(action: () => Promise<void>, failure: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onChanged();
    } catch (e) {
      setError((e as { message?: string }).message || failure);
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    if (!charge?.pixPayload) return;
    await Clipboard.setStringAsync(charge.pixPayload);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  }

  // O mês acabou: continuar abre o próximo (aceita o contrato).
  if (status.needs_renewal && status.amount !== null && status.kind) {
    return (
      <Screen
        title={status.state === 'overdue' ? 'Mensalidade em atraso' : 'Continuar no Simbora Car'}
        subtitle={`Seu mês terminou em ${formatDay(status.period_end)}. Para seguir recebendo pedidos, abra o próximo mês: ${moneyLabel(status.amount)}, pago antes de começar.`}
        error={error}
        onBack={onBack}
      >
        <CheckCard label="Aceito o contrato do motorista" checked={accepted} onPress={() => setAccepted(!accepted)} />
        <BigButton
          label={`Continuar por ${moneyLabel(status.amount)}`}
          disabled={!accepted}
          loading={busy}
          onPress={() => run(() => continueContract(DRIVER_TERMS_VERSION), 'Não conseguimos abrir o mês. Tente de novo.')}
        />
        {onSkip && status.state !== 'overdue' ? <BigButton label="Lembrar depois" onPress={onSkip} variant="link" /> : null}
      </Screen>
    );
  }

  // Há um mês em aberto para pagar.
  if (hasOpenMonth) {
    return (
      <Screen
        title={statusTitle[status.state]}
        subtitle={`${kindLabel[status.kind ?? 'standard']}: ${moneyLabel(status.amount)}, vence em ${formatDay(status.due_on)}.`}
        error={error}
        onBack={onBack}
      >
        {status.state === 'due' || status.state === 'overdue' ? (
          <Text style={styles.warning}>
            {nagText(status)}
            {status.state === 'overdue' ? ' Quando o pagamento cair, o app libera sozinho.' : ''}
          </Text>
        ) : null}

        {charge ? (
          <>
            {charge.pixPayload ? (
              <>
                <View style={styles.qrBox}>
                  <QRCode value={charge.pixPayload} size={220} />
                </View>
                <Text style={styles.hint}>Abra o app do seu banco, escolha Pix e leia o QR, ou copie o código.</Text>
                <BigButton label={copied ? 'Copiado!' : 'Copiar código Pix'} icon="copy" onPress={copyCode} />
              </>
            ) : null}
            {charge.pixPayload ? (
              <Text style={styles.hint}>Quando o pagamento cair, esta tela atualiza sozinha.</Text>
            ) : (
              <Text style={styles.hint}>
                O código Pix ainda não ficou pronto. Feche e abra esta tela em um minuto. Se continuar, fale com o suporte do Simbora Car.
              </Text>
            )}
          </>
        ) : chargeNote ? (
          <Text style={styles.hint}>{chargeNote}</Text>
        ) : (
          <Text style={styles.hint}>Gerando a cobrança...</Text>
        )}

        <Summary status={status} />

        {onSkip && status.state !== 'overdue' ? (
          <BigButton
            label={status.state === 'due' ? 'Agora não (aviso de novo em 5 minutos)' : 'Lembrar depois'}
            onPress={onSkip}
            variant="link"
          />
        ) : null}
      </Screen>
    );
  }

  // Nada a pagar agora.
  const current = status.history[0];
  return (
    <Screen
      title="Sua mensalidade"
      subtitle={
        current
          ? `${kindLabel[current.kind]} até ${formatDay(current.period_end)}. Nada a pagar agora.`
          : 'Nada a pagar agora.'
      }
      onBack={onBack}
    >
      {paid ? <Text style={styles.ok}>Pagamento recebido. Obrigado!</Text> : null}
      <Summary status={status} />
    </Screen>
  );
}

// Próximo pagamento (data e valor) e os pagamentos já feitos, com a data em que cada um caiu.
function Summary({ status }: { status: FeeStatus }) {
  return (
    <>
      {status.next_due_on ? (
        <View style={styles.next}>
          <Text style={styles.rowTitle}>Próximo pagamento</Text>
          <Text style={styles.hint}>
            {moneyLabel(status.next_amount)} · vence em {formatDay(status.next_due_on)}
          </Text>
        </View>
      ) : null}
      {status.history.length > 0 ? <Text style={styles.section}>Pagamentos</Text> : null}
      {status.history.map((item) => (
        <View key={item.period_start} style={styles.row}>
          <Text style={styles.rowTitle}>
            {formatDay(item.period_start)} a {formatDay(item.period_end)} · {kindLabel[item.kind]}
          </Text>
          <Text style={styles.hint}>
            {item.status === 'paid'
              ? `Pago${item.paid_at ? ` em ${formatDate(item.paid_at)}` : ''} · ${moneyLabel(item.amount)}`
              : item.status === 'waived'
                ? 'Grátis'
                : `Em aberto · ${moneyLabel(item.amount)}`}
          </Text>
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  next: { gap: 2, padding: 12, borderRadius: 12, backgroundColor: colors.surfaceMuted },
  section: { fontSize: fontSize.body - 2, fontWeight: '700', color: colors.textMuted, marginTop: 4 },
  warning: { fontSize: fontSize.body, fontWeight: '700', color: colors.primaryDark },
  hint: { fontSize: fontSize.body - 2, color: colors.textMuted },
  ok: { fontSize: fontSize.body, fontWeight: '700', color: '#1B6E2D' },
  qrBox: {
    alignSelf: 'center',
    padding: 16,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.text,
    backgroundColor: '#FFFFFF',
  },
  row: { gap: 2, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#CCCCCC' },
  rowTitle: { fontSize: fontSize.body, fontWeight: '700', color: colors.text },
});
