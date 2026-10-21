import { BigButton } from '../components/BigButton';
import { Screen } from '../components/Screen';
import { supabase } from '../lib/supabase';

type Props = {
  name: string;
  onRequestRide: () => void;
};

export function HomeScreen({ name, onRequestRide }: Props) {
  const firstName = name.split(' ')[0];

  return (
    <Screen title={`Oi, ${firstName}!`} subtitle="Pra onde a gente vai?">
      <BigButton label="Pedir corrida" onPress={onRequestRide} />
      <BigButton label="Sair" onPress={() => supabase.auth.signOut()} variant="link" />
    </Screen>
  );
}
