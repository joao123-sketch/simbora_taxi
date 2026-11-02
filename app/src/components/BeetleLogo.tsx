import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

type Props = {
  size?: number;
  // Cor do fusca e cor do que fica "vazado" (para-brisa, vinco, faróis), que deve ser a do fundo.
  color: string;
  cutout: string;
};

// O fusca da marca, visto de frente, em duas cores. Mesmo desenho dos ícones do app
// (app/assets/logo-fusca.svg tem a versão colorida).
export function BeetleLogo({ size = 24, color, cutout }: Props) {
  return (
    <Svg
      width={size}
      height={size * 0.79}
      viewBox="50 90 412 326"
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <G>
        <Rect x={112} y={364} width={58} height={40} rx={14} fill={color} />
        <Rect x={342} y={364} width={58} height={40} rx={14} fill={color} />
        <Path
          fill={color}
          d="M256 94 C320 94 354 134 357 200 C357 214 361 224 372 230 C416 244 447 280 447 332 L447 354 C447 364 439 372 429 372 L83 372 C73 372 65 364 65 354 L65 332 C65 280 96 244 140 230 C151 224 155 214 155 200 C158 134 192 94 256 94 Z"
        />
        <Path fill={cutout} d="M179 204 C181 152 207 124 256 124 C305 124 331 152 333 204 C297 194 215 194 179 204 Z" />
        <Path d="M256 214 L256 284" stroke={cutout} strokeWidth={7} strokeLinecap="round" fill="none" />
        <Circle cx={140} cy={306} r={36} fill={cutout} />
        <Circle cx={372} cy={306} r={36} fill={cutout} />
        <Circle cx={140} cy={306} r={24} fill={color} />
        <Circle cx={372} cy={306} r={24} fill={color} />
        <Rect x={58} y={342} width={396} height={32} rx={16} fill={color} stroke={cutout} strokeWidth={8} />
      </G>
    </Svg>
  );
}
