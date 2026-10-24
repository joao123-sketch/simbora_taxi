# Guia da equipe Simbora Car

Tudo é feito no painel do Supabase (supabase.com → projeto Simbora Car → **Table Editor**).

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
- Quando o motorista pagar o Pix do mês, mude `status` para `paid` e preencha `paid_at`. É isso que faz o mês seguinte virar R$ 300.

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

Tudo em **Table Editor**:

- **fares**: tarifa de cada veículo (bandeirada `base`, `per_km`, `per_min`, `minimum`). Para mudar o preço, **crie uma linha nova** com `effective_from` na data em que vale; a mais recente que já começou é a que vale, e a antiga fica de histórico.
- **intercity_fares**: preço fechado de cada cidade de destino, por veículo.
- Espera da ida e volta: usa o `per_min` da tarifa (hoje R$ 0,30 por minuto no carro).
- **pricing_settings**: o preço dinâmico (aumento só quando falta carro). `locked = true` trava o fator em `locked_factor`; para ver como está agindo, olhe `city_pricing_state` (degrau atual por cidade e veículo) e `ride_pricing` (fator de cada corrida). Nenhuma dessas tabelas aparece no app.

## SOS

O botão de SOS abre o WhatsApp do plantão com a mensagem pronta (corrida, motorista, placa e localização), e a pessoa só precisa tocar em enviar. O número do plantão fica no arquivo `app/.env.local` (`EXPO_PUBLIC_SOS_WHATSAPP`); ao trocar, reinicie o `npx expo start`. A equipe aciona a ambulância ou a polícia conforme o caso.

## Viagem entre cidades

O motorista escolhe o adiantamento (sem, 50% ou 100%) ao aceitar ou propor. O passageiro paga direto a ele, e o motorista toca em "Recebi" para poder iniciar a viagem. A equipe não participa do pagamento.

## Quem pede para excluir a conta

A própria pessoa exclui pelo app (**Excluir minha conta**). O banco apaga nome, telefone e login e guarda só um código irreversível do CPF do motorista. Se o pedido chegar por outro canal, peça para ela mesma excluir pelo app.
