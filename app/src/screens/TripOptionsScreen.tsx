import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { BigButton } from '../components/BigButton';
import { ChoiceCard } from '../components/ChoiceCard';
import { Screen } from '../components/Screen';
import { SchedulePicker } from '../components/SchedulePicker';
import { WAIT_OPTIONS, formatWait, type Place } from '../lib/rides';
import { colors, fontSize } from '../theme';

type Props = {
  // O destino já escolhido na busca de "Em outra cidade".
  destination: Place;
  onConfirm: (place: Place) => void;
  onBack: () => void;
};

// Em outra cidade o preço vem da distância até o endereço. Aqui a pessoa diz se a viagem é só
// de ida ou ida e volta (com a espera) e quando quer ir; os motoristas aceitam o valor ou propõem outro.
export function TripOptionsScreen({ destination, onConfirm, onBack }: Props) {
  const [roundTrip, setRoundTrip] = useState(false);
  const [waitMinutes, setWaitMinutes] = useState<number>(60);
  // null = agora; senão o instante marcado. `scheduleOk` diz se o horário vale.
  const [scheduledFor, setScheduledFor] = useState<string | null>(null);
  const [scheduleOk, setScheduleOk] = useState(true);

  function confirm() {
    onConfirm({
      ...destination,
      roundTrip,
      waitMinutes: roundTrip ? waitMinutes : 0,
      scheduledFor: scheduledFor ?? undefined,
    });
  }

  return (
    <Screen
      title="Como será a viagem?"
      subtitle={destination.address}
      onBack={onBack}
      footer={<BigButton label="Continuar" onPress={confirm} disabled={!scheduleOk} />}
    >
      <Text style={styles.section}>A viagem é só de ida ou ida e volta?</Text>
      <ChoiceCard label="Só ida" selected={!roundTrip} onPress={() => setRoundTrip(false)} />
      <ChoiceCard label="Ida e volta" selected={roundTrip} onPress={() => setRoundTrip(true)} />

      {roundTrip ? (
        <>
          <Text style={styles.section}>Quanto tempo o motorista espera lá?</Text>
          {WAIT_OPTIONS.map((minutes) => (
            <ChoiceCard
              key={minutes}
              label={formatWait(minutes)}
              selected={waitMinutes === minutes}
              onPress={() => setWaitMinutes(minutes)}
            />
          ))}
          <Text style={styles.hint}>
            O preço é a ida e a volta mais o tempo de espera. O motorista pode aceitar o valor ou propor outro, e
            você escolhe.
          </Text>
        </>
      ) : null}

      <SchedulePicker
        onChange={(iso, ok) => {
          setScheduledFor(iso);
          setScheduleOk(ok);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: {
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.textMuted,
  },
  hint: {
    fontSize: fontSize.body - 2,
    color: colors.textMuted,
  },
});
