# Simbora Car

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

1. Crie o projeto em supabase.com (o nosso está numa região dos EUA; a de São Paulo não estava disponível).
2. Aplique o schema: `npx supabase link --project-ref <ref>` e depois `npx supabase db push`.
3. Em desenvolvimento, rode `supabase/seed.sql` no SQL Editor (as tarifas da cidade são as decididas; os preços entre cidades são exemplos).
4. Ative o login por telefone em Authentication > Providers > Phone, com um provedor de SMS.

## Regras de negócio no banco

- Motorista se cadastra como `pending`; a equipe muda para `approved` depois da reunião presencial.
- Veículos 2010 ou mais novos (`drivers.vehicle_year`).
- O app nunca altera `rides` direto: usa as funções `accept_ride`, `advance_ride`, `cancel_ride` e `set_driver_online`.
- Receita: mensalidade fixa do motorista (mês 1 grátis, mês 2 R$ 200, a partir do mês 3 R$ 300), sem comissão por corrida. A cobrança entra na Etapa 10 do checklist.
- Tarifas em `fares`, com data de vigência (`effective_from`); a mais recente que já começou vale.
- Dentro da cidade o destino é livre (inclusive de e para sítios e distritos). Em viagem para outra cidade, o passageiro pode pedir um ponto combinado (`rides.destination_negotiated`): o motorista vê o pedido e decide se aceita.
- Pagamento direto ao motorista. Cada motorista marca o que aceita (`drivers.accepted_payments`: Pix, dinheiro, maquininha); o passageiro só vê as formas que algum motorista online aceita, e o pedido só chega a quem aceita a escolhida. Cartão custa 5% a mais, calculado no banco.
- Telefone não aparece para passageiro nem motorista: o perfil só libera `id`, `full_name` e `created_at`.
