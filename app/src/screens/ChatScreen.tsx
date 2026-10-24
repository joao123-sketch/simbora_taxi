import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BigButton } from '../components/BigButton';
import { BigInput } from '../components/BigInput';
import { Screen } from '../components/Screen';
import { sendMessage, type Message } from '../lib/chat';
import { colors, fontSize } from '../theme';

type Props = {
  rideId: number;
  myId: string;
  role: 'passenger' | 'driver';
  messages: Message[];
  // A conversa só vale durante a corrida.
  canSend: boolean;
  onClose: () => void;
};

const QUICK: Record<Props['role'], string[]> = {
  passenger: ['Estou aqui', 'Já estou saindo', 'Pode esperar um minutinho?'],
  driver: ['Estou chegando', 'Cheguei, estou na frente', 'Onde você está exatamente?'],
};

function timeOf(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Conversa entre passageiro e motorista: o telefone não aparece, é por aqui.
export function ChatScreen({ rideId, myId, role, messages, canSend, onClose }: Props) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(body: string) {
    const clean = body.trim();
    if (!clean) return;
    setSending(true);
    setError(null);
    try {
      await sendMessage(rideId, clean);
      setText('');
    } catch (e) {
      setError((e as { message?: string }).message || 'Não conseguimos enviar. Tente de novo.');
    } finally {
      setSending(false);
    }
  }

  return (
    <Screen title="Conversa" error={error}>
      {messages.length === 0 ? <Text style={styles.empty}>Nenhuma mensagem ainda.</Text> : null}

      {messages.map((message) => {
        const mine = message.sender_id === myId;
        return (
          <View key={message.id} style={[styles.row, mine ? styles.rowMine : styles.rowOther]}>
            <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
              <Text style={[styles.body, mine && styles.bodyMine]}>{message.body}</Text>
              <Text style={[styles.time, mine && styles.bodyMine]}>{timeOf(message.created_at)}</Text>
            </View>
          </View>
        );
      })}

      {canSend ? (
        <>
          <View style={styles.quick}>
            {QUICK[role].map((phrase) => (
              <BigButton key={phrase} label={phrase} onPress={() => send(phrase)} disabled={sending} variant="link" />
            ))}
          </View>
          <BigInput
            accessibilityLabel="Escreva sua mensagem"
            placeholder="Escreva aqui"
            value={text}
            onChangeText={setText}
            maxLength={500}
            onSubmitEditing={() => send(text)}
          />
          <BigButton label="Enviar" onPress={() => send(text)} disabled={text.trim().length === 0} loading={sending} />
        </>
      ) : (
        <Text style={styles.empty}>A conversa acabou junto com a corrida.</Text>
      )}

      <BigButton label="Voltar" onPress={onClose} variant="link" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: {
    fontSize: fontSize.body,
    color: colors.textMuted,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
  },
  rowMine: {
    justifyContent: 'flex-end',
  },
  rowOther: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '85%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    gap: 2,
  },
  bubbleMine: {
    backgroundColor: colors.primary,
  },
  bubbleOther: {
    backgroundColor: '#EEEEEE',
  },
  body: {
    fontSize: fontSize.body,
    color: colors.text,
  },
  bodyMine: {
    color: colors.onPrimary,
  },
  time: {
    fontSize: fontSize.body - 6,
    color: colors.textMuted,
    alignSelf: 'flex-end',
  },
  quick: {
    gap: 0,
  },
});
