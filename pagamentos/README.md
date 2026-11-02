# pagamentos

Cobra a mensalidade dos motoristas pelo Asaas. Roda como **Edge Function do Supabase** (nome `asaas`);
o mesmo código também roda como Worker do Cloudflare (`wrangler.jsonc`), que não é mais o caminho usado.

- `POST .../fee/charge`: o app (motorista logado) pede a cobrança do mês. A função confere o login, acha o mês aberto, cria o cliente e o pagamento no Asaas (Pix ou cartão) se ainda não existirem e devolve valor, vencimento, código Pix e link da fatura.
- `POST .../webhook`: o Asaas avisa que um pagamento caiu (`PAYMENT_RECEIVED` ou `PAYMENT_CONFIRMED`) e a função baixa o mês no banco (`asaas_mark_paid`). O token vem no cabeçalho `asaas-access-token`.
- `GET .../health`: responde `ok`.

## Testes e build

```bash
cd pagamentos
npm install
npm test            # testes com banco e Asaas falsos, sem rede
npm run check       # tsc
npm run build:edge  # gera dist/asaas.js, o arquivo único que vai para o Supabase
```

## Colocar no ar (painel do Supabase)

1. **Edge Functions > Deploy a new function > Via Editor**, nome **`asaas`**. Cole o conteúdo de `dist/asaas.js`.
2. Nas configurações da função, **desligue "Verify JWT"**: o Asaas não manda login do Supabase. A função confere o login do app e o token do Asaas por conta própria.
3. **Edge Functions > Secrets** (ou Project Settings > Edge Functions): crie `ASAAS_API_KEY` (comece pela chave do **sandbox**), `ASAAS_WEBHOOK_TOKEN` (32 a 255 caracteres aleatórios) e, se quiser trocar, `ASAAS_BASE_URL` (padrão: sandbox). `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` o Supabase já põe sozinho.
4. Registre o webhook no Asaas rodando `scripts/register-webhook.mjs` no seu terminal (as variáveis estão no comentário do arquivo, com `FUNCTION_URL=https://<projeto>.supabase.co/functions/v1/asaas`).
5. No app (`simbora-app`, **variáveis de build**), coloque `EXPO_PUBLIC_PAGAMENTOS_URL=https://<projeto>.supabase.co/functions/v1/asaas` e faça um build novo.

## Sandbox para produção

Troque o segredo `ASAAS_API_KEY` pela chave de produção, ponha `ASAAS_BASE_URL=https://api.asaas.com` e rode `register-webhook.mjs` de novo apontando para a conta de produção.
