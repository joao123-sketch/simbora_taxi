import { BigButton } from '../components/BigButton';
import { Screen } from '../components/Screen';
import { supabase } from '../lib/supabase';

type Props = {
  name: string;
  onRequestRide: () => void;
  onRequestDelivery: () => void;
  onDriverMode: () => void;
  onOpenHistory: () => void;
  onOpenFavorites: () => void;
  onOpenLegal: () => void;
  onDeleteAccount: () => void;
};

export function HomeScreen({
  name,
  onRequestRide,
  onRequestDelivery,
  onDriverMode,
  onOpenHistory,
  onOpenFavorites,
  onOpenLegal,
  onDeleteAccount,
}: Props) {
  const firstName = name.split(' ')[0];

  return (
    <Screen title={`Oi, ${firstName}!`} subtitle="Pra onde a gente vai?">
      <BigButton label="Pedir corrida" onPress={onRequestRide} />
      <BigButton label="Pedir entrega" onPress={onRequestDelivery} />
      <BigButton label="Minhas corridas" onPress={onOpenHistory} variant="link" />
      <BigButton label="Meus motoristas" onPress={onOpenFavorites} variant="link" />
      <BigButton label="Sou motorista" onPress={onDriverMode} variant="link" />
      <BigButton label="Termos e privacidade" onPress={onOpenLegal} variant="link" />
      <BigButton label="Excluir minha conta" onPress={onDeleteAccount} variant="link" />
      <BigButton label="Sair" onPress={() => supabase.auth.signOut()} variant="link" />
    </Screen>
  );
}
