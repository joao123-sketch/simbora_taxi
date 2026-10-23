import { useState } from 'react';

import { BigButton } from '../../components/BigButton';
import { CheckCard } from '../../components/CheckCard';
import { Screen } from '../../components/Screen';
import { setAcceptedPayments } from '../../lib/drivers';
import { PAYMENT_ORDER, receiveLabel, type PaymentMethod } from '../../lib/rides';

type Props = {
  accepted: PaymentMethod[];
  onSaved: (methods: PaymentMethod[]) => void;
  onBack: () => void;
};

const hints: Partial<Record<PaymentMethod, string>> = {
  card: 'Marque só quando tiver maquininha. O passageiro paga 5% a mais no cartão.',
};

export function PaymentSettingsScreen({ accepted, onSaved, onBack }: Props) {
  const [selected, setSelected] = useState<PaymentMethod[]>(accepted);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(method: PaymentMethod) {
    setSelected((current) => (current.includes(method) ? current.filter((m) => m !== method) : [...current, method]));
  }

  async function save() {
    setLoading(true);
    setError(null);
    try {
      await setAcceptedPayments(selected);
      onSaved(PAYMENT_ORDER.filter((m) => selected.includes(m)));
    } catch (e) {
      setLoading(false);
      setError((e as { message?: string }).message || 'Não conseguimos salvar. Tente de novo.');
    }
  }

  return (
    <Screen
      title="Como eu recebo"
      subtitle="Marque as formas que você aceita. O passageiro só vê os pedidos que combinam com elas."
      error={error}
    >
      {PAYMENT_ORDER.map((method) => (
        <CheckCard
          key={method}
          label={receiveLabel[method]}
          hint={hints[method]}
          checked={selected.includes(method)}
          onPress={() => toggle(method)}
        />
      ))}
      <BigButton label="Salvar" onPress={save} disabled={selected.length === 0} loading={loading} />
      <BigButton label="Voltar" onPress={onBack} variant="link" />
    </Screen>
  );
}
