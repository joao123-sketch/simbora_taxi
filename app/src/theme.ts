import type { ViewStyle } from 'react-native';

// Identidade do Simbora Car: vermelho acolhedor, fundo claro e quente, cantos
// arredondados e tudo grande o bastante para um idoso de 90 anos usar sem ajuda.
// Contraste: texto branco sobre o vermelho tem 4,8:1 ou mais; o texto escuro sobre
// o fundo claro passa de 15:1; o texto de apoio (cinza) passa de 7:1.
export const colors = {
  primary: '#D62828',
  primaryDark: '#A61E1E',
  background: '#FFFFFF',
  text: '#1B1B1F',
  textMuted: '#5B5559',
  onPrimary: '#FFFFFF',
  // Cartões e campos
  surface: '#FFFFFF',
  surfaceTint: '#FFF4F1',
  // Fundos neutros de botões, campos e atalhos (estilo app de mobilidade).
  surfaceMuted: '#F3F1F0',
  ink: '#1B1B1F',
  border: '#E9DEDB',
  borderStrong: '#CBBBB7',
  // Avisos
  dangerBg: '#FDECEC',
  success: '#1B6E2D',
  successBg: '#E8F5EA',
};

// Gradientes (de cima para baixo). O vermelho do botão mantém o contraste do texto branco.
export const gradients = {
  primary: ['#D62828', '#C42222'] as const,
  page: ['#FFFFFF', '#FFFFFF'] as const,
};

export const fontSize = {
  body: 20,
  title: 32,
  button: 20,
};

export const radius = { sm: 10, md: 14, lg: 14, xl: 24, pill: 999 };

// Área mínima de toque dos botões principais.
export const touchTarget = 60;

const softShadow: ViewStyle = { boxShadow: '0 2px 10px rgba(27, 27, 31, 0.08)' };

// Cartão padrão do app: branco, cantos grandes, borda fina e sombra suave.
export const cardSurface: ViewStyle = {
  backgroundColor: colors.surface,
  borderRadius: radius.lg,
  borderWidth: 1,
  borderColor: colors.border,
  padding: 16,
  ...softShadow,
};

export const shadows = {
  soft: softShadow,
  button: { boxShadow: '0 4px 12px rgba(166, 30, 30, 0.22)' } as ViewStyle,
  // Painel que sobe sobre o mapa e botões que flutuam sobre ele.
  sheet: { boxShadow: '0 -6px 24px rgba(27, 27, 31, 0.16)' } as ViewStyle,
  floating: { boxShadow: '0 3px 12px rgba(27, 27, 31, 0.22)' } as ViewStyle,
};
