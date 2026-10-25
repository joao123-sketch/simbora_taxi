import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ChoiceCard } from './ChoiceCard';
import { dayLabel, formatScheduled, instantFor, scheduleError } from '../lib/scheduling';
import { colors, fontSize, touchTarget } from '../theme';

type Props = {
  // Chamado a cada mudança: instante escolhido (null = agora) e se o horário vale.
  onChange: (iso: string | null, valid: boolean) => void;
};

const DAYS = [0, 1, 2, 3, 4, 5, 6, 7];
const MINUTES = [0, 15, 30, 45];

function Stepper({
  label,
  value,
  onMinus,
  onPlus,
}: {
  label: string;
  value: string;
  onMinus: () => void;
  onPlus: () => void;
}) {
  return (
    <View style={styles.stepper}>
      <Text style={styles.stepLabel}>{label}</Text>
      <View style={styles.stepRow}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Menos ${label}`} onPress={onMinus} style={styles.stepButton}>
          <Text style={styles.stepButtonText}>−</Text>
        </Pressable>
        <Text style={styles.stepValue}>{value}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`Mais ${label}`} onPress={onPlus} style={styles.stepButton}>
          <Text style={styles.stepButtonText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

// "Quando?": agora, ou um dia (hoje até daqui a 7 dias) e um horário (de 15 em 15 minutos).
export function SchedulePicker({ onChange }: Props) {
  const [later, setLater] = useState(false);
  const [day, setDay] = useState(1);
  const [hour, setHour] = useState(8);
  const [minuteIndex, setMinuteIndex] = useState(0);

  const at = instantFor(day, hour, MINUTES[minuteIndex]);
  const error = later ? scheduleError(at) : null;

  useEffect(() => {
    if (!later) onChange(null, true);
    else onChange(at.toISOString(), scheduleError(at) === null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [later, day, hour, minuteIndex]);

  function changeMinute(delta: number) {
    const next = minuteIndex + delta;
    if (next < 0) {
      setMinuteIndex(MINUTES.length - 1);
      setHour((h) => (h + 23) % 24);
    } else if (next >= MINUTES.length) {
      setMinuteIndex(0);
      setHour((h) => (h + 1) % 24);
    } else {
      setMinuteIndex(next);
    }
  }

  return (
    <>
      <Text style={styles.section}>Quando você quer ir?</Text>
      <ChoiceCard label="Agora" selected={!later} onPress={() => setLater(false)} />
      <ChoiceCard label="Agendar dia e horário" selected={later} onPress={() => setLater(true)} />

      {later ? (
        <>
          <Text style={styles.section}>Dia</Text>
          <View style={styles.days}>
            {DAYS.map((d) => (
              <Pressable
                key={d}
                accessibilityRole="radio"
                accessibilityState={{ selected: day === d }}
                onPress={() => setDay(d)}
                style={[styles.day, day === d && styles.daySelected]}
              >
                <Text style={[styles.dayText, day === d && styles.dayTextSelected]}>{dayLabel(d)}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.section}>Horário</Text>
          <View style={styles.time}>
            <Stepper
              label="Hora"
              value={String(hour).padStart(2, '0')}
              onMinus={() => setHour((h) => (h + 23) % 24)}
              onPlus={() => setHour((h) => (h + 1) % 24)}
            />
            <Stepper
              label="Minutos"
              value={String(MINUTES[minuteIndex]).padStart(2, '0')}
              onMinus={() => changeMinute(-1)}
              onPlus={() => changeMinute(1)}
            />
          </View>

          <Text style={error ? styles.error : styles.summary}>
            {error ?? `Viagem marcada para ${formatScheduled(at.toISOString())}.`}
          </Text>
          <Text style={styles.hint}>
            Dá para agendar de 1 hora a 7 dias à frente. Os motoristas veem a viagem e quem aceitar fica com ela
            marcada. Você pode cancelar antes de a viagem começar.
          </Text>
        </>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: fontSize.body, fontWeight: '700', color: colors.textMuted },
  days: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  day: {
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#CCCCCC',
    backgroundColor: colors.background,
  },
  daySelected: { borderColor: colors.primary, backgroundColor: '#FDECEC' },
  dayText: { fontSize: fontSize.body, fontWeight: '700', color: colors.text },
  dayTextSelected: { color: colors.primaryDark },
  time: { gap: 14 },
  stepper: { gap: 6 },
  stepLabel: { fontSize: fontSize.body - 2, color: colors.textMuted },
  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  stepButton: {
    width: touchTarget - 12,
    height: touchTarget - 12,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepButtonText: { fontSize: 32, fontWeight: '700', color: colors.primary },
  stepValue: { fontSize: 32, fontWeight: '800', color: colors.text },
  summary: { fontSize: fontSize.body, fontWeight: '700', color: colors.text },
  error: { fontSize: fontSize.body, fontWeight: '700', color: colors.primaryDark },
  hint: { fontSize: fontSize.body - 2, color: colors.textMuted },
});
