import { useState } from 'react';

import { BigButton } from '../components/BigButton';
import { BigInput } from '../components/BigInput';
import { Screen } from '../components/Screen';
import { formatPhone, isValidPhone, onlyDigits, toE164 } from '../lib/phone';
import { supabase } from '../lib/supabase';

type Props = {
  onCodeSent: (phone: string) => void;
};

export function PhoneScreen({ onCodeSent }: Props) {
  const [digits, setDigits] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    setLoading(true);
    setError(null);
    const phone = toE164(digits);
    const { error } = await supabase.auth.signInWithOtp({ phone });
    setLoading(false);

    if (error) {
      setError('Não conseguimos enviar o código. Confira o número e tente de novo.');
      return;
    }
    onCodeSent(phone);
  }

  return (
    <Screen
      title="Qual é o seu celular?"
      subtitle="Vamos mandar um código por SMS para entrar."
      error={error}
    >
      <BigInput
        accessibilityLabel="Número do celular com DDD"
        placeholder="(88) 99999-9999"
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        value={formatPhone(digits)}
        onChangeText={(text) => setDigits(onlyDigits(text))}
        onSubmitEditing={() => isValidPhone(digits) && sendCode()}
      />
      <BigButton
        label="Receber código"
        onPress={sendCode}
        disabled={!isValidPhone(digits)}
        loading={loading}
      />
    </Screen>
  );
}
