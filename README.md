# Simbora Car

App de corridas de carro e moto, de entrega e de viagem entre cidades, feito para **Guaraciaba do Norte (CE)** e as cidades vizinhas da Serra da Ibiapaba. Um único app, com modo **passageiro** e modo **motorista**, mais um **painel da equipe** para administrar.

> Este documento descreve **como o sistema funciona** (produto, telas, regras e parte técnica). A seção [Identidade visual atual](#identidade-visual-atual) é o ponto de partida para quem vai criar ou redesenhar a identidade do app.

## Sumário

1. [Visão do produto](#visão-do-produto)
2. [Quem usa](#quem-usa)
3. [Identidade visual atual](#identidade-visual-atual)
4. [Telas e fluxos](#telas-e-fluxos)
5. [Como o preço funciona](#como-o-preço-funciona)
6. [Regras de funcionamento](#regras-de-funcionamento)
7. [Painel da equipe](#painel-da-equipe)
8. [Páginas públicas](#páginas-públicas)
9. [Parte técnica](#parte-técnica)

---

## Visão do produto

- **O que é:** um app para pedir corrida (carro ou moto) dentro da cidade, pedir entrega de pacotes e combinar viagens para outras cidades, com preço claro antes de chamar.
- **Onde:** começa em Guaraciaba do Norte (CE, cerca de 42 mil habitantes, turismo na serra) e se expande para Ubajara, Tianguá, São Benedito, Ibiapina e outras cidades próximas.
- **Quem faz:** dois desenvolvedores locais. O app é independente de grandes plataformas e concorre com um app local (o "Me Ache Car").
- **Como o dinheiro anda:** o passageiro paga **direto ao motorista** (Pix, dinheiro ou maquininha). O app **não cobra comissão por corrida**: a receita é uma **mensalidade fixa do motorista** (primeiro mês grátis, depois R$ 200 e a partir do terceiro mês R$ 300).
- **Como se instala:** é um **PWA**, isto é, um site que a pessoa instala na tela inicial do celular. Não está na Google Play nem na App Store. No Android, o Chrome oferece "Instalar app". No iPhone, só pelo Safari, em Compartilhar e "Adicionar à Tela de Início". O app também roda no Expo Go para testes.
- **Princípio de design:** tem que ser usável por **uma pessoa de 90 anos sozinha**. Letras grandes, um botão principal por tela, poucas decisões, textos curtos e acolhedores, em português do Brasil, tom simples e próximo ("Oi, João!", "Pra onde você vai?", "Simbora").
- **Idioma:** só português do Brasil. Moeda em reais (R$). Fuso de Fortaleza.

## Quem usa

| Papel | O que faz | Onde |
|---|---|---|
| **Passageiro** | Pede corrida, entrega ou viagem entre cidades, acompanha o carro no mapa, conversa por chat, avalia, mantém motoristas favoritos | App (modo passageiro) |
| **Motorista** | Cadastra-se, fica online, aceita chamados (ou propõe valor em viagem entre cidades), faz a corrida, recebe do passageiro direto, paga a mensalidade | App (modo motorista, na mesma conta do passageiro) |
| **Equipe** | Aprova motoristas depois de uma reunião presencial, edita preços e cidades, vê relatórios, trava contas, acompanha cobranças | Painel web (`painel/`) |
| **Visitante** | Abre o link de um trajeto compartilhado por um passageiro, ou o convite de um motorista | Páginas públicas |

Uma mesma pessoa pode ser passageira e motorista na mesma conta (botão "Quero ser motorista" / "Sou motorista" na tela inicial). Cada conta funciona em **um celular por vez**.

---

## Identidade visual atual

Tudo abaixo está no código (`app/src/theme.ts`) e nos arquivos de `app/assets/`. É o que existe hoje, pronto para ser mantido ou substituído.

### Nome e marca

- **Nome:** Simbora Car (curto: "Simbora"). "Simbora" é como se diz "vamos embora" no Nordeste: convite, alegria, informalidade.
- **Logo atual:** um **Fusca vermelho de frente**, em estilo cartum, com contorno marrom-escuro grosso, faróis amarelos brilhantes, para-choque cromado cinza, espelhos e brilho no capô, sobre fundo rosa muito claro. Arquivos: `app/assets/logo-fusca.png` (logo sem fundo), `app/assets/icon.png` (ícone quadrado 1024 px), `app/assets/splash-icon.png`, `app/assets/android-icon-*.png` (Android adaptativo), `app/public/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png` e `favicon-48.png` (PWA). A foto de referência original está em `docs/marca/fusca-original.jpg`.
- **Personalidade pedida:** vermelho **acolhedor e amigável**, não agressivo. Nada frio ou corporativo. Fácil de reconhecer de longe, num celular simples.

### Cores

| Token | Cor | Uso |
|---|---|---|
| `primary` | `#D62828` (vermelho) | Botão principal, aba ativa, destaques, cor do tema do PWA |
| `primaryDark` | `#A61E1E` | Avisos em vermelho, sombra do botão |
| `onPrimary` | `#FFFFFF` | Texto sobre o vermelho (contraste 4,8:1 ou mais) |
| `background` / `surface` | `#FFFFFF` | Fundo das telas e dos cartões |
| `surfaceTint` | `#FFF4F1` (rosado) | Cartões de destaque, fundo do ícone |
| `surfaceMuted` | `#F3F1F0` (cinza quente) | Campos, botões secundários, atalhos |
| `text` / `ink` | `#1B1B1F` | Texto principal e ícones (contraste acima de 15:1) |
| `textMuted` | `#5B5559` | Texto de apoio (contraste acima de 7:1) |
| `border` / `borderStrong` | `#E9DEDB` / `#CBBBB7` | Bordas de cartões e campos |
| `dangerBg` | `#FDECEC` | Fundo de avisos de erro |
| `success` / `successBg` | `#1B6E2D` / `#E8F5EA` | Confirmações |

No mapa, o ponto da pessoa é **azul** (`#2B6CF6`), a origem é um círculo escuro, o destino é um quadrado vermelho e o motorista é um carrinho ou moto em emoji.

### Forma, tamanho e sensação

- **Letras:** corpo **20 px** no mínimo, títulos **32 px**, botões **20 px**, mais grossas (negrito) nos títulos e botões. Hoje usa a **fonte padrão do sistema** (ainda não há fonte própria).
- **Cantos:** arredondados (`radius`: 10, 14, 24 e "pílula"). Cartões e botões com cantos de 14 px.
- **Toque:** botões de **56 a 72 px** de altura (mínimo **60 px** nos principais). Um botão grande por tela.
- **Sombras:** suaves, para cartões; mais forte no painel que sobe sobre o mapa e nos botões que flutuam.
- **Ícones:** Ionicons (família de ícones de contorno e cheios), com texto sempre ao lado. Aba ativa fica **vermelha e em negrito** (não depende só da cor).
- **Textura de fundo** (`PatternBackground.tsx`): estilo do WhatsApp, com **carrinhos, pinos de localização, folhas de mapa e trajetos** em linha fina, vermelho bem claro, repetidos. Aparece só nas telas de entrada (login) e fica atrás do conteúdo.
- **Mapa:** os painéis (planilhas inferiores) sobem sobre o mapa com cantos de 24 px. Na web o mapa é do Google Maps; no servidor de teste, OpenStreetMap.

### Regras de acessibilidade (obrigatórias)

- Letras de **no mínimo 18 px** (corpo 20).
- Contraste de **pelo menos 4,5:1** em todo texto (as cores acima já passam).
- Alvos de toque de **56 a 72 px**.
- **Um botão principal por tela.** Botão de voltar sempre visível em listas longas.
- Nunca usar só cor para indicar estado; sempre texto ou ícone junto.
- Telas pensadas para uma mão, em pé, ao sol, por pessoa com pouca prática em celular.

### O que o app precisa de uma identidade nova

Ao propor uma nova identidade, entregue: logo (principal, só símbolo, versão em uma cor), paleta com os tokens acima (ou substitutos que passem no contraste), tipografia (com versão que carregue rápido na web), estilo de ícones, o ícone do app e a tela de abertura (splash), a textura do login, estilo dos marcadores do mapa (passageiro, origem, destino, carro, moto) e regras de uso. Os nomes dos tokens acima podem ser mantidos para a troca ser simples no código.

---

## Telas e fluxos

### Entrada

1. **Celular** — "Qual é o seu celular?": campo de telefone e botão "Receber código", com a textura de fundo, cartão de instalação do app e link para termos e privacidade. Login por **código SMS**, sem senha.
2. **Código** — digita o código de 6 dígitos recebido.
3. **Nome** — pergunta o nome na primeira vez.
4. **Foto** — selfie obrigatória pela câmera (sem galeria) para poder pedir corrida; o motorista vê a foto antes de aceitar.

### Passageiro

**Início:** mapa de fundo com a posição da pessoa (ponto azul), saudação "Oi, {nome}!", campo grande "Para onde vamos?", quatro atalhos (**Corrida**, **Para outra pessoa**, **Entrega**, **Meus motoristas**), aviso de viagem agendada ou proposta esperando, lembrete de mensalidade (para quem também é motorista), convite para ativar avisos e para instalar o app. No canto, o botão "Quero ser motorista" ou "Sou motorista". Barra de abas embaixo: **Início**, **Atividade** (histórico) e **Conta**.

**Pedir corrida na cidade:**
1. "Pra onde você vai?": destino por busca com sugestões e lugares frequentes.
2. "Como será a viagem?" (só entre cidades, veja abaixo).
3. **Escolha uma viagem:** lista de carro e moto com o preço de cada, formas de pagamento (só as que algum motorista online aceita; cartão custa 5% a mais).
4. **Acompanhamento:** "Procurando motorista", depois motorista a caminho (carro andando no mapa, tempo estimado, placa, modelo, cor, foto e nota), "Chegou", em corrida e "Corrida concluída" com avaliação de 1 a 5 estrelas. Chat com o motorista, botão **SOS** discreto e compartilhar trajeto.

**Viagem para outra cidade:** em "Pra onde você vai?" escolhe "Em outra cidade" e digita o **endereço** (qualquer endereço nas cidades vizinhas). Depois escolhe **só ida** ou **ida e volta** (com tempo de espera de 30 min a 4 h) e **quando**: agora ou outro dia (de 1 hora a 7 dias à frente). O app mostra o valor calculado. Os motoristas **aceitam esse valor** ou **propõem um valor maior** (até um limite). O passageiro vê **todas as respostas** e **escolhe**. Se for agendada, ele precisa tocar em **Confirmar viagem** no dia (veja regras).

**Entrega:** tamanhos P, M e G (com exemplos de pacote), preço da tabela com desconto, quem pede paga ao motorista, o motorista finaliza com um **código de 4 dígitos** de quem recebe. O passageiro copia uma mensagem pronta para o destinatário.

**Para outra pessoa:** pede a corrida em nome de um parente; o motorista vê o nome de quem vai andar.

**Conta/Configurações:** Minhas corridas (com painel de gastos), Meus motoristas (QR e código), Minha foto, Termos e privacidade, Excluir minha conta, Sair.

### Motorista

- **Cadastro:** dados pessoais (CPF, nascimento, CNH), veículo (modelo, cor, placa, ano 2010 ou mais, carro ou moto), documentos; depois **aguarda aprovação** da equipe, que acontece depois de uma reunião presencial. O app avisa na hora se o CPF já tem cadastro, com o telefone do suporte.
- **Início do motorista:** título "Você está online" ou "Você está offline", botão grande **Ficar online/offline**, lista de **chamados** (cartão com origem, destino, distância, valor, foto e nome do passageiro e formas de pagamento), avisos de mensalidade, atalhos para **Meu QR para clientes**, **Viagens agendadas**, **Configurações** e **Voltar ao início**.
- **Chamado:** o motorista **aceita** (ou recusa). Em viagem entre cidades pode **aceitar o valor calculado** ou **propor outro valor** (até o limite) e escolher o **adiantamento** (0%, 50% ou 100%).
- **Corrida:** mapa próprio com o passageiro se aproximando, botões "Cheguei", "Iniciar", "Finalizar", chat e SOS.
- **Configurações do motorista:** modos de pagamento aceitos, Minhas corridas (faturamento, quilômetros, horas online), Minha mensalidade (QR do Pix ou cartão), Passageiros bloqueados.
- **Mensalidade:** vencida, o app mostra uma tela de cobrança sozinho; em atraso longo o motorista fica impedido de receber chamados.

### Painel da equipe (web, em desktop)

Abas: **Motoristas** (aprovação com checklist), **Cadastrados** (todos, com busca, travar e destravar), **Passageiros**, **Preços**, **Cidades**, **Mensalidades**, **Relatórios**. Tela de login com e-mail e senha. Visual simples, de ferramenta interna (também pode ganhar a nova identidade).

---

## Como o preço funciona

Todos os valores abaixo vêm do banco e são editáveis no painel (aba **Preços**), por cidade e por veículo. Os números são os de hoje (**carro** primeiro, **moto** entre parênteses). Os passageiros e motoristas só veem o **preço final**, nunca a conta.

**Distância usada:** linha reta entre os dois pontos × 1,3 (para aproximar a estrada).

### Corrida dentro da cidade
- **Bandeirada** R$ 8,00 (moto R$ 5,00), mais **R$ 2,20 por km** (R$ 1,40) e **R$ 0,30 por minuto** (R$ 0,20), com o tempo contado a 30 km/h. Sem valor mínimo.
- **Km mais barato depois dos 4 primeiros km:** cada km a mais custa **R$ 0,60** (R$ 0,40), já com o tempo. Serve para sítios e distritos (ex.: Várzea dos Espinhos, uns R$ 30).
- **Preço dinâmico:** só sobe, nunca desconta. Quando faltam carros (pedidos esperando mais de 60 s sem motorista), o fator sobe em degraus de 10% (teto ×1,30), separado para carro e moto. É interno: ninguém vê aviso.
- **Adicional noturno:** +20% das 22h às 5h59, junto com o dinâmico, com teto total de ×1,50.
- **Cartão:** +5%.

### Viagem entre cidades
Bandeirada mais **três faixas de valor por km**, já com o tempo dentro:

| Faixa | Carro | Moto |
|---|---|---|
| Até 72 km | R$ 1,70 por km | R$ 1,20 |
| De 72 a 90 km (descida da serra) | R$ 6,70 por km | R$ 4,70 |
| Depois dos 90 km | R$ 2,72 por km | R$ 1,90 |

Exemplos (carro, só ida): Reriutaba R$ 47, São Benedito R$ 49, Ibiapina R$ 77, Ubajara R$ 95, Tianguá R$ 130, Sobral R$ 249, Fortaleza R$ 895. Não há fator dinâmico nem adicional noturno nesse tipo de viagem.

**Ida e volta:** preço da ida × **1,5**, com **2 horas de espera incluídas**. O que passar disso custa **R$ 0,10 por minuto de espera** (moto R$ 0,07). Exemplo, Ubajara carro: ida R$ 95, ida e volta R$ 143.

### Proposta do motorista
O motorista pode propor um valor **acima do calculado**, até **30%** (editável no painel). O total é o valor calculado mais o acréscimo.

### Entrega
Preço da tabela do veículo com **desconto de entrega** (editável).

### Mensalidade do motorista
Mês 1 grátis (um por CPF), mês 2 R$ 200, a partir do mês 3 R$ 300. Quem volta sem nunca ter pago paga R$ 200 e depois R$ 300.

---

## Regras de funcionamento

### Como o motorista é chamado (corrida de agora)
- O pedido vira uma **fila de motoristas**, do mais próximo ao mais longe, só entre motoristas **online, livres, do veículo pedido e que aceitam a forma de pagamento**. O primeiro vê na hora e cada próximo 15 segundos depois. Recusar libera o próximo na hora. O app pergunta ao servidor a cada 5 segundos.
- **Motorista favorito:** cada motorista tem um **código de 8 caracteres** e um QR. O passageiro que o adiciona faz com que o favorito seja chamado **primeiro**, sem mudar o preço.
- **Bloqueio:** o motorista pode escolher "Não atender este passageiro", sem avisar o passageiro.

### Viagem entre cidades de agora
O primeiro motorista que **aceita o valor calculado** fecha a viagem na hora, como numa corrida normal. Propostas de outro valor **esperam o passageiro escolher**. Se o passageiro escolher uma proposta, as outras caem; se o motorista escolhido desistir, as outras voltam.

### Viagem entre cidades agendada
Nada fecha sozinho: o passageiro vê **todas as respostas** e escolhe. Depois de fechada, precisa de **Confirmar viagem**:
- O botão libera **12 horas antes** e o prazo vai até **2 horas antes**.
- Fechada com menos de 2 horas, **já nasce confirmada**.
- **Sem confirmar, a viagem fica sem efeito**, o horário do motorista é liberado e ele é avisado.
- Se o motorista já recebeu **adiantamento**, a viagem não é anulada por falta de confirmação.
- Duas viagens do mesmo motorista a menos de 2 horas uma da outra são recusadas.
- Viagem agendada para daqui a mais de 1 hora **não trava ninguém**: o motorista e o passageiro podem fazer outras corridas.

### Pagamento
- O passageiro **paga direto ao motorista**. Cada motorista marca o que aceita (Pix, dinheiro, maquininha).
- **Adiantamento** (só viagem entre cidades): o motorista escolhe 0%, 50% ou 100%. Com 50% ou 100%, a corrida só inicia depois de o motorista tocar em "Recebi".

### Avaliação, chat e segurança
- Ao fim da corrida, **passageiro e motorista dão de 1 a 5 estrelas**. Cada um vê só a nota que ele mesmo deu.
- **Chat** só entre passageiro e motorista, enquanto a corrida está em andamento. **O telefone não aparece para ninguém**; números parecidos com telefone digitados no chat são trocados por "(número escondido)".
- **SOS:** segurar 5 segundos e confirmar abre o WhatsApp do plantão com a mensagem pronta (corrida, motorista, placa, localização).
- **Trajeto compartilhado:** link `/t/CODIGO` com posição ao vivo, primeiro nome do motorista, placa e status, que vence quando a corrida termina.
- **Posição:** o passageiro vê o carro andando e o motorista vê o passageiro se aproximando. A posição do motorista só atualiza com o app aberto e a tela ligada (limite da web).

### Conta
- **Uma conta, um celular:** quem entra num celular novo "toma" a conta; o antigo sai sozinho com aviso.
- **Excluir conta:** apaga nome, telefone, foto e login. O histórico fica para a outra pessoa sem o nome. Do motorista guarda só o hash do CPF, para ele não repetir o mês grátis.
- **Avisos:** são **locais** (aparecem com o app aberto ou em segundo plano). Ainda **não há push do servidor**. No iPhone só funcionam com o app instalado na tela inicial (iOS 16.4 ou mais).

---

## Painel da equipe

Página web (`painel/`, Vite + React + TypeScript). Entra com e-mail e senha; só quem está em `public.staff` usa as funções `staff_*`.

- **Motoristas:** aprovação com checklist depois da reunião presencial; o banco recusa aprovar se faltar algo.
- **Cadastrados:** todos os motoristas com telefone, veículo, cidade, corridas, nota, última posição e mensalidade; **travar** (com motivo que só a equipe vê) e **destravar**.
- **Passageiros:** lista com foto (cada visualização fica registrada).
- **Preços:** taxa do cartão, desconto da entrega, preço dinâmico, adicional noturno e teto, **ida e volta** (fator e horas de espera incluídas), limite da proposta do motorista, tamanhos de pacote, e a tabela de **tarifas por cidade e veículo** (bandeirada, por km, por minuto, faixas entre cidades, km mais barato na cidade, espera). Uma tarifa nova tem **data em que passa a valer**; a antiga fica de histórico.
- **Cidades:** adiciona cidade (nasce desativada, com latitude e longitude do centro) e ativa; só ativa se já tiver tarifa.
- **Mensalidades:** quem deve, id da cobrança, confirmar pagamento recebido por fora.
- **Relatórios:** alerta do mês 3 em diante (menos de 10 corridas), fuga (queda de corridas, muitas horas online com poucas corridas, duplas que pararam de andar juntas) e reavaliação semestral.

## Páginas públicas

- `/t/CODIGO` — trajeto compartilhado (sem login).
- `/m/CODIGO` — convite do motorista: explica como baixar o app e usar o código. Abrir o app por esse link favorita o motorista sozinho.
- Os **termos de uso e a política de privacidade** ficam dentro do app (tela de login e Configurações), com texto provisório à espera do advogado. Ainda não há páginas públicas `/termos` e `/privacidade`.

---

## Parte técnica

### Estrutura

```
app/         App Expo (React Native + TypeScript): Android, iOS e web (PWA)
supabase/    Banco: migrations (schema, RLS, funções), seed e testes de SQL
painel/      Painel da equipe (Vite + React)
pagamentos/  Função de cobrança do Asaas (Edge Function do Supabase)
docs/        Guia da equipe (EQUIPE.md), marca e planos
```

### Tecnologia
Expo SDK 58, React Native, TypeScript, Supabase (Postgres, Auth por telefone, Storage, Edge Functions), Google Maps JavaScript API e Places na web (no servidor de teste usa OpenStreetMap com Leaflet e Nominatim, de graça), Cloudflare Workers para hospedar app e painel, Asaas para a mensalidade (Pix e cartão), Vonage como provedor de SMS.

### Rodar o app

```bash
cd app
cp .env.example .env.local   # preencha com a URL e a chave do projeto Supabase
npm install
npm run web                  # http://localhost:8081
```

No celular com o Expo Go: `npx expo start` dentro de `app/` (o iPhone exige conta Expo logada). Contas de teste com código `123456`: `+5588900000001` a `04`. No servidor de teste (`localhost`) o app usa OpenStreetMap, sem precisar liberar o endereço na chave do Google.

Testes de lógica: `npm --prefix app test`. Tipos: `npx tsc --noEmit` em `app/` e `painel/`.

### Banco (Supabase)

1. Crie o projeto no supabase.com (o nosso fica numa região dos EUA).
2. Aplique as migrations: `npx supabase link --project-ref <ref>` e `npx supabase db push` (ou cole no SQL Editor; nesse caso marque como aplicada com `npx supabase migration repair --status applied <versão>`).
3. Em desenvolvimento, rode `supabase/seed.sql` no SQL Editor (cidades e tarifas).
4. Ative o login por telefone em Authentication > Providers > Phone, com um provedor de SMS.

**Regra de ouro:** o app **nunca altera tabelas diretamente**; usa funções do banco (`request_ride`, `accept_ride`, `propose_extra`, `respond_proposal`, `confirm_scheduled_ride`, `advance_ride`, `cancel_ride`, `quote_ride`, entre outras), protegidas por RLS.

Tabelas e funções principais: `rides`, `fares` (com `effective_from`), `pricing_settings`, `ride_proposals`, `ride_offers` (fila de motoristas), `price_quotes` (cotação vale 2 minutos), `drivers`, `driver_private` (CPF, nascimento e CNH, só o próprio motorista lê), `fee_schedule`, `driver_fee_periods`, `ride_messages`, `ride_ratings`, `profiles`.

Testes do banco (rodar no SQL Editor, terminam em ROLLBACK): `supabase/tests/fase1_foto_bloqueio.sql`, `fase2_asaas.sql`, `fase3_precos.sql`, `fase5_excluir_conta_painel.sql`.

### Painel (`painel/`)

```bash
cd painel
cp .env.example .env.local   # a mesma URL e chave publishable do app
npm install
npm run dev                  # http://localhost:5174
npm run build
```

Para liberar alguém, crie o usuário em Authentication > Users e rode no SQL Editor (troque o e-mail):

```sql
insert into public.staff (user_id)
select id from auth.users where email = 'equipe@exemplo.com';
```

### Publicação (Cloudflare Workers)

O app e o painel são sites estáticos. Em cada Worker, ligado a este repositório:

- **App** (Worker `simbora-app`): **Root directory** `app`, **Build command** `npm install && npm run build:web`, **Deploy command** `npx wrangler deploy` (configuração em `app/wrangler.jsonc`). Variáveis de build: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_KEY`, `EXPO_PUBLIC_SOS_WHATSAPP`, `EXPO_PUBLIC_SHARE_BASE_URL`, `EXPO_PUBLIC_GOOGLE_MAPS_KEY` e `NODE_VERSION` = `22`. A chave do Google só vale para os endereços cadastrados no console do Google.
- **Painel:** **Root directory** `painel`, **Build command** `npm run build`, **Deploy command** `npx wrangler deploy` (`painel/wrangler.jsonc`). Variáveis: `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY`, `VITE_DOWNLOAD_URL`, `NODE_VERSION` = `22`. As variáveis `VITE_*` e `EXPO_PUBLIC_*` são lidas **na hora de compilar**: depois de mudar uma, faça **Retry build**.

O app precisa de **HTTPS** (GPS, câmera e instalação exigem).

### Mensalidade do motorista (Asaas)

A cobrança de cada mês é gerada no Asaas (Pix ou cartão) pela Edge Function `asaas` (código e instruções em `pagamentos/`). A função guarda a chave do Asaas como segredo, o app pede a cobrança com o login do motorista e recebe valor, vencimento, Pix copia e cola e o link da fatura. Quando o pagamento cai, o Asaas avisa a função, que baixa o mês. Estados da mensalidade: `ok`, `pending` (antes do vencimento), `due` (venceu, ainda recebe chamados por 5 dias) e `overdue` (passou da tolerância: fica offline e sem chamados).

### Guia da equipe

O passo a passo do dia a dia (aprovar motorista, mexer em preço, travar conta) está em `docs/EQUIPE.md`.
