import { supabase } from './supabase';

export { cleanName } from './profileName';

export type MyProfile = {
  full_name: string | null;
  photo_path: string | null;
};

// Nome e foto da própria conta (a mesma do passageiro: mudar aqui muda nos dois lados).
export async function fetchMyProfile(userId: string): Promise<MyProfile> {
  const { data, error } = await supabase.from('profiles').select('full_name, photo_path').eq('id', userId).single();
  if (error) throw error;
  return data as MyProfile;
}

export async function saveMyName(userId: string, name: string): Promise<void> {
  const { error } = await supabase.from('profiles').update({ full_name: name }).eq('id', userId);
  if (error) throw error;
}
