# simbora-pagamentos

Worker no Cloudflare que cobra a mensalidade dos motoristas pelo Asaas.

- `POST /fee/charge`: o app (motorista logado) pede a cobrança do mês. O Worker confere o login no Supabase, acha o mês aberto, cria o cliente e o pagamento no Asaas (Pix ou cartão) se ainda não existirem e devolve valor, vencimento, código Pix e link da fatura.
- `POST /asaas/webhook`: o Asaas avisa que um pagamento caiu (`PAYMENT_RECEIVED` ou `PAYMENT_CONFIRMED`) e o Worker baixa o mês no banco (`asaas_mark_paid`). O token vem no cabeçalho `asaas-access-token`.
- `GET /health`: responde `ok`.

## Testes

```bash
cd pagamentos
npm install
npm test        # testes com banco e Asaas falsos, sem rede
npm run check   # tsc
```

## Colocar no ar (feito por você, no Cloudflare)

1. **Workers & Pages > Create > Import a repository** (`simbora_taxi`), nome **simbora-pagamentos**, **Root directory** `pagamentos`, **Deploy command** `npx wrangler deploy` (sem build command).
2. Em **Settings > Variables and secrets** do Worker (variáveis de **runtime**, tipo *Secret*):
   - `ASAAS_API_KEY`: a chave do Asaas (comece pela do **sandbox**).
   - `ASAAS_WEBHOOK_TOKEN`: um texto aleatório de 32 a 255 caracteres.
   - `SUPABASE_SERVICE_KEY`: a chave `service_role` do Supabase (Project Settings > API). É uma chave poderosa: só ela executa as funções `asaas_*` e ela nunca vai para o app nem para o código.
3. Registre o webhook no Asaas rodando `scripts/register-webhook.mjs` no seu terminal (as variáveis estão no comentário do arquivo).
4. No app (`simbora-app`, **variáveis de build**), coloque `EXPO_PUBLIC_PAGAMENTOS_URL` com o endereço do Worker e faça um build novo.

## Sandbox para produção

Troque `ASAAS_BASE_URL` (em `wrangler.jsonc`) para `https://api.asaas.com`, a chave `ASAAS_API_KEY` pela de produção e rode `register-webhook.mjs` de novo apontando para a conta de produção.
