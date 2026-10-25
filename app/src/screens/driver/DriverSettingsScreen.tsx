import { BigButton } from '../../components/BigButton';
import { Screen } from '../../components/Screen';

type Props = {
  onOpenPayments: () => void;
  onOpenHistory: () => void;
  onOpenFee: () => void;
  onBack: () => void;
};

export function DriverSettingsScreen({ onOpenPayments, onOpenHistory, onOpenFee, onBack }: Props) {
  return (
    <Screen title="Configurações" footer={<BigButton label="Voltar" onPress={onBack} variant="link" />}>
      <BigButton label="Modos de pagamento aceitos" icon="wallet" onPress={onOpenPayments} variant="secondary" />
      <BigButton label="Minhas corridas" icon="time" onPress={onOpenHistory} variant="secondary" />
      <BigButton label="Minha mensalidade" icon="card" onPress={onOpenFee} variant="secondary" />
    </Screen>
  );
}
