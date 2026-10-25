import { useState } from 'react';
import { Text } from 'react-native';

import { BigButton } from '../components/BigButton';
import { BigInput } from '../components/BigInput';
import { Screen } from '../components/Screen';
import { LegalScreen } from './LegalScreen';
import { formatPhone, isValidPhone, onlyDigits, toE164 } from '../lib/phone';
import { supabase } from '../lib/supabase';

type Props = {
  // Aviso mostrado em cima (ex.: a conta foi aberta em outro celular).
  notice?: string | null;
  onCodeSent: (phone: string) => void;
};

export function PhoneScreen({ notice, onCodeSent }: Props) {
  const [digits, setDigits] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLegal, setShowLegal] = useState(false);

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

  if (showLegal) {
    return <LegalScreen onBack={() => setShowLegal(false)} />;
  }

  return (
    <Screen
      title="Qual é o seu celular?"
      subtitle="Vamos mandar um código por SMS para entrar."
      error={error ?? notice ?? null}
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
      <Text style={{ fontSize: 18, color: '#555555' }}>
        Ao entrar, você aceita os termos de uso e a política de privacidade.
      </Text>
      <BigButton label="Ler termos e privacidade" onPress={() => setShowLegal(true)} variant="link" />
    </Screen>
  );
}
