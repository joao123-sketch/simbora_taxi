import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BigButton } from '../components/BigButton';
import { BigInput } from '../components/BigInput';
import { Screen } from '../components/Screen';
import { currentPackageOptions, loadPackageOptions } from '../lib/delivery';
import type { DeliveryInfo, PackageSize } from '../lib/rides';
import { colors, fontSize } from '../theme';

type Props = {
  initial?: DeliveryInfo;
  onConfirm: (info: DeliveryInfo) => void;
  onBack: () => void;
};

// Tamanho do pacote (com exemplos e faixa de peso) e quem recebe.
export function DeliveryDetailsScreen({ initial, onConfirm, onBack }: Props) {
  const [size, setSize] = useState<PackageSize | null>(initial?.size ?? null);
  const [name, setName] = useState(initial?.recipientName ?? '');
  const [note, setNote] = useState(initial?.recipientNote ?? '');

  const [options, setOptions] = useState(currentPackageOptions());

  // A equipe pode ter mudado os textos no painel: busca a lista de agora.
  useEffect(() => {
    loadPackageOptions()
      .then(setOptions)
      .catch(() => {});
  }, []);

  const ready = size !== null && name.trim().length >= 2;

  return (
    <Screen
      title="Sobre o pacote"
      subtitle="Escolha o tamanho e diga quem vai receber."
      footer={<BigButton label="Voltar" onPress={onBack} variant="link" />}
    >
      {options.map((option) => (
        <Pressable
          key={option.size}
          accessibilityRole="radio"
          accessibilityState={{ selected: size === option.size }}
          accessibilityLabel={`${option.name}, ${option.weight}. ${option.example} ${option.vehicles}.`}
          onPress={() => setSize(option.size)}
          style={[styles.size, size === option.size && styles.sizeSelected]}
        >
          <View style={styles.sizeHead}>
            <View style={[styles.radio, size === option.size && styles.radioSelected]} />
            <Text style={styles.sizeName}>
              {option.name} · {option.weight}
            </Text>
          </View>
          <Text style={styles.sizeText}>{option.example}</Text>
          <Text style={styles.sizeVehicles}>{option.vehicles}</Text>
        </Pressable>
      ))}

      <Text style={styles.label}>Quem vai receber?</Text>
      <BigInput
        value={name}
        onChangeText={setName}
        placeholder="Nome de quem recebe"
        maxLength={80}
        accessibilityLabel="Nome de quem recebe"
      />
      <Text style={styles.label}>Recado para o motorista (se quiser)</Text>
      <BigInput
        value={note}
        onChangeText={setNote}
        placeholder="Ex.: portão azul, tocar a campainha"
        maxLength={200}
        accessibilityLabel="Recado para o motorista"
      />

      <BigButton
        label="Continuar"
        disabled={!ready}
        onPress={() => onConfirm({ size: size!, recipientName: name.trim(), recipientNote: note.trim() })}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  size: {
    gap: 4,
    padding: 16,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    backgroundColor: colors.background,
  },
  sizeSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceTint,
  },
  sizeHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.textMuted,
  },
  radioSelected: {
    borderWidth: 8,
    borderColor: colors.primary,
  },
  sizeName: {
    flex: 1,
    fontSize: fontSize.body + 2,
    fontWeight: '700',
    color: colors.text,
  },
  sizeText: {
    fontSize: fontSize.body,
    color: colors.text,
  },
  sizeVehicles: {
    fontSize: fontSize.body - 2,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  label: {
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.textMuted,
  },
});
