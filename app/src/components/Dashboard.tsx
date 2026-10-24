import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatMoney } from '../lib/rides';
import {
  PERIODS,
  fetchFinishedRides,
  fetchOnlineSeconds,
  formatDuration,
  formatKmTotal,
  periodStart,
  summarize,
  type FinishedRide,
  type Period,
} from '../lib/stats';
import { colors, fontSize } from '../theme';

type Props = {
  role: 'passenger' | 'driver';
  userId: string;
};

// Resumo no topo de "Minhas corridas": quanto ganhou (ou gastou), quantas
// corridas e quantos quilômetros, por hoje, 7 dias ou 30 dias.
export function Dashboard({ role, userId }: Props) {
  const [rides, setRides] = useState<FinishedRide[] | null>(null);
  const [period, setPeriod] = useState<Period>('week');
  // Só o motorista tem tempo online; nulo enquanto carrega ou se o banco não tem o dado.
  const [onlineSeconds, setOnlineSeconds] = useState<number | null>(null);

  useEffect(() => {
    fetchFinishedRides(role, userId)
      .then(setRides)
      .catch(() => setRides([]));
  }, [role, userId]);

  useEffect(() => {
    if (role !== 'driver') return;
    setOnlineSeconds(null);
    fetchOnlineSeconds(periodStart(period)).then(setOnlineSeconds);
  }, [role, period]);

  const summary = useMemo(() => (rides ? summarize(rides, period) : null), [rides, period]);

  if (!summary) return null;

  const moneyLabel = role === 'driver' ? 'Faturamento' : 'Gasto';

  return (
    <View style={styles.box}>
      <View style={styles.periods} accessibilityRole="radiogroup">
        {PERIODS.map((p) => (
          <Pressable
            key={p.key}
            accessibilityRole="radio"
            accessibilityState={{ selected: period === p.key }}
            onPress={() => setPeriod(p.key)}
            style={[styles.period, period === p.key && styles.periodSelected]}
          >
            <Text style={[styles.periodText, period === p.key && styles.periodTextSelected]}>{p.label}</Text>
          </Pressable>
        ))}
      </View>

      {summary.rides === 0 ? (
        <Text style={styles.empty}>Nenhuma corrida neste período.</Text>
      ) : (
        <>
          <View style={styles.cards}>
            <Stat label={moneyLabel} value={formatMoney(summary.money)} />
            <Stat label="Corridas" value={String(summary.rides)} />
            <Stat label="Quilômetros" value={formatKmTotal(summary.km)} />
            <Stat label="Média por corrida" value={formatMoney(summary.average)} />
            {role === 'driver' && onlineSeconds !== null ? (
              <Stat label="Tempo online" value={formatDuration(onlineSeconds)} />
            ) : null}
          </View>

          {role === 'passenger' && summary.topPlaces.length > 0 ? (
            <View style={styles.places}>
              <Text style={styles.placesTitle}>Lugares mais usados</Text>
              {summary.topPlaces.map((place) => (
                <Text key={`${place.lat},${place.lng}`} style={styles.placeLine}>
                  {place.title} · {place.trips} {place.trips === 1 ? 'viagem' : 'viagens'}
                </Text>
              ))}
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: 12,
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#FDECEC',
  },
  periods: {
    flexDirection: 'row',
    gap: 8,
  },
  period: {
    flex: 1,
    minHeight: 56,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  periodSelected: {
    backgroundColor: colors.primary,
  },
  periodText: {
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.primary,
  },
  periodTextSelected: {
    color: colors.onPrimary,
  },
  empty: {
    fontSize: fontSize.body,
    color: colors.textMuted,
  },
  cards: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  stat: {
    flexGrow: 1,
    flexBasis: '45%',
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.background,
  },
  statValue: {
    fontSize: fontSize.body + 4,
    fontWeight: '700',
    color: colors.text,
  },
  statLabel: {
    fontSize: fontSize.body - 2,
    color: colors.textMuted,
  },
  places: {
    gap: 2,
  },
  placesTitle: {
    fontSize: fontSize.body - 2,
    fontWeight: '700',
    color: colors.textMuted,
  },
  placeLine: {
    fontSize: fontSize.body,
    color: colors.text,
  },
});
