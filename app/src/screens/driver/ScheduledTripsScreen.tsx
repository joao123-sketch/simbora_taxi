import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BigButton } from '../../components/BigButton';
import { Screen } from '../../components/Screen';
import {
  advanceLabel,
  fetchMyProposals,
  formatMoney,
  proposeExtra,
  subscribeToProposals,
  subscribeToRides,
  withdrawProposal,
  type MyProposal,
  type Ride,
} from '../../lib/rides';
import {
  acceptScheduled,
  expireScheduled,
  fetchMyScheduled,
  fetchOpenScheduled,
  formatScheduled,
  releaseScheduled,
  scheduledToRide,
  type OpenScheduled,
} from '../../lib/scheduling';
import { colors, fontSize, cardSurface } from '../../theme';
import { OpenRequestCard } from './OpenRequestCard';

type Props = {
  userId: string;
  onBack: () => void;
};

const POLL_MS = 15000;

// Viagens entre cidades marcadas para outro dia: as que o motorista já pegou
// e as que ainda estão livres. Aparece mesmo com o motorista offline.
export function ScheduledTripsScreen({ userId, onBack }: Props) {
  const [open, setOpen] = useState<OpenScheduled[] | null>(null);
  const [mine, setMine] = useState<Ride[]>([]);
  const [proposals, setProposals] = useState<Record<number, MyProposal>>({});
  const [accepting, setAccepting] = useState<number | null>(null);
  const [confirmRelease, setConfirmRelease] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      await expireScheduled();
      const [list, accepted, props] = await Promise.all([
        fetchOpenScheduled(),
        fetchMyScheduled('driver', userId),
        fetchMyProposals(),
      ]);
      setOpen(list);
      setMine(accepted);
      setProposals(Object.fromEntries(props.map((p) => [p.ride_id, p])));
    } catch {
      setError('Sem conexão com o Simbora Car. Confira a internet.');
    }
  }, [userId]);

  useEffect(() => {
    load();
    const unsubscribeRides = subscribeToRides('driver-scheduled', load);
    const unsubscribeProposals = subscribeToProposals('driver-scheduled-proposals', load);
    const timer = setInterval(load, POLL_MS);
    return () => {
      unsubscribeRides();
      unsubscribeProposals();
      clearInterval(timer);
    };
  }, [load]);

  async function accept(rideId: number, advance: number | null) {
    setAccepting(rideId);
    setError(null);
    try {
      await acceptScheduled(rideId, advance ?? 0);
      await load();
    } catch (e) {
      setError((e as { message?: string }).message || 'Essa viagem não está mais livre.');
      await load();
    } finally {
      setAccepting(null);
    }
  }

  async function release(rideId: number) {
    setError(null);
    try {
      await releaseScheduled(rideId);
      setConfirmRelease(null);
      await load();
    } catch (e) {
      setError((e as { message?: string }).message || 'Não conseguimos desistir da viagem.');
    }
  }

  const visible = (open ?? []).filter((s) => proposals[s.ride_id]?.status !== 'declined');

  return (
    <Screen
      title="Viagens agendadas"
      subtitle="Viagens entre cidades marcadas para outro dia. Aceite uma e ela fica na sua agenda e na do passageiro."
      error={error}
      footer={<BigButton label="Voltar" onPress={onBack} variant="link" />}
    >
      <Text style={styles.section}>Minhas viagens agendadas</Text>
      {mine.length === 0 ? <Text style={styles.empty}>Nenhuma por enquanto.</Text> : null}
      {mine.map((ride) => (
        <View key={ride.id} style={styles.card}>
          <Text style={styles.when}>{formatScheduled(ride.scheduled_for)}</Text>
          <Text style={styles.line}>Buscar: {ride.origin_address}</Text>
          <Text style={styles.line}>Levar: {ride.destination_address}</Text>
          <Text style={styles.price}>
            {formatMoney(ride.estimated_price)}
            {ride.advance_percent !== null && ride.advance_percent !== undefined ? ` · ${advanceLabel(ride.advance_percent)}` : ''}
          </Text>
          {confirmRelease === ride.id ? (
            <>
              <Text style={styles.warning}>A viagem volta para a lista e o passageiro é avisado. Confirma?</Text>
              <BigButton label="Sim, desistir" onPress={() => release(ride.id)} />
              <BigButton label="Não" onPress={() => setConfirmRelease(null)} variant="link" />
            </>
          ) : (
            <BigButton label="Desistir da viagem" onPress={() => setConfirmRelease(ride.id)} variant="link" />
          )}
        </View>
      ))}

      <Text style={styles.section}>Livres para pegar</Text>
      {open === null && !error ? <Text style={styles.empty}>Carregando...</Text> : null}
      {open?.length === 0 ? <Text style={styles.empty}>Nenhuma viagem agendada livre agora.</Text> : null}
      {visible.map((s) => (
        <View key={s.ride_id} style={styles.openBox}>
          {s.conflict ? (
            <Text style={styles.warning}>Você já tem outra viagem agendada perto desse horário.</Text>
          ) : null}
          <OpenRequestCard
            ride={scheduledToRide(s)}
            awayKm={null}
            proposal={proposals[s.ride_id]}
            accepting={accepting === s.ride_id}
            onAccept={(advance) => accept(s.ride_id, advance)}
            onPropose={async (extra, advance) => {
              setError(null);
              try {
                await proposeExtra(s.ride_id, extra, advance);
                await load();
              } catch (e) {
                setError((e as { message?: string }).message || 'Não conseguimos enviar a proposta.');
              }
            }}
            onWithdraw={async () => {
              await withdrawProposal(s.ride_id).catch(() => {});
              await load();
            }}
            onDecline={async () => {}}
          />
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: fontSize.body + 2, fontWeight: '800', color: colors.text, marginTop: 4 },
  empty: { fontSize: fontSize.body - 2, color: colors.textMuted },
  card: {
    gap: 4,
    ...cardSurface,
  },
  openBox: { gap: 6 },
  when: { fontSize: fontSize.body + 4, fontWeight: '800', color: colors.text },
  line: { fontSize: fontSize.body, color: colors.text },
  price: { fontSize: fontSize.body + 2, fontWeight: '700', color: colors.text },
  warning: { fontSize: fontSize.body - 2, fontWeight: '700', color: colors.primaryDark },
});
