// Partes puras do Web Push (sem React Native nem Supabase), para testar com tsx.

// A chave pública vem em base64 "url safe"; pushManager.subscribe quer bytes.
export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export type StoredSubscription = { endpoint: string; p256dh: string; auth: string };

function toBase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return '';
  let binary = '';
  new Uint8Array(buffer).forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Transforma a inscrição do navegador no que o banco guarda. Devolve null se faltar algum pedaço.
export function toStored(sub: { endpoint: string; getKey(name: 'p256dh' | 'auth'): ArrayBuffer | null }): StoredSubscription | null {
  const p256dh = toBase64Url(sub.getKey('p256dh'));
  const auth = toBase64Url(sub.getKey('auth'));
  if (!sub.endpoint || !p256dh || !auth) return null;
  return { endpoint: sub.endpoint, p256dh, auth };
}
