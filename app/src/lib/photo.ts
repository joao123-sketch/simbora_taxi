import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { fitWithin } from './photoSize';
import { supabase } from './supabase';

const BUCKET = 'passenger-photos';
const MAX_SIDE = 640;
const JPEG_QUALITY = 0.7;
// O link assinado vale 1 hora; guardamos por 50 minutos para não pedir um novo a cada tela.
const URL_SECONDS = 3600;
const CACHE_MS = 50 * 60 * 1000;

const urlCache = new Map<string, { url: string; expires: number }>();

// No navegador usamos a câmera ao vivo (SelfieCamera); o seletor de arquivos só abre a câmera no celular.
export function canUseWebCamera(): boolean {
  return Platform.OS === 'web' && typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

// Abre a câmera frontal pelo seletor do sistema (Expo Go). Devolve a foto ou null se a pessoa cancelou ou não deixou usar a câmera.
export async function takeSelfie(): Promise<string | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return null;
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    cameraType: ImagePicker.CameraType.front,
    quality: 1,
  });
  return result.canceled ? null : result.assets[0].uri;
}

// Reduz a foto para o lado maior ter 640 px e salva em JPEG (só na web, que é o app publicado).
export async function shrinkToJpeg(uri: string): Promise<Blob> {
  if (Platform.OS !== 'web') {
    return fetch(uri).then((r) => r.blob());
  }
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Foto inválida'));
    img.src = uri;
  });
  const { width, height } = fitWithin(image.naturalWidth, image.naturalHeight, MAX_SIDE);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')?.drawImage(image, 0, 0, width, height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Não foi possível reduzir a foto'))), 'image/jpeg', JPEG_QUALITY);
  });
}

// Envia para a pasta da própria pessoa (substitui a anterior) e grava o caminho no perfil.
export async function uploadMyPhoto(userId: string, blob: Blob): Promise<string> {
  const path = `${userId}/avatar.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (error) throw error;
  const { error: profileError } = await supabase.from('profiles').update({ photo_path: path }).eq('id', userId);
  if (profileError) throw profileError;
  urlCache.delete(path);
  return path;
}

// Link temporário para mostrar a foto de alguém que o banco deixa a pessoa ver.
export async function photoUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const cached = urlCache.get(path);
  if (cached && cached.expires > Date.now()) return cached.url;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, URL_SECONDS);
  if (error || !data) return null;
  urlCache.set(path, { url: data.signedUrl, expires: Date.now() + CACHE_MS });
  return data.signedUrl;
}

// Apaga o arquivo pela API do Storage (o Supabase não deixa apagar por SQL) e limpa o perfil.
export async function removeMyPhoto(userId: string): Promise<void> {
  const path = `${userId}/avatar.jpg`;
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
  const { error: profileError } = await supabase.from('profiles').update({ photo_path: null }).eq('id', userId);
  if (profileError) throw profileError;
  urlCache.delete(path);
}
