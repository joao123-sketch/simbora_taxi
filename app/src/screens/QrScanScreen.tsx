import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BigButton } from '../components/BigButton';
import { Screen } from '../components/Screen';
import { colors, fontSize } from '../theme';

type Props = {
  onScanned: (text: string) => void;
  onBack: () => void;
};

// Lê o QR do motorista pela câmera. Entrega o texto uma vez só.
export function QrScanScreen({ onScanned, onBack }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const done = useRef(false);

  if (!permission) return null;

  if (!permission.granted) {
    return (
      <Screen title="Ler o QR do motorista" subtitle="Precisamos da câmera só para ler o QR. Nada é gravado.">
        <BigButton label="Liberar a câmera" onPress={requestPermission} />
        <BigButton label="Voltar" onPress={onBack} variant="link" />
      </Screen>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Text accessibilityRole="header" style={styles.title}>
        Aponte para o QR do motorista
      </Text>
      <View style={styles.cameraBox}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => {
            if (done.current) return;
            done.current = true;
            onScanned(data);
          }}
        />
      </View>
      <View style={styles.footer}>
        <BigButton label="Voltar" onPress={onBack} variant="link" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  title: {
    fontSize: fontSize.title - 4,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    padding: 20,
  },
  cameraBox: { flex: 1, marginHorizontal: 20, borderRadius: 24, overflow: 'hidden', backgroundColor: '#000' },
  footer: { padding: 20 },
});
