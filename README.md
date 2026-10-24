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

- Motorista se cadastra pelo app (função `register_driver`) como `pending`. CPF, nascimento e CNH ficam em `driver_private`, que só o próprio motorista lê. A equipe confere o `driver_checklist` e muda para `approved` depois da reunião presencial; o banco recusa a aprovação se faltar algo.
- Mensalidade: mês grátis a partir da aprovação (um por CPF), depois R$ 200 e R$ 300 (`fee_schedule`, `driver_fee_periods`). Quem volta sem nunca ter pago paga R$ 200 e depois R$ 300; quem já pagou volta pagando R$ 300. O contrato começa no mês 2 (`continue_contract`) e faz aniversário em 12 meses.
- Veículos 2010 ou mais novos (`drivers.vehicle_year`).
- O app nunca altera `rides` direto: usa as funções `accept_ride`, `advance_ride`, `cancel_ride` e `set_driver_online`.
- Receita: mensalidade fixa do motorista (mês 1 grátis, mês 2 R$ 200, a partir do mês 3 R$ 300), sem comissão por corrida. A cobrança entra na Etapa 10 do checklist.
- Tarifas em `fares`, com data de vigência (`effective_from`); a mais recente que já começou vale.
- Dentro da cidade o destino é livre (inclusive de e para sítios e distritos). Em viagem para outra cidade, o passageiro pode pedir um ponto combinado (`rides.destination_negotiated`): o motorista vê o pedido e decide se aceita.
- Pagamento direto ao motorista. Cada motorista marca o que aceita (`drivers.accepted_payments`: Pix, dinheiro, maquininha); o passageiro só vê as formas que algum motorista online aceita, e o pedido só chega a quem aceita a escolhida. Cartão custa 5% a mais, calculado no banco.
- Preço dinâmico: `quote_ride` grava uma cotação por veículo (vale 2 minutos) e o `request_ride` só aceita essa cotação. Nunca há desconto: o fator só sobe quando falta carro. Calculado separado para carro e moto. Falta de carro = pedidos (do mesmo veículo) dos últimos 15 min que passaram de 60 s sem motorista aceitar (ou cancelados depois de esperar isso), só com pelo menos 3 pedidos; a cada 25% de pedidos lentos sobe um degrau de 10% (teto 1,30×), um degrau por vez e no máximo a cada 5 min. Tudo isso fica em `pricing_settings` (e o degrau atual em `city_pricing_state`). Viagem entre cidades não tem fator. O fator é interno: passageiro e motorista só veem o preço final, sem nenhum aviso (o fator de cada corrida fica em `ride_pricing`, só a equipe lê). O acréscimo inteiro fica com o motorista. Liga sozinho; para travar: `update pricing_settings set locked = true, locked_factor = 1.00;` e para destravar `locked = false`.
- Despacho em ondas: cada pedido vira uma fila (`ride_offers`) do motorista mais próximo ao mais longe, só entre motoristas online, livres, do veículo pedido e que aceitam a forma de pagamento. O primeiro vê o pedido na hora e cada próximo 15 segundos depois (`private.wave_seconds`); recusar libera o próximo na hora. O app pergunta a cada 5 segundos.
- Avaliação: ao fim da corrida passageiro e motorista dão de 1 a 5 estrelas (`rate_ride`). A nota de prioridade do motorista (`driver_stats`) é calculada com nota ajustada, taxa de aceite e de cancelamento, mas ainda não é usada no despacho: no início o mais próximo chama primeiro.
- As notas ficam em `ride_ratings`, que o app não consegue ler: cada um só vê a nota que ele mesmo deu (no histórico). Quem recebe a nota não vê a que o outro deu.
- Chat: `ride_messages`, só entre o passageiro e o motorista da corrida e só enquanto ela está em andamento (`send_message`). No lugar do telefone.
- Posição: o passageiro vê o carro andando no mapa e o tempo estimado (`driver_positions`); só vale para o motorista da corrida em andamento. Notificações push e localização em segundo plano ainda não existem: dependem do build de desenvolvimento (Etapa 3).
- Telefone não aparece para passageiro nem motorista: o perfil só libera `id`, `full_name` e `created_at`.

- SOS: botão discreto na corrida (passageiro e motorista), segurar 5 segundos e confirmar; abre o WhatsApp do plantão com a mensagem pronta (corrida, motorista, placa e localização). O número vem de `EXPO_PUBLIC_SOS_WHATSAPP` em `app/.env.local` (fora do Git); quando o painel existir, passa para o banco.
