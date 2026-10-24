import { StyleSheet, Text, View } from 'react-native';

import { BigButton } from '../components/BigButton';
import { Screen } from '../components/Screen';
import { PRIVACY, TERMS, type LegalSection } from '../legal/general';
import { colors, fontSize } from '../theme';

type Props = {
  onBack: () => void;
};

function Block({ title, sections }: { title: string; sections: LegalSection[] }) {
  return (
    <View style={styles.block}>
      <Text accessibilityRole="header" style={styles.blockTitle}>
        {title}
      </Text>
      {sections.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <Text style={styles.sectionText}>{section.text}</Text>
        </View>
      ))}
    </View>
  );
}

// Termos de uso e política de privacidade, dentro do app. O texto ainda é
// provisório, até a revisão de um advogado.
export function LegalScreen({ onBack }: Props) {
  return (
    <Screen
      title="Termos e privacidade"
      footer={<BigButton label="Voltar" onPress={onBack} variant="link" />}
    >
      <Text style={styles.notice}>Texto provisório, em revisão.</Text>
      <Block title="Termos de uso" sections={TERMS} />
      <Block title="Política de privacidade" sections={PRIVACY} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  notice: {
    fontSize: fontSize.body - 2,
    color: colors.textMuted,
  },
  block: {
    gap: 12,
  },
  blockTitle: {
    fontSize: fontSize.title - 6,
    fontWeight: '700',
    color: colors.text,
  },
  section: {
    gap: 2,
  },
  sectionTitle: {
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.text,
  },
  sectionText: {
    fontSize: fontSize.body,
    color: colors.text,
  },
});
