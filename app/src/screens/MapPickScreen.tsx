import { useState } from 'react';
import { KeyboardAvoidingView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BigButton } from '../components/BigButton';
import { BigInput } from '../components/BigInput';
import { PinMap } from '../components/PinMap';
import type { Coord } from '../components/PinMap.types';
import type { Place } from '../lib/rides';
import { colors, fontSize } from '../theme';

type Props = {
  title: string;
  hint: string;
  buttonLabel: string;
  center: Coord;
  fallbackAddress: string;
  onConfirm: (place: Place) => void;
  onBack: () => void;
};

// Escolher um ponto arrastando o mapa. Sem busca de endereço por enquanto:
// a referência escrita ajuda o motorista a achar o lugar.
export function MapPickScreen({ title, hint, buttonLabel, center, fallbackAddress, onConfirm, onBack }: Props) {
  const [point, setPoint] = useState<Coord>(center);
  const [reference, setReference] = useState('');

  return (
    // O mapa pode ficar atrás da barra de status; o painel fica acima dos
    // botões do Android e sobe junto com o teclado.
    <KeyboardAvoidingView style={styles.container} behavior="padding">
      <View style={styles.map}>
        <PinMap center={center} onCenterChange={setPoint} />
      </View>
      <SafeAreaView edges={['bottom']} style={styles.panel}>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        <Text style={styles.hint}>{hint}</Text>
        <BigInput
          accessibilityLabel="Ponto de referência"
          placeholder="Referência (ex.: perto da praça)"
          value={reference}
          onChangeText={setReference}
          style={styles.input}
        />
        <BigButton
          label={buttonLabel}
          onPress={() => onConfirm({ ...point, address: reference.trim() || fallbackAddress })}
        />
        <BigButton label="Voltar" onPress={onBack} variant="link" />
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  map: {
    flex: 1,
  },
  panel: {
    padding: 20,
    gap: 12,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  title: {
    fontSize: fontSize.title - 4,
    fontWeight: '700',
    color: colors.text,
  },
  hint: {
    fontSize: fontSize.body - 2,
    color: colors.textMuted,
  },
  input: {
    fontSize: fontSize.body,
  },
});
