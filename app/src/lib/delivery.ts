import type { PackageSize, Ride, VehicleType } from './rides';
import { supabase } from './supabase';

// Entrega: um tipo de corrida em que ninguém embarca. O motorista leva o
// pacote e finaliza com o código de 4 dígitos de quem recebe. O preço é o da
// tabela do veículo com um desconto de entrega (configurado no painel).

export type PackageOption = {
  size: PackageSize;
  name: string;
  weight: string;
  example: string;
  vehicles: string;
  // Veículos que levam esse tamanho.
  allowed: VehicleType[];
};

// Faixas de peso e exemplos: a equipe edita no painel (Preços > Tamanhos de pacote) e o
// app lê do banco. Estes textos só valem enquanto a lista não chegou.
export const DEFAULT_PACKAGE_OPTIONS: PackageOption[] = [
  {
    size: 'P',
    name: 'Pequeno',
    weight: 'até 5 kg',
    example: 'Cabe numa sacola: documentos, remédio, um lanche.',
    vehicles: 'Moto ou carro',
    allowed: ['moto', 'car'],
  },
  {
    size: 'M',
    name: 'Médio',
    weight: 'de 5 a 10 kg',
    example: 'Do tamanho de uma caixa de sapatos ou de uma pizza grande.',
    vehicles: 'Moto ou carro',
    allowed: ['moto', 'car'],
  },
  {
    size: 'G',
    name: 'Grande',
    weight: 'mais de 10 kg',
    example: 'Caixa grande, compras do mercado, vários volumes.',
    vehicles: 'Só carro',
    allowed: ['car'],
  },
];

type SizeRow = {
  size: PackageSize;
  name: string;
  weight: string;
  example: string;
  allow_moto: boolean;
  allow_car: boolean;
};

// A última lista que chegou do banco (os rótulos das telas usam esta).
let packageOptions: PackageOption[] = DEFAULT_PACKAGE_OPTIONS;

export function currentPackageOptions(): PackageOption[] {
  return packageOptions;
}

export async function loadPackageOptions(): Promise<PackageOption[]> {
  const { data, error } = await supabase.rpc('delivery_sizes');
  if (error) throw error;
  packageOptions = (data as SizeRow[])
    .map((row) => {
      const allowed: VehicleType[] = [...(row.allow_moto ? (['moto'] as const) : []), ...(row.allow_car ? (['car'] as const) : [])];
      return {
        size: row.size,
        name: row.name,
        weight: row.weight,
        example: row.example,
        vehicles: row.allow_moto && row.allow_car ? 'Moto ou carro' : row.allow_car ? 'Só carro' : 'Só moto',
        allowed,
      };
    })
    .sort((a, b) => a.size.localeCompare(b.size));
  return packageOptions;
}

export function packageLabel(size: PackageSize | null | undefined): string {
  const option = packageOptions.find((o) => o.size === size);
  return option ? `${option.name} (${option.weight})` : '';
}

export function isDelivery(ride: Pick<Ride, 'kind'>): boolean {
  return ride.kind === 'delivery';
}

// O código de 4 dígitos fica guardado de um jeito que só quem pediu a entrega lê.
export async function fetchDeliveryCode(rideId: number): Promise<string | null> {
  const { data, error } = await supabase.rpc('my_delivery_code', { p_ride_id: rideId });
  if (error) throw error;
  return (data as string | null) ?? null;
}

// true = entrega finalizada; false = o código estava errado.
export async function completeDelivery(rideId: number, code: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('complete_delivery', { p_ride_id: rideId, p_code: code });
  if (error) throw error;
  return data === true;
}
