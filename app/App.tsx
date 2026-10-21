import type { Session } from '@supabase/supabase-js';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { supabase } from './src/lib/supabase';
import { CodeScreen } from './src/screens/CodeScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { NameScreen } from './src/screens/NameScreen';
import { PhoneScreen } from './src/screens/PhoneScreen';
import { colors } from './src/theme';

// undefined = ainda carregando; null = não tem.
export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [name, setName] = useState<string | null | undefined>(undefined);
  const [pendingPhone, setPendingPhone] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;

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
      <PhoneScreen onCodeSent={setPendingPhone} />
    );
  } else if (!name) {
    content = <NameScreen userId={userId} onSaved={setName} />;
  } else {
    content = <HomeScreen name={name} />;
  }

  return (
    <>
      {content}
      <StatusBar style="dark" />
    </>
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
