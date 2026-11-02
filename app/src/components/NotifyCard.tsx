import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { askNotifyPermission, inviteIsPostponed, notifyPermission, postponeNotifyInvite } from '../lib/notify';
import { cardSurface, colors, fontSize } from '../theme';
import { BigButton } from './BigButton';

// Convite para ligar os avisos do aparelho (pedido novo, motorista a caminho, mensalidade).
// Só aparece quando o navegador deixa pedir e a pessoa ainda não respondeu.
export function NotifyCard({ message }: { message: string }) {
  const [permission, setPermission] = useState(notifyPermission());
  const [postponed, setPostponed] = useState(true);

  useEffect(() => {
    inviteIsPostponed()
      .then(setPostponed)
      .catch(() => setPostponed(false));
  }, []);

  if (permission !== 'default' || postponed) return null;

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Ionicons
          name="notifications"
          size={28}
          color={colors.primary}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <Text accessibilityRole="header" style={styles.title}>
          Ligar os avisos
        </Text>
      </View>
      <Text style={styles.text}>{message}</Text>
      <BigButton label="Ligar avisos" icon="notifications" onPress={async () => setPermission(await askNotifyPermission())} />
      <BigButton
        label="Agora não"
        variant="link"
        onPress={() => {
          setPostponed(true);
          postponeNotifyInvite();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { ...cardSurface, backgroundColor: colors.surfaceTint, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { flex: 1, fontSize: fontSize.body, fontWeight: '700', color: colors.text },
  text: { fontSize: fontSize.body - 2, color: colors.text, lineHeight: 26 },
});
