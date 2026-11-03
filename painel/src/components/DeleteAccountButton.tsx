import { useState } from 'react';

import { friendlyError, supabase } from '../lib/supabase';

type Props = {
  userId: string;
  name: string;
  // Chamado depois que a conta foi excluída, para a tela recarregar.
  onDeleted: () => void | Promise<void>;
};

// Exclui a conta como se a própria pessoa tivesse excluído: nome, telefone, login e foto saem,
// o histórico de corridas fica para a outra pessoa sem o nome. Não tem volta.
export function DeleteAccountButton({ userId, name, onDeleted }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!window.confirm(`Excluir a conta de ${name}? Os dados pessoais e a foto são apagados e não tem volta.`)) return;
    setBusy(true);
    setError(null);
    const { data: photoPath, error: rpcError } = await supabase.rpc('staff_delete_account', { p_user_id: userId });
    if (rpcError) {
      setBusy(false);
      setError(friendlyError(rpcError));
      return;
    }
    // O banco devolve o caminho da foto; o arquivo sai do Storage aqui.
    let photoError: string | null = null;
    if (typeof photoPath === 'string' && photoPath) {
      const { error: removeError } = await supabase.storage.from('passenger-photos').remove([photoPath]);
      if (removeError) photoError = friendlyError(removeError);
    }
    setBusy(false);
    // A conta já foi excluída e o cartão some ao recarregar: o aviso vai em alerta, com o caminho para apagar à mão.
    if (photoError) window.alert(`Conta excluída, mas a foto não saiu do Storage (${photoError}). Apague o arquivo ${photoPath} no bucket passenger-photos.`);
    await onDeleted();
  }

  return (
    <>
      <button className="btn secondary" disabled={busy} onClick={remove}>
        {busy ? 'Excluindo...' : 'Excluir conta'}
      </button>
      {error ? <div className="msg error">{error}</div> : null}
    </>
  );
}
