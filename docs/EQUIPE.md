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
