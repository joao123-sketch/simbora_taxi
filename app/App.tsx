import type { Session } from '@supabase/supabase-js';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { checkSession, ensureSession, forgetClaimedSession, KICKED_MESSAGE, sessionIdOf } from './src/lib/sessionGuard';
import { supabase } from './src/lib/supabase';
import { CodeScreen } from './src/screens/CodeScreen';
import { NameScreen } from './src/screens/NameScreen';
import { PassengerFlow } from './src/screens/PassengerFlow';
import { PhoneScreen } from './src/screens/PhoneScreen';
import { colors } from './src/theme';

// undefined = ainda carregando; null = não tem.
export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [name, setName] = useState<string | null | undefined>(undefined);
  const [pendingPhone, setPendingPhone] = useState<string | null>(null);
  // Aviso na tela de entrada (ex.: a conta foi aberta em outro celular).
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  const loginId = session ? sessionIdOf(session.access_token) : null;

  // Uma conta, um celular: um login novo toma a conta; este celular confere de tempos em
  // tempos se ainda é o válido e, se não for, sai sozinho com um aviso.
  useEffect(() => {
    if (!session) return;
    let done = false;
    const kick = async () => {
      if (done) return;
      done = true;
      await forgetClaimedSession();
      setNotice(KICKED_MESSAGE);
      await supabase.auth.signOut();
    };
    const verify = (ok: boolean) => {
      if (!ok) kick();
    };
    ensureSession(session).then(verify);
    const timer = setInterval(() => checkSession().then(verify), 20000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkSession().then(verify);
    });
    return () => {
      done = true;
      clearInterval(timer);
      subscription.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, loginId]);

  useEffect(() => {
    if (!userId) {
      setName(undefined);
      return;
    }
    setPendingPhone(null);
    supabase
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .single()
      .then(({ data }) => setName(data?.full_name ?? null));
  }, [userId]);

  let content;
  if (session === undefined || (userId && name === undefined)) {
    content = (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  } else if (!userId) {
    content = pendingPhone ? (
      <CodeScreen phone={pendingPhone} onBack={() => setPendingPhone(null)} />
    ) : (
      <PhoneScreen
        notice={notice}
        onCodeSent={(phone) => {
          setNotice(null);
          setPendingPhone(phone);
        }}
      />
    );
  } else if (!name) {
    content = <NameScreen userId={userId} onSaved={setName} />;
  } else {
    content = <PassengerFlow userId={userId} name={name} />;
  }

  return (
    <SafeAreaProvider>
      {content}
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
