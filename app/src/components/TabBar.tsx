import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fontSize } from '../theme';

type IconName = keyof typeof Ionicons.glyphMap;

export type Tab = {
  key: string;
  label: string;
  icon: IconName;
  // Ícone da aba escolhida (cheio).
  activeIcon: IconName;
  onPress: () => void;
};

// Barra de abas de baixo (Início, Atividade, Conta). A aba da tela atual fica
// vermelha e em negrito: não depende só da cor.
export function TabBar({ tabs, active }: { tabs: Tab[]; active: string }) {
  return (
    <View accessibilityRole="tablist" style={styles.bar}>
      {tabs.map((tab) => {
        const selected = tab.key === active;
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={tab.label}
            onPress={tab.onPress}
            style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
          >
            <Ionicons
              name={selected ? tab.activeIcon : tab.icon}
              size={26}
              color={selected ? colors.primary : colors.textMuted}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <Text style={[styles.label, selected && styles.labelSelected]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginHorizontal: -20,
    paddingHorizontal: 8,
    backgroundColor: colors.surface,
  },
  tab: {
    flex: 1,
    minHeight: 60,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  pressed: {
    opacity: 0.7,
  },
  label: {
    fontSize: fontSize.body - 6,
    fontWeight: '600',
    color: colors.textMuted,
  },
  labelSelected: {
    fontWeight: '800',
    color: colors.primary,
  },
});
