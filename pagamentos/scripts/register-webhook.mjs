// Registra no Asaas o webhook que avisa a função de pagamentos quando um pagamento cai.
// Rode UMA vez por conta (sandbox e, depois, produção), no seu terminal, com as variáveis abaixo.
// Nada daqui é gravado em arquivo e a chave nunca vai como argumento.
//
//   PowerShell:
//     $env:ASAAS_API_KEY = "<chave do Asaas, só no seu terminal; nunca salve neste arquivo>"
//     $env:ASAAS_BASE_URL = "https://api-sandbox.asaas.com"
//     $env:FUNCTION_URL = "https://kqbfusrjxmyjzzjyagiu.supabase.co/functions/v1/asaas"
//     $env:ASAAS_WEBHOOK_TOKEN = "<o mesmo token do segredo ASAAS_WEBHOOK_TOKEN no Supabase, 32 a 255 caracteres>"
//     $env:WEBHOOK_EMAIL = "<seu e-mail, recebe aviso se a fila do webhook parar>"
//     node scripts/register-webhook.mjs

const { ASAAS_API_KEY, ASAAS_BASE_URL, FUNCTION_URL, ASAAS_WEBHOOK_TOKEN, WEBHOOK_EMAIL } = process.env;

for (const [name, value] of Object.entries({ ASAAS_API_KEY, ASAAS_BASE_URL, FUNCTION_URL, ASAAS_WEBHOOK_TOKEN, WEBHOOK_EMAIL })) {
  if (!value) {
    console.error(`Falta a variável ${name}.`);
    process.exit(1);
  }
}
if (ASAAS_WEBHOOK_TOKEN.length < 32 || ASAAS_WEBHOOK_TOKEN.length > 255) {
  console.error('ASAAS_WEBHOOK_TOKEN precisa ter de 32 a 255 caracteres.');
  process.exit(1);
}

const response = await fetch(`${ASAAS_BASE_URL}/v3/webhooks`, {
  method: 'POST',
  headers: { access_token: ASAAS_API_KEY, 'User-Agent': 'SimboraCar/1.0', 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Simbora Car',
    url: `${FUNCTION_URL}/webhook`,
    email: WEBHOOK_EMAIL,
    enabled: true,
    interrupted: false,
    apiVersion: 3,
    authToken: ASAAS_WEBHOOK_TOKEN,
    sendType: 'SEQUENTIALLY',
    events: ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'],
  }),
});

const body = await response.json().catch(() => null);
if (!response.ok) {
  console.error('O Asaas recusou:', response.status, JSON.stringify(body));
  process.exit(1);
}
console.log('Webhook registrado. id:', body?.id);
