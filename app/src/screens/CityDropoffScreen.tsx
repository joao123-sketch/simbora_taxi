import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { BigButton } from '../components/BigButton';
import { BigInput } from '../components/BigInput';
import { ChoiceCard } from '../components/ChoiceCard';
import { Screen } from '../components/Screen';
import type { City, Place } from '../lib/rides';
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
  const place = where.trim();
  const valid = !elsewhere || place.length >= 3;

  function confirm() {
    onConfirm({
      lat: city.lat,
      lng: city.lng,
      cityId: city.id,
      address: city.name,
      dropoffPlace: elsewhere ? place : undefined,
    });
  }

  return (
    <Screen title={`Onde deixar em ${city.name}?`}>
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

      <BigButton label="Continuar" onPress={confirm} disabled={!valid} />
      <BigButton label="Voltar" onPress={onBack} variant="link" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hint: {
    fontSize: fontSize.body - 2,
    color: colors.textMuted,
  },
});
