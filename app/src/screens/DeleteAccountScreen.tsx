import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { BigButton } from '../components/BigButton';
import { Screen } from '../components/Screen';
import { supabase } from '../lib/supabase';
import { colors, fontSize } from '../theme';

type Props = {
  onBack: () => void;
};

// Excluir a própria conta (exigência das lojas). Pede confirmação e explica o
// que acontece; não dá para desfazer. Depois de excluir, o app volta para a
// tela de entrar.
export function DeleteAccountScreen({ onBack }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setLoading(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc('delete_my_account');
    if (rpcError) {
      setLoading(false);
      // As mensagens que o banco escreve de propósito (ex.: corrida em andamento)
      // vêm em português; qualquer outro erro vira um aviso genérico.
      setError(rpcError.code === 'P0001' ? rpcError.message : 'Não conseguimos excluir a conta agora. Tente de novo.');
      return;
    }
    // A sessão já foi encerrada no banco; limpa a deste aparelho.
    await supabase.auth.signOut({ scope: 'local' });
  }

  return (
    <Screen
      title="Excluir sua conta?"
      error={error}
      footer={<BigButton label="Não, voltar" onPress={onBack} variant="link" />}
    >
      <Text style={styles.text}>Seu nome, seu telefone e o acesso ao app serão apagados.</Text>
      <Text style={styles.text}>
        O histórico das corridas continua para quem andou com você, mas sem o seu nome.
      </Text>
      <Text style={styles.text}>Isso não pode ser desfeito. Se quiser voltar depois, será um cadastro novo.</Text>
      <BigButton label="Sim, excluir minha conta" onPress={confirm} loading={loading} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  text: {
    fontSize: fontSize.body,
    color: colors.text,
  },
});
