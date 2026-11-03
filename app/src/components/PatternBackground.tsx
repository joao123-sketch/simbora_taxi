import { StyleSheet } from 'react-native';
import Svg, { Circle, Defs, G, Path, Pattern, Rect } from 'react-native-svg';

import { colors } from '../theme';

// Textura de fundo no estilo do WhatsApp: carrinhos, pinos de localização, mapas e trajetos
// repetidos bem de leve, na cor da marca. Fica atrás do conteúdo e não recebe toque.
const TILE = 220;

type IconProps = { x: number; y: number; rotate?: number };

function Car({ x, y, rotate = 0 }: IconProps) {
  return (
    <G transform={`translate(${x} ${y}) rotate(${rotate})`}>
      <Path d="M-17 4 L-12 -6 Q-11 -9 -8 -9 H8 Q11 -9 12 -6 L17 4 V11 H-17 Z" />
      <Path d="M-11 -4 H11" />
      <Circle cx={-9} cy={11} r={4} />
      <Circle cx={9} cy={11} r={4} />
    </G>
  );
}

function Pin({ x, y, rotate = 0 }: IconProps) {
  return (
    <G transform={`translate(${x} ${y}) rotate(${rotate})`}>
      <Path d="M0 15 C0 15 -11 3 -11 -4 A11 11 0 0 1 11 -4 C11 3 0 15 0 15 Z" />
      <Circle cx={0} cy={-4} r={4} />
    </G>
  );
}

function MapSheet({ x, y, rotate = 0 }: IconProps) {
  return (
    <G transform={`translate(${x} ${y}) rotate(${rotate})`}>
      <Path d="M-16 -10 L-6 -14 L6 -10 L16 -14 V10 L6 14 L-6 10 L-16 14 Z" />
      <Path d="M-6 -14 V10 M6 -10 V14" />
    </G>
  );
}

function Route({ x, y, rotate = 0 }: IconProps) {
  return (
    <G transform={`translate(${x} ${y}) rotate(${rotate})`}>
      <Circle cx={-16} cy={8} r={3} />
      <Path d="M-13 6 C-4 -10 6 14 14 -6" strokeDasharray="3 4" />
      <Path d="M11 -12 h6 v6 h-6 Z" />
    </G>
  );
}

export function PatternBackground() {
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none" width="100%" height="100%">
      <Defs>
        <Pattern id="simbora-pattern" width={TILE} height={TILE} patternUnits="userSpaceOnUse">
          <G
            fill="none"
            stroke={colors.primary}
            strokeOpacity={0.09}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <Car x={34} y={36} rotate={-8} />
            <Pin x={112} y={30} rotate={10} />
            <MapSheet x={186} y={46} rotate={-12} />
            <Route x={40} y={112} rotate={6} />
            <Car x={128} y={110} rotate={12} />
            <Pin x={196} y={124} rotate={-10} />
            <MapSheet x={52} y={186} rotate={10} />
            <Pin x={112} y={184} rotate={-6} />
            <Route x={170} y={190} rotate={-8} />
          </G>
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#simbora-pattern)" />
    </Svg>
  );
}
