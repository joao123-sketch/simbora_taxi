import { BigButton } from '../components/BigButton';
import { Screen } from '../components/Screen';
import { supabase } from '../lib/supabase';

type Props = {
  name: string;
};

export function HomeScreen({ name }: Props) {
  const firstName = name.split(' ')[0];

  return (
    <Screen title={`Oi, ${firstName}!`} subtitle="Pra onde a gente vai?">
      <BigButton label="Pedir carro" onPress={() => {}} />
      <BigButton label="Sair" onPress={() => supabase.auth.signOut()} variant="link" />
    </Screen>
  );
}
