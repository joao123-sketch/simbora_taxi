import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';

type Props = {
  size?: number;
  // Cor do fusca e cor do que fica "vazado" (para-brisa, vincos, faróis), que deve ser a do fundo.
  color: string;
  cutout: string;
};

// O fusca da marca, visto de frente. Mesmo desenho dos ícones do app (app/assets/logo-fusca.svg).
export function BeetleLogo({ size = 24, color, cutout }: Props) {
  return (
    <Svg
      width={size}
      height={size * 0.82}
      viewBox="54 82 404 330"
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <G>
        <Ellipse cx={124} cy={204} rx={17} ry={10} rotation={-28} origin="124, 204" fill={color} />
        <Ellipse cx={388} cy={204} rx={17} ry={10} rotation={28} origin="388, 204" fill={color} />
        <Path
          fill={color}
          d="M150 222 C148 134 192 90 256 90 C320 90 364 134 362 222 C396 236 438 266 438 324 L438 352 L74 352 L74 324 C74 266 116 236 150 222 Z"
        />
        <Path fill={cutout} d="M174 208 C174 164 198 132 256 132 C314 132 338 164 338 208 C300 198 212 198 174 208 Z" />
        <Path d="M256 222 L256 292" stroke={cutout} strokeWidth={7} strokeLinecap="round" fill="none" />
        <Path d="M150 240 C128 258 118 280 116 300" stroke={cutout} strokeWidth={7} strokeLinecap="round" fill="none" />
        <Path d="M362 240 C384 258 394 280 396 300" stroke={cutout} strokeWidth={7} strokeLinecap="round" fill="none" />
        <Circle cx={142} cy={304} r={36} fill={cutout} />
        <Circle cx={370} cy={304} r={36} fill={cutout} />
        <Circle cx={142} cy={304} r={24} fill={color} />
        <Circle cx={370} cy={304} r={24} fill={color} />
        <Rect x={112} y={368} width={58} height={36} rx={12} fill={color} />
        <Rect x={342} y={368} width={58} height={36} rx={12} fill={color} />
        <Rect x={62} y={340} width={388} height={34} rx={14} fill={color} stroke={cutout} strokeWidth={8} />
        <Path d="M74 357 L438 357" stroke={cutout} strokeWidth={4} fill="none" />
      </G>
    </Svg>
  );
}
