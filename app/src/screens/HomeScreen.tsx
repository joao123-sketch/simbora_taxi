import { BigButton } from '../components/BigButton';
import { Screen } from '../components/Screen';
import { supabase } from '../lib/supabase';

type Props = {
  name: string;
  onRequestRide: () => void;
  onDriverMode: () => void;
  onOpenHistory: () => void;
};

export function HomeScreen({ name, onRequestRide, onDriverMode, onOpenHistory }: Props) {
  const firstName = name.split(' ')[0];

  return (
    <Screen title={`Oi, ${firstName}!`} subtitle="Pra onde a gente vai?">
      <BigButton label="Pedir corrida" onPress={onRequestRide} />
      <BigButton label="Minhas corridas" onPress={onOpenHistory} variant="link" />
      <BigButton label="Sou motorista" onPress={onDriverMode} variant="link" />
      <BigButton label="Sair" onPress={() => supabase.auth.signOut()} variant="link" />
    </Screen>
  );
}
