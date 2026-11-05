import { useEffect, useState } from 'react';
import { Linking, Text } from 'react-native';

import { BigButton } from '../components/BigButton';
import { BigInput } from '../components/BigInput';
import { Screen } from '../components/Screen';
import { formatPhone } from '../lib/phone';
import { supportWhatsappUrl } from '../lib/supportLink';
import { supabase } from '../lib/supabase';

type Props = {
  phone: string;
  onBack: () => void;
};

const CODE_LENGTH = 6;

// Espera entre um reenvio e outro: cada SMS custa, e o Supabase também limita os pedidos seguidos.
const RESEND_WAIT_SECONDS = 60;

export function CodeScreen({ phone, onBack }: Props) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [wait, setWait] = useState(RESEND_WAIT_SECONDS);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  async function resend() {
    setResending(true);
    setError(null);
    setResent(false);
    const { error } = await supabase.auth.signInWithOtp({ phone });
    setResending(false);

    if (error) {
      setError('Não conseguimos mandar o código de novo. Espere um pouco e tente outra vez.');
      return;
    }
    setCode('');
    setResent(true);
    setWait(RESEND_WAIT_SECONDS);
  }

  // Ao confirmar, o Supabase cria a sessão e o App troca de tela sozinho.
  async function verify(token: string) {
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
    setLoading(false);

    if (error) {
      setError('Código errado ou vencido. Tente de novo.');
      setCode('');
    }
  }

  function handleChange(text: string) {
    const digits = text.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    if (digits.length === CODE_LENGTH) verify(digits);
  }

  return (
    <Screen
      title="Digite o código"
      subtitle={`Enviamos 6 números por SMS para ${formatPhone(phone.slice(3))}.`}
      error={error}
    >
      <BigInput
        accessibilityLabel="Código de 6 números"
        placeholder="000000"
        keyboardType="number-pad"
        autoComplete="sms-otp"
        textContentType="oneTimeCode"
        maxLength={CODE_LENGTH}
        value={code}
        onChangeText={handleChange}
        style={{ letterSpacing: 8, textAlign: 'center' }}
      />
      <BigButton
        label="Entrar"
        onPress={() => verify(code)}
        disabled={code.length !== CODE_LENGTH}
        loading={loading}
      />
      {resent ? <Text style={{ fontSize: 18, color: '#555555' }}>Mandamos um código novo. Use o último que chegou.</Text> : null}
      <BigButton
        label={wait > 0 ? `Reenviar código (${wait}s)` : 'Reenviar código'}
        onPress={resend}
        disabled={wait > 0}
        loading={resending}
        variant="link"
      />
      <BigButton
        label="Seu código não chegou? Fale com o suporte"
        icon="logo-whatsapp"
        onPress={() => Linking.openURL(supportWhatsappUrl(phone.slice(3))).catch(() => {})}
        variant="secondary"
      />
      <BigButton label="Trocar o número" onPress={onBack} variant="link" />
    </Screen>
  );
}
