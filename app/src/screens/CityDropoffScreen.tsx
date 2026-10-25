import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { BigButton } from '../components/BigButton';
import { BigInput } from '../components/BigInput';
import { ChoiceCard } from '../components/ChoiceCard';
import { Screen } from '../components/Screen';
import { SchedulePicker } from '../components/SchedulePicker';
import { WAIT_OPTIONS, formatWait, type City, type Place } from '../lib/rides';
import { colors, fontSize } from '../theme';

type Props = {
  city: City;
  onConfirm: (place: Place) => void;
  onBack: () => void;
};

// Em outra cidade o preço é fechado até o ponto combinado. Se o passageiro quer
// ser deixado em outro lugar (um sítio, um distrito), ele escreve onde, o
// motorista vê o pedido antes de aceitar e decide se topa.
export function CityDropoffScreen({ city, onConfirm, onBack }: Props) {
  const [elsewhere, setElsewhere] = useState(false);
  const [where, setWhere] = useState('');
  const [roundTrip, setRoundTrip] = useState(false);
  const [waitMinutes, setWaitMinutes] = useState<number>(60);
  // null = agora; senão o instante marcado. `scheduleOk` diz se o horário vale.
  const [scheduledFor, setScheduledFor] = useState<string | null>(null);
  const [scheduleOk, setScheduleOk] = useState(true);
  const place = where.trim();
  const valid = (!elsewhere || place.length >= 3) && scheduleOk;

  function confirm() {
    onConfirm({
      lat: city.lat,
      lng: city.lng,
      cityId: city.id,
      address: city.name,
      dropoffPlace: elsewhere ? place : undefined,
      roundTrip,
      waitMinutes: roundTrip ? waitMinutes : 0,
      scheduledFor: scheduledFor ?? undefined,
    });
  }

  return (
    <Screen
      title={`Onde deixar em ${city.name}?`}
      footer={
        <>
          <BigButton label="Continuar" onPress={confirm} disabled={!valid} />
          <BigButton label="Voltar" onPress={onBack} variant="link" />
        </>
      }
    >
      <ChoiceCard label={`No centro de ${city.name}`} selected={!elsewhere} onPress={() => setElsewhere(false)} />
      <ChoiceCard label="Em outro lugar" selected={elsewhere} onPress={() => setElsewhere(true)} />

      {elsewhere ? (
        <>
          <BigInput
            accessibilityLabel="Onde o motorista deve deixar você"
            placeholder="Ex.: Sítio Boa Vista, estrada da serra"
            value={where}
            onChangeText={setWhere}
          />
          <Text style={styles.hint}>
            O motorista vê esse lugar antes de aceitar e decide se topa. Ele pode propor um acréscimo no valor, e
            você aceita ou recusa.
          </Text>
        </>
      ) : null}

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
            O preço é a ida e a volta mais o tempo de espera. O motorista pode propor outro valor, e você aceita ou
            recusa.
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
