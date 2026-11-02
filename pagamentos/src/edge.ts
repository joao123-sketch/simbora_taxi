// Entrada da Edge Function do Supabase (Deno). O build junta tudo num arquivo só em dist/asaas.js,
// que é o que se cola no editor de funções do painel do Supabase.
import { makeHandler, type Env } from './index.ts';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

// Endereços do app que podem chamar a função (a variável ALLOWED_ORIGINS, se existir, vale mais).
const DEFAULT_ORIGINS = [
  'https://simbora-app.joaovictordesouza123-9.workers.dev',
  'https://app.simboracar.com.br',
  'http://localhost:4173',
].join(',');

function env(): Env {
  const get = (name: string) => Deno.env.get(name) ?? '';
  return {
    ASAAS_API_KEY: get('ASAAS_API_KEY'),
    ASAAS_BASE_URL: get('ASAAS_BASE_URL') || 'https://api-sandbox.asaas.com',
    ASAAS_WEBHOOK_TOKEN: get('ASAAS_WEBHOOK_TOKEN'),
    // O Supabase põe estas duas sozinho dentro de toda Edge Function.
    SUPABASE_URL: get('SUPABASE_URL'),
    SUPABASE_SERVICE_KEY: get('SUPABASE_SERVICE_ROLE_KEY'),
    ALLOWED_ORIGINS: get('ALLOWED_ORIGINS') || DEFAULT_ORIGINS,
  };
}

const handle = makeHandler(fetch);

Deno.serve((request) => handle(request, env()));
