# Simbora Car

App de corridas (carro e moto) de Guaraciaba do Norte (CE). Um único app com modo passageiro e modo motorista; a equipe administra pelo painel do Supabase.

## Estrutura

```
app/        App Expo (React Native + TypeScript) para Android e iOS
supabase/   Banco: migrations (schema, RLS, funções) e seed de desenvolvimento
painel/     Painel da equipe (Vite + React): página estática que fala com o Supabase
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
- Dentro da cidade o destino é livre (inclusive de e para sítios e distritos). Em viagem para outra cidade, o passageiro pode pedir um lugar combinado (`rides.destination_place`) e/ou ida e volta (`rides.round_trip`, `wait_minutes`): o motorista vê o pedido e aceita pelo valor ou propõe um acréscimo (`propose_extra`), e o passageiro aceita ou recusa.
- Pagamento direto ao motorista. Cada motorista marca o que aceita (`drivers.accepted_payments`: Pix, dinheiro, maquininha); o passageiro só vê as formas que algum motorista online aceita, e o pedido só chega a quem aceita a escolhida. Cartão custa 5% a mais, calculado no banco.
- Preço dinâmico: `quote_ride` grava uma cotação por veículo (vale 2 minutos) e o `request_ride` só aceita essa cotação. Nunca há desconto: o fator só sobe quando falta carro. Calculado separado para carro e moto. Falta de carro = pedidos (do mesmo veículo) dos últimos 15 min que passaram de 60 s sem motorista aceitar (ou cancelados depois de esperar isso), só com pelo menos 3 pedidos; a cada 25% de pedidos lentos sobe um degrau de 10% (teto 1,30×), um degrau por vez e no máximo a cada 5 min. Tudo isso fica em `pricing_settings` (e o degrau atual em `city_pricing_state`). Viagem entre cidades não tem fator. O fator é interno: passageiro e motorista só veem o preço final, sem nenhum aviso (o fator de cada corrida fica em `ride_pricing`, só a equipe lê). O acréscimo inteiro fica com o motorista. Liga sozinho; para travar: `update pricing_settings set locked = true, locked_factor = 1.00;` e para destravar `locked = false`.
- Despacho em ondas: cada pedido vira uma fila (`ride_offers`) do motorista mais próximo ao mais longe, só entre motoristas online, livres, do veículo pedido e que aceitam a forma de pagamento. O primeiro vê o pedido na hora e cada próximo 15 segundos depois (`private.wave_seconds`); recusar libera o próximo na hora. O app pergunta a cada 5 segundos.
- Avaliação: ao fim da corrida passageiro e motorista dão de 1 a 5 estrelas (`rate_ride`). A nota de prioridade do motorista (`driver_stats`) é calculada com nota ajustada, taxa de aceite e de cancelamento, mas ainda não é usada no despacho: no início o mais próximo chama primeiro.
- As notas ficam em `ride_ratings`, que o app não consegue ler: cada um só vê a nota que ele mesmo deu (no histórico). Quem recebe a nota não vê a que o outro deu.
- Chat: `ride_messages`, só entre o passageiro e o motorista da corrida e só enquanto ela está em andamento (`send_message`). No lugar do telefone.
- Posição: o passageiro vê o carro andando no mapa e o tempo estimado (`driver_positions`); só vale para o motorista da corrida em andamento. Notificações push e localização em segundo plano ainda não existem: dependem do build de desenvolvimento (Etapa 3).
- Telefone não aparece para passageiro nem motorista: o perfil só libera `id`, `full_name` e `created_at`.

- SOS: botão discreto na corrida (passageiro e motorista), segurar 5 segundos e confirmar; abre o WhatsApp do plantão com a mensagem pronta (corrida, motorista, placa e localização). O número vem de `EXPO_PUBLIC_SOS_WHATSAPP` em `app/.env.local` (fora do Git); quando o painel existir, passa para o banco.
- Pagamento adiantado (só viagem entre cidades): o motorista escolhe 0% (sem adiantamento), 50% ou 100% já ao aceitar ou propor (`accept_ride`, `propose_extra`, `rides.advance_percent`). O passageiro paga direto a ele, e com 50% ou 100% o `advance_ride` só deixa iniciar depois de `confirm_advance_received` ("recebi"). `set_advance_percent` troca a porcentagem até o "recebi".
- Ida e volta: o preço sugerido é a ida dobrada mais a espera (30 min a 4 h) pelo valor por minuto da tarifa; fica gravado na cotação (`price_quotes.round_trip`, `wait_minutes`).
- O motorista vê o passageiro se aproximando até o embarque: o passageiro manda a posição (`update_passenger_location`) e o motorista da corrida lê (`get_passenger_position`), só com a corrida aceita ou com o motorista no local e só posição de até 5 minutos.
- Chat: número parecido com telefone (8 dígitos ou mais) é trocado por "(número escondido)" antes de salvar (`private.mask_phones`).
- Busca de endereço no destino: `app/src/lib/geocode.ts` usa o Nominatim (grátis, só ao tocar em Buscar). Antes de publicar, trocar pelo Google Geocoding e Places mexendo só nesse arquivo. A origem já vem na localização do celular.
- Destinos sugeridos (`app/src/lib/favorites.ts`): o lugar para onde o passageiro já foi 3 vezes (destinos a menos de 100 m contam como o mesmo) aparece na tela de destino. Calculado no app, só com o histórico da própria pessoa.
- Motorista favorito (`app/src/lib/favoriteDrivers.ts`): cada motorista tem um código de 8 caracteres (`drivers.share_code`), mostrado como QR e link em "Meu QR para clientes". O passageiro lê o QR (câmera) ou digita o código em "Meus motoristas" e o favorito chama primeiro nos pedidos dele (`private.dispatch_ride`); o preço não muda. Abrir o app pelo link ainda não está tratado.
- Dashboard de Minhas corridas (`app/src/lib/stats.ts`): faturamento ou gasto, corridas, quilômetros e média por hoje, 7 e 30 dias, calculados no app; o motorista também vê o tempo online (`driver_online_seconds`, sessões em `driver_online_sessions`).
- Excluir conta (`delete_my_account`): apaga nome, telefone e login; o histórico fica para a outra pessoa sem o nome. Do motorista guarda só o hash do CPF (`deleted_driver_cpfs`), para não repetir o mês grátis.
- Termos e privacidade: texto provisório em `app/src/legal/general.ts` (e `driverTerms.ts`), à espera do advogado.

## Acessibilidade

O app é pensado para um idoso usar sozinho: letras de no mínimo 18 (corpo 20), contraste de pelo menos 4,5:1 (as cores do tema passam), alvos de toque de 56 a 72 px, um botão principal por tela e botão de voltar sempre visível em listas longas (`footer` do `Screen`).

## Primeiro build (Etapa 3, ainda não feito)

Precisa das suas contas (Expo, Google Play, depois Apple). O `app.json` e o `eas.json` já estão prontos (pacote `br.com.simboracar.app`, perfis `development`, `preview` e `production`).

```bash
cd app
npx eas-cli@latest login
npx eas-cli@latest build:configure
npx eas-cli@latest build --profile development --platform android
```

Não instale o `expo-dev-client` antes de fazer o build de desenvolvimento: ele muda o `expo start` e o app deixa de abrir no Expo Go. Localização em segundo plano, notificações push e o SMS de verdade (Twilio) também entram nessa etapa.

## Testes com Expo Go

Rode `npx expo start` dentro da pasta `app`. No iPhone, o Expo Go exige estar logado numa conta Expo (a mesma em `npx expo login` no computador). Contas de teste (código `123456`): `+5588900000001` a `04`.

## Painel da equipe (`painel/`)

Página estática (Vite + React + TypeScript): `npm run build` gera a pasta `dist`, que qualquer hospedagem entrega como está (Cloudflare Pages, Netlify, Vercel). Entra com e-mail e senha do Supabase; o banco só deixa quem está em `public.staff` usar as funções `staff_*` (aprovar motoristas, marcar o checklist, editar tarifas, preços entre cidades, taxa do cartão e o preço dinâmico).

```bash
cd painel
cp .env.example .env.local   # a mesma URL e chave publishable do app
npm install
npm run dev                  # http://localhost:5174
npm run build
```

Cloudflare (Workers com arquivos estáticos): em **Settings > Build**, **Root directory** `painel`, **Build command** `npm run build`, **Deploy command** `npx wrangler deploy` (a configuração está em `painel/wrangler.jsonc`, cujo `name` precisa ser igual ao nome do Worker). Em **Build variables and secrets** coloque `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY` e `NODE_VERSION` = `22`. As variáveis `VITE_*` são lidas na hora de compilar: depois de mudar uma, faça **Retry build**.

Para liberar alguém: crie o usuário em Authentication > Users e rode no SQL Editor (troque o e-mail):

```sql
insert into public.staff (user_id)
select id from auth.users where email = 'equipe@exemplo.com';
```

## Trajeto compartilhado, convite do motorista e entrega

- **Trajeto compartilhado:** `create_ride_share` gera um código por corrida; a página `/t/CODIGO` (em `painel/src/public/SharedRide.tsx`, sem login) mostra o primeiro nome do motorista, o veículo, a placa, o status e a posição ao vivo, e vence quando a corrida termina. O SOS leva esse link na mensagem do WhatsApp. O endereço do site vem de `EXPO_PUBLIC_SHARE_BASE_URL` (padrão: o site do painel).
- **Convite do motorista:** o QR e o link do motorista abrem `/m/CODIGO` (`DriverInvite.tsx`), que explica como baixar o app e usar o código. O link de download vem de `VITE_DOWNLOAD_URL` (painel) quando o app estiver nas lojas.
- **Entrega:** "Pedir entrega" na tela inicial. Tamanhos P/M/G, com nome, faixa de peso, exemplo e veículos editáveis no painel (Preços > Tamanhos de pacote; textos de reserva em `app/src/lib/delivery.ts`), preço da tabela do veículo com o desconto de entrega (painel > Preços), quem pede paga direto ao motorista, e o motorista finaliza com o código de 4 dígitos de quem recebe (`complete_delivery`, sem limite de tentativas). Quem pede copia a mensagem pronta para o destinatário (link de acompanhamento, código e convite para o app).
