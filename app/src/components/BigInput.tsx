import { useState } from 'react';
import { StyleSheet, TextInput, TextInputProps } from 'react-native';

import { colors, radius, touchTarget } from '../theme';

// Campo de texto grande. Ao focar, a borda fica vermelha e mais grossa, para a pessoa
// saber onde está digitando.
export function BigInput(props: TextInputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <TextInput
      placeholderTextColor={colors.textMuted}
      {...props}
      onFocus={(e) => {
        setFocused(true);
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        props.onBlur?.(e);
      }}
      style={[styles.input, focused && styles.focused, props.style]}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    alignSelf: 'stretch',
    minHeight: touchTarget,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: 20,
    fontSize: 26,
    letterSpacing: 0,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  focused: {
    borderColor: colors.primary,
    borderWidth: 3,
  },
});
