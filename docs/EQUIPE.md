# Guia da equipe Simbora Car

## Painel da equipe

Aprovar motoristas e mexer nos preços é no **Painel Simbora Car** (a página da equipe, com e-mail e senha). As outras tarefas deste guia ainda são feitas direto no Supabase.

- **Motoristas:** a lista abre em "Aguardando aprovação". Abra o cadastro, confira CPF, CNH e o veículo com os documentos originais, marque cada item do checklist e toque em **Aprovar motorista**. Se faltar algo, o botão avisa e o banco recusa dizendo o que falta. Também dá para **Suspender**, **Reativar** e **Bloquear**.
- **Preços:** taxa do cartão, o preço dinâmico (degraus, teto e trava), as tarifas dentro da cidade (para mudar, crie uma tarifa nova com a data em que passa a valer) e os preços entre cidades.

Se alguém novo da equipe precisar de acesso: crie o usuário em **Authentication > Users** e peça para o programador liberar o e-mail dele.

---

Tudo o que não está no painel é feito no painel do Supabase (supabase.com → projeto Simbora Car → **Table Editor**).

## Aprovar um motorista (depois da reunião presencial)

O motorista faz o cadastro pelo app (CPF, nascimento, CNH, veículo e aceite dos termos). Na reunião, a equipe confere os documentos originais e o carro ou a moto.

1. Abra a tabela **driver_private** e ache a linha do motorista pelo CPF. Confira com a CNH e o documento dele.
2. Abra a tabela **driver_checklist**, na mesma linha (o mesmo `driver_id`), e marque como `true` o que foi conferido:
   - `cnh_ok`: CNH válida, com a observação EAR
   - `criminal_record_ok`: antecedentes criminais
   - `crlv_ok`: documento do veículo em dia
   - `inspection_ok`: vistoria do veículo
   - só para moto: `helmets_ok` (dois capacetes), `vest_delivered` (colete entregue), `leg_guard_ok` (protetor de pernas) e `line_cutter_ok` (aparador de linha)
   O que o motorista declarou no cadastro (capacetes, protetor de pernas e aparador de linha) fica em **driver_private** (`declared_*`), só para você saber. Quem se cadastra sem algum item pode instalar até a vistoria: o que vale é o que você confere e marca aqui.
3. Abra a tabela **drivers**, ache a linha pela placa (`vehicle_plate`) e confira modelo, cor, placa e ano com o CRLV.
4. Mude `status` de `pending` para `approved`. Se faltar algo do checklist, o sistema recusa e diz o que falta.
5. Pronto: `approved_at` e o **mês grátis** começam sozinhos (ver `driver_subscriptions` e `driver_fee_periods`).
6. Avise o motorista: ele abre o app, toca em **Sou motorista** e depois em **Já fui aprovado**.

## Mensalidade

Cada motorista tem uma linha em **driver_subscriptions** (início do mês grátis, do contrato e o aniversário de 12 meses) e uma linha por mês em **driver_fee_periods**:

- `kind`: `free` (mês grátis), `entry` (R$ 200) ou `standard` (R$ 300). Os valores ficam em **fee_schedule**.
- `status`: `open` (a pagar), `paid` (pago) ou `waived` (dispensado, como o mês grátis).
- A cobrança é automática: o app do motorista gera o Pix e o link do cartão pelo Asaas e, quando o pagamento cai, o mês é baixado sozinho (`status` vira `paid`). É isso que faz o mês seguinte virar R$ 300.
- Se um pagamento entrou por fora do Asaas, ou o Asaas não avisou, abra a aba **Mensalidades** do painel e use **Confirmar pagamento recebido por fora**. Antes, confira no painel do Asaas se a cobrança aparece como recebida.
- Para passar do sandbox para valer: troque o segredo `ASAAS_API_KEY` e `ASAAS_BASE_URL` na Edge Function `asaas` do Supabase e registre o webhook de novo (ver `pagamentos/README.md`).

## Reavaliação a cada 6 meses (o motorista não vê)

Todo motorista aprovado volta a ser avaliado de 6 em 6 meses, sem aviso a ele. Nada disso aparece no app.

1. Abra a view **drivers_review_due**: quem vence primeiro fica no topo, e `days_left` mostra quantos dias faltam.
2. Refaça a conferência (antecedentes, CRLV, vistoria, CNH com EAR e, na moto, os itens de segurança) e confira as notas e reclamações.
3. Se estiver tudo certo, abra a tabela **driver_reviews** e coloque a data de hoje em `last_reviewed_on`. A próxima data (`next_review_on`) é calculada sozinha, 6 meses depois. Se quiser, anote em `notes`.
4. Se não estiver, suspenda ou bloqueie o motorista (próxima seção).

## Nota dos motoristas

A view **driver_stats** mostra, para cada motorista: corridas concluídas, quantas avaliações recebeu, a nota média e a **nota ajustada** (com poucas avaliações ela puxa para 4,5, para não oscilar), a taxa de aceite, a taxa de cancelamento e a **score** de 0 a 100.

- Motorista com menos de 20 corridas aparece como `is_new` e sem score: a prioridade dele é neutra.
- A taxa de aceite conta só o que o motorista decidiu: aceitou contra recusou. Pedido que ele deixou passar não conta.
- Por enquanto a score só é calculada. No despacho, o motorista mais próximo chama primeiro. Os pesos (60% nota, 20% aceite, 20% sem cancelamento) e as faixas de prioridade valem ser ajustados depois de 30 dias de dados reais.

## Suspender ou bloquear

Na mesma tabela, mude `status` para:

- `suspended`: afastado por um tempo (reclamação, documento vencido).
- `blocked`: fora do Simbora Car.

Se ele estiver online, mude também `is_online` para `false`.

## Ver corridas

Tabela **rides**. Filtre por `status`:

- `requested`: esperando motorista
- `accepted`, `arrived`, `in_progress`: em andamento
- `completed`: concluídas
- `cancelled`: canceladas

## Preços e tarifas

O jeito mais simples é o painel: abas **Preços** e **Cidades**. Por trás ficam estas tabelas (**Table Editor**):

- **fares**: tarifa de cada veículo (bandeirada `base`, `per_km`, `per_min`), sem valor mínimo. Para mudar o preço, **crie uma linha nova** com `effective_from` na data em que vale; a mais recente que já começou é a que vale, e a antiga fica de histórico.
- **Viagem para outra cidade**: não há preço fechado por rota. O preço é calculado pela distância do endereço até onde o passageiro está (linha reta × 1,3), na tarifa da cidade de origem: bandeirada mais três faixas de valor por km (já com o tempo dentro). Hoje, no carro: até 72 km R$ 1,70 por km, de 72 a 90 km R$ 6,70 por km (descida da serra) e depois dos 90 km R$ 2,72 por km. As faixas e o valor de cada uma ficam em Preços, por cidade e veículo.
- **Ida e volta**: preço da ida × o fator de Preços (hoje 1,5), com as horas de espera incluídas (hoje 2 horas). O que passar das horas incluídas cobra o valor de espera por minuto da tarifa.
- **Corrida dentro da cidade longa**: depois de certa distância (hoje 4 km) o km passa a valer menos (hoje R$ 0,60 por km no carro, já com o tempo). Serve para sítios e distritos, como a Várzea dos Espinhos (uns R$ 30).
- **Cidades** (aba Cidades): adiciona cidade (nasce desativada, com latitude e longitude do centro) e ativa ou desativa. Só ativa se a cidade já tiver tarifa cadastrada na aba Preços.
- **Adicional noturno**: +20% das 22h às 5h59 (horário de Fortaleza), só na corrida dentro da cidade (não vale na entrega nem entre cidades). Soma com o preço dinâmico e o total nunca passa do teto de ×1,50. Os quatro valores (adicional, hora que começa, hora que termina e teto) ficam em Preços. O passageiro e o motorista **não** veem nenhum aviso: só o preço final.
- Espera da ida e volta além das horas incluídas: usa o valor de espera por minuto da tarifa (hoje R$ 0,10 por minuto no carro).
- **pricing_settings**: o preço dinâmico (aumento só quando falta carro). `locked = true` trava o fator em `locked_factor`; para ver como está agindo, olhe `city_pricing_state` (degrau atual por cidade e veículo) e `ride_pricing` (fator de cada corrida). Nenhuma dessas tabelas aparece no app.

## SOS

O botão de SOS abre o WhatsApp do plantão com a mensagem pronta (corrida, motorista, placa e localização), e a pessoa só precisa tocar em enviar. O número do plantão fica no arquivo `app/.env.local` (`EXPO_PUBLIC_SOS_WHATSAPP`); ao trocar, reinicie o `npx expo start`. A equipe aciona a ambulância ou a polícia conforme o caso.

## Viagem entre cidades

O passageiro digita só o endereço, escolhe ida ou ida e volta (com a espera) e quando quer ir (hoje ou outro dia). O app mostra o valor calculado.

- **Motorista:** aceita o valor ou propõe um valor maior, até o limite definido em **Preços** ("Limite da proposta do motorista", 30% no começo). Ele escolhe o adiantamento (sem, 50% ou 100%) ao aceitar ou propor. O passageiro paga direto a ele, e o motorista toca em "Recebi" para poder iniciar a viagem. A equipe não participa do pagamento.
- **Hoje:** quem aceita o valor calculado leva a viagem na hora (o primeiro). Propostas de outro valor esperam o passageiro escolher.
- **Agendada:** nenhum aceite fecha sozinho. O passageiro vê todas as opções (aceites do valor e propostas) e escolhe.
- **Confirmação no dia (agendada):** depois de fechada, o passageiro confirma a viagem entre 12 h e 2 h antes da hora marcada. Se ela for fechada com menos de 2 h de antecedência, já vale. Sem confirmar, a viagem fica sem efeito e o horário do motorista é liberado. Pedido agendado que ninguém aceita até a hora marcada é cancelado.
- Os avisos são do app (aparecem com o app aberto ou em segundo plano). Com o app fechado por completo eles não chegam.

## Foto de passageiro (só para denúncia)

Na aba **Passageiros** do painel, busque pelo nome ou telefone (3 letras ou números no mínimo) e toque em **Ver foto**. Use só para investigar uma denúncia. O sistema registra quem abriu a foto e quando: para conferir, rode no SQL Editor `select * from public.photo_views order by id desc;`.

## Quem pede para excluir a conta

A própria pessoa exclui pelo app (**Excluir minha conta**). O banco apaga nome, telefone e login e guarda só um código irreversível do CPF do motorista. Se o pedido chegar por outro canal, peça para ela mesma excluir pelo app.

## Código de login por SMS

O código que a pessoa recebe ao entrar é enviado pela **Comtele**, por uma função do Supabase chamada `send-sms` (o "Send SMS Hook" em Authentication > Hooks). Cada SMS custa cerca de R$ 0,12 (rota 17, "Premium").

- **Saldo:** o crédito fica no painel da Comtele (portal.comtele.com.br) e não vence. Se o saldo acabar, ninguém recebe o código e não dá para entrar: confira o saldo antes de campanhas de divulgação.
- **Segredos:** ficam em Edge Functions > Secrets: `COMTELE_API_KEY`, `COMTELE_ROUTE` (17) e `SEND_SMS_HOOK_SECRET` (gerado ao ativar o hook). A função fica com "Verify JWT" desligado de propósito, porque ela confere a assinatura do hook por conta própria.
- **Se o código não chega:** veja Edge Functions > send-sms > Logs (o código do SMS nunca aparece no log, só o final do telefone) e o relatório de entregas no painel da Comtele.
- **Limite de envios:** ajuste em Authentication > Rate Limits, para ninguém gastar o saldo pedindo código em excesso.

## Avisos com o app fechado (Web Push)

Sem isto, o aviso só chega com o app aberto ou logo depois de ir para o segundo plano. No iPhone o app é "congelado" em segundo plano, então **sem o push do servidor nenhum aviso chega**. Com o push, o motorista recebe o pedido de corrida e o passageiro recebe "motorista a caminho", "chegou", "iniciada" e "concluída", propostas de viagem entre cidades, mensagens do chat e o lembrete de confirmar a viagem agendada. Tocar no aviso abre o app.

No iPhone só funciona com **iOS 16.4 ou mais** e com o app **instalado na tela inicial** (Compartilhar > Adicionar à Tela de Início), com os avisos ligados dentro do app. Você faz isto uma vez só, sem terminal:

1. **Gerar as chaves.** Abra qualquer página do navegador no computador, aperte **F12**, vá na aba **Console**, cole o código abaixo e dê Enter. Ele roda só no seu computador e mostra duas linhas: PUBLICA e PRIVADA. A **PRIVADA é secreta**: não mande para ninguém, nem para o chat, nem escreva em arquivo do projeto. Guarde as duas num lugar seguro (gerenciador de senhas). Se perder, gere outro par (todo mundo precisa ligar os avisos de novo).

   ```js
   const k = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
   const b = (u) => btoa(String.fromCharCode(...new Uint8Array(u))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
   console.log('PUBLICA:', b(await crypto.subtle.exportKey('raw', k.publicKey)));
   console.log('PRIVADA:', (await crypto.subtle.exportKey('jwk', k.privateKey)).d);
   ```

2. **Criar a senha entre o banco e a função.** Invente uma senha longa (30 letras e números) e guarde: é o `PUSH_SECRET`.
3. **Publicar a função.** No Supabase: **Edge Functions > Deploy a new function > Via Editor**, nome `push`, cole o conteúdo de `supabase/functions/push/index.ts` e publique. Depois, nas configurações da função, **desligue "Verify JWT"** (quem chama é o banco, que prova quem é pelo `PUSH_SECRET`).
4. **Colar os segredos.** Em **Edge Functions > Secrets**, crie:
   - `VAPID_PUBLIC_KEY`: a chave PUBLICA do passo 1
   - `VAPID_PRIVATE_KEY`: a chave PRIVADA do passo 1
   - `VAPID_SUBJECT`: `mailto:` e um e-mail da equipe (ex.: `mailto:equipe@seudominio.com.br`)
   - `PUSH_SECRET`: a senha do passo 2
5. **Aplicar a migration.** No **SQL Editor**, cole o conteúdo de `supabase/migrations/20261110000000_web_push.sql` e rode. Se aparecer aviso sobre `pg_net`, ative em **Database > Extensions** (procure `pg_net`) e rode de novo.
6. **Ligar o banco à função.** No SQL Editor, rode (troque o endereço do seu projeto e a senha do passo 2):

   ```sql
   insert into private.push_config (id, url, secret)
   values (1, 'https://SEU-PROJETO.supabase.co/functions/v1/push', 'A-SENHA-DO-PASSO-2')
   on conflict (id) do update set url = excluded.url, secret = excluded.secret;
   ```

7. **Chave pública no app.** No Cloudflare, no Worker `simbora-app`, crie a variável de build `EXPO_PUBLIC_VAPID_PUBLIC_KEY` com a chave PUBLICA e faça **Retry build** (variáveis `EXPO_PUBLIC_*` só valem depois de recompilar).
8. **Testar.** No iPhone, abra o app instalado, toque em **Ligar avisos** e permita. Feche o app. Faça outro celular pedir uma corrida: o aparelho do motorista deve tocar.

**Se não chegar:** veja **Edge Functions > push > Logs** (o log mostra o erro do envio, nunca o endereço do aparelho). Confira também se `private.push_config` tem a linha (`select id, url from private.push_config;`), se o motorista está online e se o aparelho tem a permissão ligada em Ajustes do iPhone > Notificações > Simbora Car. A inscrição de quem sai da conta, exclui a conta ou desinstala o app é apagada sozinha. Para conferir os testes do banco, rode `supabase/tests/web_push.sql` no SQL Editor: cada linha deve terminar em `ok`.

**Limites:** o pedido de corrida chega ao motorista na vez dele na fila (a cada 15 s por motorista), mas a função espera no máximo 100 s; quem estiver muito atrás na fila recebe o aviso mais cedo que a vez dele, só se o pedido ainda estiver aberto. O lembrete de confirmar a viagem agendada depende da rotina do banco (`pg_cron`); se o projeto não permitir, só o aviso local do app lembra.
