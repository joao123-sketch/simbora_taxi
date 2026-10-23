import { StyleSheet, Text, View } from 'react-native';

import { useDriverPosition } from '../hooks/useDriverPosition';
import { distanceKm, etaMinutes, formatKm } from '../lib/geo';
import type { Ride } from '../lib/rides';
import { colors, fontSize } from '../theme';
import { LiveMap } from './LiveMap';

// Mostra o carro andando no mapa e quanto falta, enquanto a corrida está em andamento.
export function TrackingCard({ ride }: { ride: Ride }) {
  const { position, stale } = useDriverPosition(ride.driver_id, true);
  const pickup = { lat: ride.origin_lat, lng: ride.origin_lng };
  const dropoff = { lat: ride.destination_lat, lng: ride.destination_lng };
  const target = ride.status === 'in_progress' ? dropoff : pickup;

  let text = 'Aguardando a localização do motorista...';
  if (position) {
    const km = distanceKm(position, target);
    if (ride.status === 'arrived') {
      text = 'O motorista chegou. Ele está esperando você.';
    } else if (km < 0.1) {
      text = ride.status === 'in_progress' ? 'Chegando ao destino' : 'O motorista está chegando';
    } else {
      const eta = `cerca de ${etaMinutes(km)} min`;
      text =
        ride.status === 'in_progress'
          ? `Faltam ${formatKm(km * 1.3)} · ${eta}`
          : `Motorista a ${formatKm(km * 1.3)} · chega em ${eta}`;
    }
  }

  return (
    <View style={styles.box}>
      <Text accessibilityRole="header" style={styles.eta}>
        {text}
      </Text>
      {stale ? <Text style={styles.stale}>Sem sinal recente do motorista.</Text> : null}
      {position ? <LiveMap target={target} driver={position} vehicle={ride.vehicle_type} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: 8,
  },
  eta: {
    fontSize: fontSize.body + 2,
    fontWeight: '700',
    color: colors.text,
  },
  stale: {
    fontSize: fontSize.body - 2,
    color: colors.primaryDark,
  },
});
