import { BigButton } from '../components/BigButton';
import { InstallCard } from '../components/InstallCard';
import { Screen } from '../components/Screen';
import { supabase } from '../lib/supabase';

type Props = {
  onOpenHistory: () => void;
  onOpenFavorites: () => void;
  onOpenPhoto: () => void;
  onOpenLegal: () => void;
  onDeleteAccount: () => void;
  onBack: () => void;
};

export function SettingsScreen({ onOpenHistory, onOpenFavorites, onOpenPhoto, onOpenLegal, onDeleteAccount, onBack }: Props) {
  return (
    <Screen title="Configurações" onBack={onBack}>
      <InstallCard />
      <BigButton label="Minhas corridas" icon="time" onPress={onOpenHistory} variant="secondary" />
      <BigButton label="Meus motoristas" icon="heart" onPress={onOpenFavorites} variant="secondary" />
      <BigButton label="Minha foto" icon="camera" onPress={onOpenPhoto} variant="secondary" />
      <BigButton label="Termos e privacidade" icon="document-text" onPress={onOpenLegal} variant="secondary" />
      <BigButton label="Excluir minha conta" icon="trash" onPress={onDeleteAccount} variant="secondary" />
      <BigButton label="Sair" icon="log-out" onPress={() => supabase.auth.signOut()} variant="secondary" />
    </Screen>
  );
}
