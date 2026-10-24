import { useEffect, useState } from 'react';
import { ActivityIndicator, Share, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { BigButton } from '../../components/BigButton';
import { Screen } from '../../components/Screen';
import { driverLink, driverShareMessage, fetchMyDriverCode } from '../../lib/favoriteDrivers';
import { colors, fontSize } from '../../theme';

type Props = {
  onBack: () => void;
};

// O QR e o código do motorista: o cliente que lê fica com ele nos favoritos.
export function MyQrScreen({ onBack }: Props) {
  const [code, setCode] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMyDriverCode()
      .then(setCode)
      .catch(() => setError('Sem conexão com o Simbora Car. Confira a internet.'));
  }, []);

  return (
    <Screen
      title="Meu QR"
      subtitle="Mostre este QR ou mande o código para os seus clientes. Quem ler fica com você na lista de motoristas favoritos e te chama primeiro."
      error={error}
    >
      {code === undefined && !error ? <ActivityIndicator size="large" color={colors.primary} /> : null}
      {code ? (
        <>
          <View style={styles.qrBox}>
            <QRCode value={driverLink(code)} size={240} />
          </View>
          <Text style={styles.code} accessibilityLabel={`Código ${code.split('').join(' ')}`}>
            {code}
          </Text>
          <BigButton label="Mandar pelo WhatsApp" onPress={() => Share.share({ message: driverShareMessage(code) })} />
        </>
      ) : null}
      <BigButton label="Voltar" onPress={onBack} variant="link" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  qrBox: {
    alignSelf: 'center',
    padding: 20,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: colors.text,
    backgroundColor: '#FFFFFF',
  },
  code: {
    fontSize: fontSize.title,
    fontWeight: '800',
    letterSpacing: 4,
    color: colors.text,
    textAlign: 'center',
  },
});
