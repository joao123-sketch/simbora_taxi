import { StyleSheet, TextInput, TextInputProps } from 'react-native';

import { colors, touchTarget } from '../theme';

export function BigInput(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={colors.textMuted}
      {...props}
      style={[styles.input, props.style]}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    alignSelf: 'stretch',
    minHeight: touchTarget,
    borderWidth: 2,
    borderColor: colors.text,
    borderRadius: 16,
    paddingHorizontal: 20,
    fontSize: 28,
    color: colors.text,
    backgroundColor: colors.background,
  },
});
