import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { BigButton } from '../../components/BigButton';
import { CheckCard } from '../../components/CheckCard';
import { Screen } from '../../components/Screen';
import {
  claimFeePayment,
  continueContract,
  formatDay,
  kindLabel,
  nagText,
  moneyLabel,
  uploadReceipt,
  type FeeStatus,
} from '../../lib/fees';
import { pixPayload } from '../../lib/pix';
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

export function FeeScreen({ userId, status, onChanged, onSkip, onBack }: Props) {
  const [accepted, setAccepted] = useState(false);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const payload =
    status.pix && status.amount !== null && status.period_id !== null ? pixPayload(status.pix, status.amount) : null;

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

  async function pickReceipt() {
    setError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Libere o acesso às fotos para anexar o comprovante.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (!result.canceled) setReceipt(result.assets[0].uri);
  }

  async function copyCode() {
    if (!payload) return;
    await Clipboard.setStringAsync(payload);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  }

  async function iPaid() {
    if (status.period_id === null) return;
    const periodId = status.period_id;
    await run(async () => {
      const path = receipt ? await uploadReceipt(userId, periodId, receipt) : null;
      await claimFeePayment(periodId, path);
      setReceipt(null);
    }, 'Não conseguimos avisar a equipe. Tente de novo.');
  }

  // O mês acabou: continuar abre o próximo (aceita o contrato).
  if (status.needs_renewal && status.amount !== null && status.kind) {
    return (
      <Screen
        title={status.state === 'overdue' ? 'Mensalidade em atraso' : 'Continuar no Simbora Car'}
        subtitle={`Seu mês terminou em ${formatDay(status.period_end)}. Para seguir recebendo pedidos, abra o próximo mês: ${moneyLabel(status.amount)}, pago antes de começar.`}
        error={error}
        footer={<BigButton label="Voltar" onPress={onBack} variant="link" />}
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
  if (status.period_id !== null) {
    const claimed = !!status.claimed_at;
    return (
      <Screen
        title={statusTitle[status.state]}
        subtitle={`${kindLabel[status.kind ?? 'standard']}: ${moneyLabel(status.amount)}, vence em ${formatDay(status.due_on)}.`}
        error={error}
        footer={<BigButton label="Voltar" onPress={onBack} variant="link" />}
      >
        {status.state === 'due' || status.state === 'overdue' ? (
          <Text style={styles.warning}>
            {nagText(status)}
            {status.state === 'overdue' ? ' Depois que você pagar, a equipe confirma e libera.' : ''}
          </Text>
        ) : null}

        {payload ? (
          <>
            <View style={styles.qrBox}>
              <QRCode value={payload} size={220} />
            </View>
            <Text style={styles.hint}>Abra o app do seu banco, escolha Pix e leia o QR, ou copie o código.</Text>
            <BigButton label={copied ? 'Copiado!' : 'Copiar código Pix'} onPress={copyCode} />
          </>
        ) : (
          <Text style={styles.hint}>
            Os dados do Pix ainda não foram cadastrados pela equipe. Fale com o suporte do Simbora Car.
          </Text>
        )}

        {claimed ? (
          <Text style={styles.ok}>Aviso enviado. A equipe vai conferir o pagamento e liberar.</Text>
        ) : (
          <>
            <BigButton
              label={receipt ? 'Trocar o comprovante' : 'Anexar o comprovante'}
              onPress={pickReceipt}
              variant="link"
            />
            {receipt ? <Text style={styles.hint}>Comprovante escolhido.</Text> : null}
            <BigButton label="Já paguei" onPress={iPaid} loading={busy} />
          </>
        )}
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
      footer={<BigButton label="Voltar" onPress={onBack} variant="link" />}
    >
      {status.history.map((item) => (
        <View key={item.period_start} style={styles.row}>
          <Text style={styles.rowTitle}>
            {formatDay(item.period_start)} a {formatDay(item.period_end)} · {kindLabel[item.kind]}
          </Text>
          <Text style={styles.hint}>
            {item.amount > 0 ? `${moneyLabel(item.amount)} · ` : ''}
            {item.status === 'paid' ? 'Pago' : item.status === 'waived' ? 'Grátis' : 'Em aberto'}
          </Text>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
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
