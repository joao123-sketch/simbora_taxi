import { useState } from 'react';

import { BigButton } from '../../components/BigButton';
import { Screen } from '../../components/Screen';
import type { DriverStatus } from '../../lib/drivers';

type Props = {
  status: Exclude<DriverStatus, 'approved'>;
  onRefresh: () => Promise<void>;
  onBack: () => void;
};

const messages: Record<Props['status'], { title: string; subtitle: string }> = {
  pending: {
    title: 'Cadastro recebido!',
    subtitle:
      'A equipe do Simbora Car vai te chamar para uma conversa. Leve CNH, documento do veículo e comprovante de residência.',
  },
  suspended: {
    title: 'Cadastro suspenso',
    subtitle: 'Fale com a equipe do Simbora Car para entender o que aconteceu.',
  },
  blocked: {
    title: 'Cadastro bloqueado',
    subtitle: 'Fale com a equipe do Simbora Car para mais informações.',
  },
};

export function DriverPendingScreen({ status, onRefresh, onBack }: Props) {
  const { title, subtitle } = messages[status];
  const [checking, setChecking] = useState(false);
  const [notYet, setNotYet] = useState(false);

  // Se a aprovação já saiu, o DriverFlow troca de tela e este componente
  // some; se continuar aqui, é porque ainda não foi aprovado.
  async function check() {
    setChecking(true);
    setNotYet(false);
    await onRefresh();
    setChecking(false);
    setNotYet(true);
  }

  return (
    <Screen
      title={title}
      subtitle={subtitle}
      error={notYet ? 'Ainda não foi aprovado. Aguarde o contato da equipe do Simbora Car.' : null}
    >
      <BigButton label="Já fui aprovado" onPress={check} loading={checking} />
      <BigButton label="Voltar para passageiro" onPress={onBack} variant="link" />
    </Screen>
  );
}
