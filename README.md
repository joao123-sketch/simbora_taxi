# Simbora

App de corridas (carro e moto) de Guaraciaba do Norte (CE). Um único app com modo passageiro e modo motorista; a equipe administra pelo painel do Supabase.

## Estrutura

```
app/        App Expo (React Native + TypeScript) para Android e iOS
supabase/   Banco: migrations (schema, RLS, funções) e seed de desenvolvimento
```

## Rodar o app

```bash
cd app
cp .env.example .env.local   # preencha com a URL e a chave do projeto Supabase
npm install
npx expo start
```

Abra no celular com o app Expo Go, ou rode `npm run android` com um emulador.

## Banco (Supabase)

1. Crie o projeto em supabase.com (região São Paulo).
2. Aplique o schema: `npx supabase link --project-ref <ref>` e depois `npx supabase db push`.
3. Em desenvolvimento, rode `supabase/seed.sql` no SQL Editor (as tarifas ali são exemplos).
4. Ative o login por telefone em Authentication > Providers > Phone, com um provedor de SMS.
5. Ative a extensão `pg_cron` (Database > Extensions) e agende a fatura semanal no SQL Editor (toda segunda, 6h de Fortaleza = 9h UTC):

```sql
select cron.schedule(
  'faturas-semanais',
  '0 9 * * 1',
  $$select public.generate_weekly_invoices((date_trunc('week', now() at time zone 'America/Fortaleza') - interval '7 days')::date)$$
);
```

## Regras de negócio no banco

- Motorista se cadastra como `pending`; a equipe muda para `approved` depois da reunião presencial.
- Veículos 2010 ou mais novos (`drivers.vehicle_year`).
- O app nunca altera `rides` direto: usa as funções `accept_ride`, `advance_ride`, `cancel_ride` e `set_driver_online`.
- Comissão: 8% por corrida, com teto de R$ 300 acumulado no mês (`generate_weekly_invoices`).
