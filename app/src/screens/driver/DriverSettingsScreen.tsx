import { BigButton } from '../../components/BigButton';
import { Screen } from '../../components/Screen';

type Props = {
  onOpenPayments: () => void;
  onOpenHistory: () => void;
  onOpenFee: () => void;
  onOpenBlocked: () => void;
  onBack: () => void;
};

export function DriverSettingsScreen({ onOpenPayments, onOpenHistory, onOpenFee, onOpenBlocked, onBack }: Props) {
  return (
    <Screen title="Configurações" onBack={onBack}>
      <BigButton label="Modos de pagamento aceitos" icon="wallet" onPress={onOpenPayments} variant="secondary" />
      <BigButton label="Minhas corridas" icon="time" onPress={onOpenHistory} variant="secondary" />
      <BigButton label="Minha mensalidade" icon="card" onPress={onOpenFee} variant="secondary" />
      <BigButton label="Passageiros bloqueados" icon="ban" onPress={onOpenBlocked} variant="secondary" />
    </Screen>
  );
}
