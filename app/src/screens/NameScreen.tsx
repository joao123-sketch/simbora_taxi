import { useState } from 'react';

import { BigButton } from '../components/BigButton';
import { BigInput } from '../components/BigInput';
import { Screen } from '../components/Screen';
import { supabase } from '../lib/supabase';

type Props = {
  userId: string;
  onSaved: (name: string) => void;
};

export function NameScreen({ userId, onSaved }: Props) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = name.trim();

  async function save() {
    setLoading(true);
    setError(null);
    const { error } = await supabase.from('profiles').update({ full_name: trimmed }).eq('id', userId);
    setLoading(false);

    if (error) {
      setError('Não conseguimos salvar. Tente de novo.');
      return;
    }
    onSaved(trimmed);
  }

  return (
    <Screen
      title="Como você se chama?"
      subtitle="O motorista vai ver esse nome quando for te buscar."
      error={error}
    >
      <BigInput
        accessibilityLabel="Seu nome"
        placeholder="Seu nome"
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        value={name}
        onChangeText={setName}
        onSubmitEditing={() => trimmed.length >= 2 && save()}
      />
      <BigButton label="Continuar" onPress={save} disabled={trimmed.length < 2} loading={loading} />
    </Screen>
  );
}
