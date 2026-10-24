import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { BigButton } from '../components/BigButton';
import { PinMap } from '../components/PinMap';
import type { Coord } from '../components/PinMap.types';
import { PlaceSearch } from '../components/PlaceSearch';
import { distanceKm } from '../lib/geo';
import { reverseGeocode } from '../lib/geocode';
import type { City, Place } from '../lib/rides';
import { colors, fontSize } from '../theme';

type Props = {
  title: string;
  hint: string;
  buttonLabel: string;
  center: Coord;
  // Cidade onde a busca de endereço procura.
  city: City;
  // Só o destino tem busca; a origem já vem marcada no lugar da pessoa.
  withSearch?: boolean;
  fallbackAddress: string;
  onConfirm: (place: Place) => void;
  onBack: () => void;
};

// Se o alfinete andou mais que isso depois de escolher um resultado, o nome
// escolhido não vale mais para o ponto marcado.
const PICK_TOLERANCE_KM = 0.03;

// Escolher um ponto: o alfinete já vem no lugar certo (GPS) ou vai até o
// resultado da busca, e a pessoa ajusta arrastando o mapa antes de confirmar.
export function MapPickScreen({
  title,
  hint,
  buttonLabel,
  center,
  city,
  withSearch = false,
  fallbackAddress,
  onConfirm,
  onBack,
}: Props) {
  const insets = useSafeAreaInsets();
  // Para onde o mapa deve ir; muda com o GPS e com a busca.
  const [view, setView] = useState<Coord>(center);
  // Onde o alfinete está agora (muda ao arrastar o mapa).
  const [point, setPoint] = useState<Coord>(center);
  // Resultado da busca escolhido, enquanto o alfinete continua perto dele.
  const [picked, setPicked] = useState<(Coord & { title: string }) | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    setView(center);
  }, [center.lat, center.lng]);

  async function confirm() {
    setConfirming(true);
    try {
      const keepsPick = picked && distanceKm(point, picked) <= PICK_TOLERANCE_KM;
      // O motorista precisa saber onde é: nome escolhido na busca, senão a rua
      // do alfinete, senão um texto padrão.
      const address = keepsPick ? picked.title : ((await reverseGeocode(point)) ?? fallbackAddress);
      onConfirm({ ...point, address });
    } finally {
      setConfirming(false);
    }
  }

  return (
    // O mapa pode ficar atrás da barra de status; o painel fica acima dos
    // botões do Android e sobe junto com o teclado.
    <KeyboardAvoidingView style={styles.container} behavior="padding">
      <View style={styles.map}>
        <PinMap center={view} onCenterChange={setPoint} />
      </View>

      {withSearch ? (
        <View style={[styles.search, { top: insets.top + 8 }]}>
          <PlaceSearch
            city={city}
            onPick={(place) => {
              const target = { lat: place.lat, lng: place.lng };
              setView(target);
              setPoint(target);
              setPicked({ ...target, title: place.title });
            }}
          />
        </View>
      ) : null}

      <SafeAreaView edges={['bottom']} style={styles.panel}>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        <Text style={styles.hint}>{hint}</Text>
        <BigButton label={buttonLabel} onPress={confirm} loading={confirming} />
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
  search: {
    position: 'absolute',
    left: 12,
    right: 12,
    maxWidth: 480,
    alignSelf: 'center',
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
});
