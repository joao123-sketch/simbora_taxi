import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { rateRide } from '../lib/rides';
import { colors, fontSize, cardSurface } from '../theme';
import { BigButton } from './BigButton';
import { StarRating } from './StarRating';

type Props = {
  rideId: number;
  question: string;
  // Chamado quando a pessoa avaliou ou pulou.
  onDone: () => void;
};

export function RatingPrompt({ rideId, question, onDone }: Props) {
  const [sending, setSending] = useState(false);
  const [stars, setStars] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function rate(value: number) {
    setStars(value);
    setSending(true);
    setError(null);
    try {
      await rateRide(rideId, value);
      onDone();
    } catch (e) {
      setSending(false);
      setStars(null);
      setError((e as { message?: string }).message || 'Não conseguimos enviar a nota.');
    }
  }

  return (
    <View style={styles.box}>
      <Text style={styles.question}>{question}</Text>
      <StarRating value={stars} onRate={rate} disabled={sending} />
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <BigButton label="Pular" onPress={onDone} disabled={sending} variant="link" />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: 8,
    ...cardSurface,
    alignItems: 'stretch',
  },
  question: {
    fontSize: fontSize.body + 2,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  error: {
    fontSize: fontSize.body - 2,
    fontWeight: '700',
    color: colors.primaryDark,
    textAlign: 'center',
  },
});
