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
      <BigButton label="Modos de pagamento aceitos" onPress={onOpenPayments} variant="secondary" />
      <BigButton label="Minhas corridas" onPress={onOpenHistory} variant="secondary" />
      <BigButton label="Minha mensalidade" onPress={onOpenFee} variant="secondary" />
    </Screen>
  );
}
