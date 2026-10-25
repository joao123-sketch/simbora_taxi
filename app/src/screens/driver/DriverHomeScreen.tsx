import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BigButton } from '../../components/BigButton';
import type { Coord } from '../../components/PinMap.types';
import { Screen } from '../../components/Screen';
import { distanceKm } from '../../lib/geo';
import {
  acceptRide,
  claimOpenRequests,
  declineRide,
  fetchMyProposals,
  fetchOpenRequests,
  proposeExtra,
  subscribeToProposals,
  subscribeToRides,
  withdrawProposal,
  type MyProposal,
  type Ride,
} from '../../lib/rides';
import { acceptScheduled, fetchOpenScheduled, scheduledToRide, type OpenScheduled } from '../../lib/scheduling';
import { colors, fontSize } from '../../theme';
import { OpenRequestCard } from './OpenRequestCard';

type Props = {
  online: boolean;
  position: Coord | null;
  locationDenied: boolean;
  onToggleOnline: () => Promise<void>;
  onAccepted: () => void;
  // Confere se o passageiro aceitou uma proposta e a corrida passou a ser deste motorista.
  onCheckActive: () => void;
  onOpenQr: () => void;
  onOpenScheduled: () => void;
  onOpenSettings: () => void;
  onOpenFee: () => void;
  // Aviso vermelho da mensalidade vencida, sempre no alto da tela.
  feeNotice: string | null;
  onExit: () => void;
};

// Cada motorista passa a ver o pedido alguns segundos depois do anterior da fila,
// então a consulta é frequente.
const POLL_MS = 5000;

export function DriverHomeScreen({
  online,
  position,
  locationDenied,
  onToggleOnline,
  onAccepted,
  onCheckActive,
  onOpenQr,
  onOpenScheduled,
  onOpenSettings,
  onOpenFee,
  feeNotice,
  onExit,
}: Props) {
  const [requests, setRequests] = useState<Ride[]>([]);
  // Viagens entre cidades marcadas para outro dia: aparecem aqui como um chamado comum.
  const [scheduledOpen, setScheduledOpen] = useState<OpenScheduled[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [proposals, setProposals] = useState<Record<number, MyProposal>>({});
  const [toggling, setToggling] = useState(false);
  const [accepting, setAccepting] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    // Entra na fila dos pedidos abertos (se acabou de ficar online) e só então lê a lista.
    claimOpenRequests()
      .catch(() => {})
      .then(() => fetchOpenRequests())
      .then(setRequests)
      .catch(() => {});
    fetchOpenScheduled()
      .then(setScheduledOpen)
      .catch(() => {});
    fetchMyProposals()
      .then((list) => setProposals(Object.fromEntries(list.map((p) => [p.ride_id, p]))))
      .catch(() => {});
    onCheckActive();
  }, [onCheckActive]);

  // Realtime avisa na hora; a consulta periódica cobre chamados que outro
  // motorista aceitou (que somem da visão deste sem gerar evento).
  useEffect(() => {
    if (!online) {
      setRequests([]);
      setScheduledOpen([]);
      return;
    }
    refresh();
    const unsubscribeRides = subscribeToRides('driver-requests', refresh);
    const unsubscribeProposals = subscribeToProposals('driver-proposals', refresh);
    const timer = setInterval(refresh, POLL_MS);
    return () => {
      unsubscribeRides();
      unsubscribeProposals();
      clearInterval(timer);
    };
  }, [online, refresh]);

  async function toggle() {
    setToggling(true);
    setError(null);
    try {
      await onToggleOnline();
    } catch (e) {
      setError((e as { message?: string }).message || 'Não conseguimos mudar seu status.');
    } finally {
      setToggling(false);
    }
  }

  async function accept(rideId: number, advance: number | null) {
    setAccepting(rideId);
    setError(null);
    try {
      await acceptRide(rideId, advance);
      onAccepted();
    } catch {
      setError('Outro motorista pegou essa corrida.');
      refresh();
    } finally {
      setAccepting(null);
    }
  }

  // Aceitar uma viagem agendada: ela não vira corrida agora, fica na lista de viagens agendadas.
  async function acceptScheduledTrip(rideId: number, advance: number | null) {
    setAccepting(rideId);
    setError(null);
    try {
      await acceptScheduled(rideId, advance ?? 0);
      setNotice('Viagem agendada aceita! Ela fica na sua lista de Viagens agendadas.');
    } catch (e) {
      setError((e as { message?: string }).message || 'Essa viagem não está mais livre.');
    } finally {
      setAccepting(null);
      refresh();
    }
  }

  async function propose(rideId: number, extra: number, advance: number | null) {
    setError(null);
    try {
      await proposeExtra(rideId, extra, advance);
      refresh();
    } catch (e) {
      setError((e as { message?: string }).message || 'Não conseguimos enviar a proposta.');
      throw e;
    }
  }

  async function decline(rideId: number) {
    setError(null);
    try {
      await declineRide(rideId);
    } catch {
      setError('Esse pedido não está mais disponível.');
    }
    refresh();
  }

  async function withdraw(rideId: number) {
    setError(null);
    try {
      await withdrawProposal(rideId);
      refresh();
    } catch {
      setError('Não conseguimos retirar a proposta.');
    }
  }

  // Pedido cuja proposta o passageiro recusou some da lista deste motorista.
  const visible = requests.filter((ride) => proposals[ride.id]?.status !== 'declined');
  const visibleScheduled = scheduledOpen.filter((s) => proposals[s.ride_id]?.status !== 'declined');

  return (
    <Screen
      title={online ? 'Você está online' : 'Você está offline'}
      subtitle={online ? 'Os chamados aparecem aqui.' : 'Fique online para receber chamados.'}
      error={error}
    >
      {notice ? (
        <Text accessibilityRole="alert" style={styles.notice}>
          {notice}
        </Text>
      ) : null}
      {feeNotice ? (
        <View style={styles.feeNotice}>
          <Text style={styles.feeNoticeText}>{feeNotice}</Text>
          <BigButton label="Pagar agora" onPress={onOpenFee} />
        </View>
      ) : null}
      {online && locationDenied ? (
        <Text style={styles.warning}>Libere a localização para os passageiros te acharem.</Text>
      ) : null}

      <BigButton label={online ? 'Ficar offline' : 'Ficar online'} onPress={toggle} loading={toggling} />

      {online && visible.length === 0 && visibleScheduled.length === 0 ? (
        <Text style={styles.empty}>Nenhum chamado agora.</Text>
      ) : null}

      {visible.map((ride) => (
        <OpenRequestCard
          key={ride.id}
          ride={ride}
          awayKm={position ? distanceKm(position, { lat: ride.origin_lat, lng: ride.origin_lng }) : null}
          proposal={proposals[ride.id]}
          accepting={accepting === ride.id}
          onAccept={(advance) => accept(ride.id, advance)}
          onPropose={(extra, advance) => propose(ride.id, extra, advance)}
          onWithdraw={() => withdraw(ride.id)}
          onDecline={() => decline(ride.id)}
        />
      ))}

      {visibleScheduled.map((s) => (
        <OpenRequestCard
          key={`agendada-${s.ride_id}`}
          ride={scheduledToRide(s)}
          awayKm={null}
          proposal={proposals[s.ride_id]}
          accepting={accepting === s.ride_id}
          onAccept={(advance) => acceptScheduledTrip(s.ride_id, advance)}
          onPropose={(extra, advance) => propose(s.ride_id, extra, advance)}
          onWithdraw={() => withdraw(s.ride_id)}
          onDecline={async () => {}}
        />
      ))}

      <BigButton label="Meu QR para clientes" icon="qr-code" onPress={onOpenQr} variant="secondary" />
      <BigButton label="Viagens agendadas" icon="calendar" onPress={onOpenScheduled} variant="secondary" />
      <BigButton label="Configurações" icon="settings-sharp" onPress={onOpenSettings} variant="secondary" />
      <BigButton label="Voltar ao início" icon="home" onPress={onExit} variant="secondary" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  notice: {
    fontSize: fontSize.body,
    fontWeight: '700',
    color: '#1B6E2D',
  },
  feeNotice: {
    gap: 8,
    padding: 14,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: colors.primary,
    backgroundColor: '#FDECEC',
  },
  feeNoticeText: {
    fontSize: fontSize.body + 2,
    fontWeight: '800',
    color: colors.primaryDark,
  },
  warning: {
    fontSize: fontSize.body - 2,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  empty: {
    fontSize: fontSize.body,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
