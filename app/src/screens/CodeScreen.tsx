import { useState } from 'react';

import { BigButton } from '../components/BigButton';
import { BigInput } from '../components/BigInput';
import { Screen } from '../components/Screen';
import { formatPhone } from '../lib/phone';
import { supabase } from '../lib/supabase';

type Props = {
  phone: string;
  onBack: () => void;
};

const CODE_LENGTH = 6;

export function CodeScreen({ phone, onBack }: Props) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      <BigButton label="Trocar o número" onPress={onBack} variant="link" />
    </Screen>
  );
}
