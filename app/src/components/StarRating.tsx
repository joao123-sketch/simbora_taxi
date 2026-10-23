import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme';

type Props = {
  value?: number | null;
  onRate?: (stars: number) => void;
  disabled?: boolean;
  size?: number;
};

const STAR_NAMES = ['1 estrela', '2 estrelas', '3 estrelas', '4 estrelas', '5 estrelas'];

// De 1 a 5 estrelas grandes. Sem onRate, só mostra a nota.
export function StarRating({ value, onRate, disabled, size = 52 }: Props) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {STAR_NAMES.map((name, index) => {
        const stars = index + 1;
        const filled = (value ?? 0) >= stars;
        const glyph = (
          <Text style={[styles.star, { fontSize: size * 0.8 }, filled ? styles.filled : styles.empty]}>
            {filled ? '★' : '☆'}
          </Text>
        );
        if (!onRate) {
          return (
            <View key={name} style={{ width: size, height: size }} accessible={false}>
              {glyph}
            </View>
          );
        }
        return (
          <Pressable
            key={name}
            accessibilityRole="radio"
            accessibilityLabel={name}
            accessibilityState={{ selected: filled, disabled }}
            disabled={disabled}
            onPress={() => onRate(stars)}
            style={{ width: size, height: size }}
          >
            {glyph}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
  },
  star: {
    textAlign: 'center',
    lineHeight: 56,
  },
  filled: {
    color: colors.primary,
  },
  empty: {
    color: colors.textMuted,
  },
});
