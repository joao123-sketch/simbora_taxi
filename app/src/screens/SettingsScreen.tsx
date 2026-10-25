import { BigButton } from '../components/BigButton';
import { Screen } from '../components/Screen';
import { supabase } from '../lib/supabase';

type Props = {
  onOpenHistory: () => void;
  onOpenFavorites: () => void;
  onOpenLegal: () => void;
  onDeleteAccount: () => void;
  onBack: () => void;
};

export function SettingsScreen({ onOpenHistory, onOpenFavorites, onOpenLegal, onDeleteAccount, onBack }: Props) {
  return (
    <Screen title="Configurações" footer={<BigButton label="Voltar" onPress={onBack} variant="link" />}>
      <BigButton label="Minhas corridas" icon="time" onPress={onOpenHistory} variant="secondary" />
      <BigButton label="Meus motoristas" icon="heart" onPress={onOpenFavorites} variant="secondary" />
      <BigButton label="Termos e privacidade" icon="document-text" onPress={onOpenLegal} variant="secondary" />
      <BigButton label="Excluir minha conta" icon="trash" onPress={onDeleteAccount} variant="secondary" />
      <BigButton label="Sair" icon="log-out" onPress={() => supabase.auth.signOut()} variant="secondary" />
    </Screen>
  );
}
