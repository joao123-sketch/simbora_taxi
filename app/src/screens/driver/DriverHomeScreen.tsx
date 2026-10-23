import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { BigButton } from '../../components/BigButton';
import type { Coord } from '../../components/PinMap.types';
import { Screen } from '../../components/Screen';
import { distanceKm } from '../../lib/geo';
import {
  acceptRide,
  fetchMyProposals,
  fetchOpenRequests,
  proposeExtra,
  subscribeToProposals,
  subscribeToRides,
  withdrawProposal,
  receiveLabel,
  type MyProposal,
  type PaymentMethod,
  type Ride,
} from '../../lib/rides';
import { colors, fontSize } from '../../theme';
import { OpenRequestCard } from './OpenRequestCard';

type Props = {
  online: boolean;
  acceptedPayments: PaymentMethod[];
  onOpenPayments: () => void;
  position: Coord | null;
  locationDenied: boolean;
  onToggleOnline: () => Promise<void>;
  onAccepted: () => void;
  // Confere se o passageiro aceitou uma proposta e a corrida passou a ser deste motorista.
  onCheckActive: () => void;
  onExit: () => void;
};

const POLL_MS = 10000;

export function DriverHomeScreen({
  online,
  acceptedPayments,
  onOpenPayments,
  position,
  locationDenied,
  onToggleOnline,
  onAccepted,
  onCheckActive,
  onExit,
}: Props) {
  const [requests, setRequests] = useState<Ride[]>([]);
  const [proposals, setProposals] = useState<Record<number, MyProposal>>({});
  const [toggling, setToggling] = useState(false);
  const [accepting, setAccepting] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    fetchOpenRequests()
      .then(setRequests)
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

  async function accept(rideId: number) {
    setAccepting(rideId);
    setError(null);
    try {
      await acceptRide(rideId);
      onAccepted();
    } catch {
      setError('Outro motorista pegou essa corrida.');
      refresh();
    } finally {
      setAccepting(null);
    }
  }

  async function propose(rideId: number, extra: number) {
    setError(null);
    try {
      await proposeExtra(rideId, extra);
      refresh();
    } catch (e) {
      setError((e as { message?: string }).message || 'Não conseguimos enviar a proposta.');
      throw e;
    }
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

  return (
    <Screen
      title={online ? 'Você está online' : 'Você está offline'}
      subtitle={online ? 'Os chamados aparecem aqui.' : 'Fique online para receber chamados.'}
      error={error}
    >
      {online && locationDenied ? (
        <Text style={styles.warning}>Libere a localização para os passageiros te acharem.</Text>
      ) : null}

      <BigButton label={online ? 'Ficar offline' : 'Ficar online'} onPress={toggle} loading={toggling} />

      <Text style={styles.receives}>Você recebe por: {acceptedPayments.map((m) => receiveLabel[m]).join(', ')}</Text>
      <BigButton label="Como eu recebo" onPress={onOpenPayments} variant="link" />

      {online && visible.length === 0 ? <Text style={styles.empty}>Nenhum chamado agora.</Text> : null}

      {visible.map((ride) => (
        <OpenRequestCard
          key={ride.id}
          ride={ride}
          awayKm={position ? distanceKm(position, { lat: ride.origin_lat, lng: ride.origin_lng }) : null}
          proposal={proposals[ride.id]}
          accepting={accepting === ride.id}
          onAccept={() => accept(ride.id)}
          onPropose={(extra) => propose(ride.id, extra)}
          onWithdraw={() => withdraw(ride.id)}
        />
      ))}

      <BigButton label="Voltar para passageiro" onPress={onExit} variant="link" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  warning: {
    fontSize: fontSize.body - 2,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  receives: {
    fontSize: fontSize.body - 2,
    color: colors.textMuted,
    textAlign: 'center',
  },
  empty: {
    fontSize: fontSize.body,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
