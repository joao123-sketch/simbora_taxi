import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Avatar } from '../../components/Avatar';
import { BigButton } from '../../components/BigButton';
import { BigInput } from '../../components/BigInput';
import { Screen } from '../../components/Screen';
import { cleanName, fetchMyProfile, saveMyName } from '../../lib/profile';
import { colors, fontSize } from '../../theme';
import { PhotoScreen } from '../PhotoScreen';

type Props = {
  userId: string;
  onBack: () => void;
};

// Perfil do motorista: troca a foto e o nome. É a mesma conta de quando a pessoa pede corrida,
// então a foto e o nome mudam lá também.
export function DriverProfileScreen({ userId, onBack }: Props) {
  const [name, setName] = useState('');
  const [savedName, setSavedName] = useState('');
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [changingPhoto, setChangingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchMyProfile(userId)
      .then((p) => {
        if (!alive) return;
        setName(p.full_name ?? '');
        setSavedName(p.full_name ?? '');
        setPhotoPath(p.photo_path);
        setLoaded(true);
      })
      .catch(() => alive && setError('Sem conexão com o Simbora Car. Confira a internet.'));
    return () => {
      alive = false;
    };
  }, [userId]);

  if (changingPhoto) {
    return (
      <PhotoScreen
        userId={userId}
        currentPath={photoPath}
        subtitle="Tire uma selfie de rosto, com boa luz."
        onSaved={(path) => {
          setPhotoPath(path);
          setChangingPhoto(false);
          setMessage('Foto atualizada.');
        }}
        onBack={() => setChangingPhoto(false)}
      />
    );
  }

  const cleaned = cleanName(name);
  const changed = cleaned !== null && cleaned !== savedName;

  async function save() {
    if (!cleaned) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await saveMyName(userId, cleaned);
      setName(cleaned);
      setSavedName(cleaned);
      setMessage('Nome atualizado.');
    } catch {
      setError('Não conseguimos salvar o nome. Tente de novo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen title="Meu perfil" subtitle="O passageiro vê seu nome quando você aceita a corrida." error={error} onBack={onBack}>
      <View style={styles.center}>
        <Avatar path={photoPath} size={140} />
      </View>
      <BigButton label="Trocar foto" icon="camera" onPress={() => setChangingPhoto(true)} variant="secondary" disabled={!loaded} />
      <Text style={styles.label}>Nome</Text>
      <BigInput
        accessibilityLabel="Seu nome"
        placeholder="Seu nome"
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        maxLength={60}
        value={name}
        editable={loaded}
        onChangeText={(text) => {
          setName(text);
          setMessage(null);
        }}
        onSubmitEditing={() => changed && save()}
      />
      {message ? <Text style={styles.ok}>{message}</Text> : null}
      <BigButton label="Salvar nome" icon="checkmark" onPress={save} disabled={!changed} loading={saving} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
  },
  label: {
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.textMuted,
  },
  ok: {
    fontSize: fontSize.body,
    color: colors.textMuted,
  },
});
