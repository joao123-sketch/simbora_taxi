import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BigButton } from '../../components/BigButton';
import { BigInput } from '../../components/BigInput';
import { ChoiceCard } from '../../components/ChoiceCard';
import { Screen } from '../../components/Screen';
import { isValidPlate, MIN_VEHICLE_YEAR, normalizePlate, registerDriver } from '../../lib/drivers';
import { vehicleLabel, type VehicleType } from '../../lib/rides';
import { colors, fontSize } from '../../theme';

type Props = {
  userId: string;
  cityId: number;
  onRegistered: () => void;
  onBack: () => void;
};

const VEHICLES: VehicleType[] = ['car', 'moto'];

export function DriverSignupScreen({ userId, cityId, onRegistered, onBack }: Props) {
  const [vehicleType, setVehicleType] = useState<VehicleType>('car');
  const [model, setModel] = useState('');
  const [color, setColor] = useState('');
  const [plate, setPlate] = useState('');
  const [year, setYear] = useState('');
  const [pixKey, setPixKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const yearNumber = Number(year);
  const currentYear = new Date().getFullYear() + 1;
  const yearOk = year.length === 4 && yearNumber >= MIN_VEHICLE_YEAR && yearNumber <= currentYear;
  const valid = model.trim().length >= 2 && color.trim().length >= 3 && isValidPlate(plate) && yearOk;

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      await registerDriver(userId, {
        city_id: cityId,
        vehicle_type: vehicleType,
        vehicle_model: model.trim(),
        vehicle_color: color.trim(),
        vehicle_plate: normalizePlate(plate),
        vehicle_year: yearNumber,
        pix_key: pixKey.trim() || null,
      });
      onRegistered();
    } catch (e) {
      setLoading(false);
      const duplicated = (e as { code?: string }).code === '23505';
      setError(duplicated ? 'Essa placa já está cadastrada.' : 'Não conseguimos enviar. Confira os dados.');
    }
  }

  return (
    <Screen
      title="Quero dirigir"
      subtitle="Preencha os dados do veículo. Depois a equipe do Simbora marca uma conversa com você."
      error={error}
    >
      <Text style={styles.label}>Você vai dirigir</Text>
      <View style={styles.row}>
        {VEHICLES.map((type) => (
          <View key={type} style={styles.rowItem}>
            <ChoiceCard
              label={vehicleLabel[type]}
              selected={vehicleType === type}
              onPress={() => setVehicleType(type)}
            />
          </View>
        ))}
      </View>

      <Text style={styles.label}>Modelo</Text>
      <BigInput accessibilityLabel="Modelo" placeholder="Ex.: Onix, CG 160" value={model} onChangeText={setModel} />

      <Text style={styles.label}>Cor</Text>
      <BigInput accessibilityLabel="Cor" placeholder="Ex.: Prata" value={color} onChangeText={setColor} />

      <Text style={styles.label}>Placa</Text>
      <BigInput
        accessibilityLabel="Placa"
        placeholder="ABC1D23"
        autoCapitalize="characters"
        value={plate}
        onChangeText={(text) => setPlate(normalizePlate(text))}
      />

      <Text style={styles.label}>Ano (a partir de {MIN_VEHICLE_YEAR})</Text>
      <BigInput
        accessibilityLabel="Ano do veículo"
        placeholder="2018"
        keyboardType="number-pad"
        maxLength={4}
        value={year}
        onChangeText={(text) => setYear(text.replace(/\D/g, ''))}
      />
      {year.length === 4 && !yearOk ? (
        <Text style={styles.warning}>O Simbora aceita veículos de {MIN_VEHICLE_YEAR} em diante.</Text>
      ) : null}

      <Text style={styles.label}>Chave Pix (opcional)</Text>
      <BigInput
        accessibilityLabel="Chave Pix"
        placeholder="CPF, telefone ou e-mail"
        autoCapitalize="none"
        value={pixKey}
        onChangeText={setPixKey}
      />

      <BigButton label="Enviar cadastro" onPress={submit} disabled={!valid} loading={loading} />
      <BigButton label="Voltar" onPress={onBack} variant="link" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.text,
    marginBottom: -8,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  rowItem: {
    flex: 1,
  },
  warning: {
    fontSize: fontSize.body - 2,
    color: colors.primaryDark,
  },
});
