import { useState } from 'react';

import { BigButton } from '../components/BigButton';
import { BigInput } from '../components/BigInput';
import { Screen } from '../components/Screen';

type Props = {
  onConfirm: (name: string) => void;
  onBack: () => void;
};

// Pedir para outra pessoa: o motorista vê o nome de quem vai andar.
export function RiderNameScreen({ onConfirm, onBack }: Props) {
  const [name, setName] = useState('');
  const clean = name.trim();

  return (
    <Screen
      title="Quem vai andar?"
      subtitle="O motorista vai ver esse nome. Você continua acompanhando a corrida e pagando."
      onBack={onBack}
      footer={<BigButton label="Continuar" onPress={() => onConfirm(clean)} disabled={clean.length < 2} />}
    >
      <BigInput
        accessibilityLabel="Nome de quem vai andar"
        placeholder="Nome da pessoa"
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        maxLength={80}
      />
    </Screen>
  );
}
