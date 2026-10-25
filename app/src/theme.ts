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
  border: '#E9DEDB',
  borderStrong: '#CBBBB7',
  // Avisos
  dangerBg: '#FDECEC',
  success: '#1B6E2D',
  successBg: '#E8F5EA',
};

// Gradientes (de cima para baixo). O vermelho do botão mantém o contraste do texto branco.
export const gradients = {
  primary: ['#DC3030', '#A61E1E'] as const,
  page: ['#FFF2EE', '#FFFFFF'] as const,
};

export const fontSize = {
  body: 20,
  title: 32,
  button: 26,
};

export const radius = { sm: 12, md: 16, lg: 20, pill: 999 };

// Área mínima de toque dos botões principais.
export const touchTarget = 72;

const softShadow: ViewStyle = { boxShadow: '0 6px 18px rgba(122, 46, 46, 0.10)' };

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
  button: { boxShadow: '0 8px 18px rgba(166, 30, 30, 0.28)' } as ViewStyle,
};
