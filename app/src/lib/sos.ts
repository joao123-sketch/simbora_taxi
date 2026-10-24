import * as Location from 'expo-location';
import { Linking } from 'react-native';

import type { Ride } from './rides';

export type SosRole = 'passenger' | 'driver';

// Número do WhatsApp do plantão (a equipe). Fica em configuração, não no
// código: EXPO_PUBLIC_SOS_WHATSAPP no .env.local (ex.: 5588999999999). Quando
// o painel existir, este número passa a vir do banco, para a equipe trocar sem
// publicar o app de novo.
export function sosNumber(): string | null {
  const digits = (process.env.EXPO_PUBLIC_SOS_WHATSAPP ?? '').replace(/\D/g, '');
  if (!digits) return null;
  // Sem o código do país, é um número brasileiro.
  return digits.length <= 11 ? `55${digits}` : digits;
}

// Onde a pessoa está agora. Se o GPS não responder, usa o local de partida da
// corrida e avisa que a posição é aproximada.
async function currentPosition(ride: Ride): Promise<{ lat: number; lng: number; approximate: boolean }> {
  try {
    const { granted } = await Location.getForegroundPermissionsAsync();
    if (granted) {
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      return { lat: position.coords.latitude, lng: position.coords.longitude, approximate: false };
    }
  } catch {
    // Cai no local de partida.
  }
  return { lat: ride.origin_lat, lng: ride.origin_lng, approximate: true };
}

function sosMessage(ride: Ride, role: SosRole, where: { lat: number; lng: number; approximate: boolean }): string {
  const who = role === 'passenger' ? ride.passenger_name : ride.driver_name;
  const vehicle = [ride.vehicle_model, ride.vehicle_color].filter(Boolean).join(' ');
  const lines = [
    'SOS - Simbora Car',
    `Corrida nº ${ride.id}`,
    `Pediu ajuda: ${role === 'passenger' ? 'passageiro' : 'motorista'}${who ? ` (${who})` : ''}`,
    `Passageiro: ${ride.passenger_name ?? 'não informado'}`,
    `Motorista: ${ride.driver_name ?? 'não informado'}${vehicle ? `, ${vehicle}` : ''}${
      ride.vehicle_plate ? `, placa ${ride.vehicle_plate}` : ''
    }`,
    `De: ${ride.origin_address}`,
    `Para: ${ride.destination_address}`,
    `${where.approximate ? 'Local de partida (GPS indisponível)' : 'Local agora'}: https://www.google.com/maps?q=${where.lat},${where.lng}`,
  ];
  return lines.join('\n');
}

// Abre o WhatsApp do plantão com a mensagem pronta. O WhatsApp não deixa o app
// enviar sozinho: a pessoa só precisa tocar em enviar.
export async function openSosWhatsApp(ride: Ride, role: SosRole): Promise<void> {
  const number = sosNumber();
  if (!number) throw new Error('Número de ajuda não configurado');
  const where = await currentPosition(ride);
  const text = encodeURIComponent(sosMessage(ride, role, where));
  await Linking.openURL(`https://wa.me/${number}?text=${text}`);
}
