# Viagem entre cidades por proposta — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o valor fixo por rota entre cidades por preço calculado pela métrica normal a partir do endereço, com propostas de motoristas (teto configurável), escolha do passageiro e confirmação no dia da viagem agendada.

**Architecture:** O banco já tem boa parte do fluxo: `propose_extra` / `respond_proposal` / `get_ride_proposals` (proposta = acréscimo sobre `estimated_price`), `accept_ride` (hoje, primeiro que aceita leva), `accept_scheduled_ride`, `open_scheduled_rides` e a tela de proposta do passageiro em `RideStatusScreen`. O plano mantém a proposta como acréscimo (`extra_amount`, a tela mostra o total = preço + acréscimo), só muda o que o design pede: preço sem tabela de rotas, teto, aceite agendado virando opção, confirmação no dia, avisos, sem "Onde deixar".
**Tech Stack:** Supabase (Postgres, migrations em `supabase/migrations`, aplicadas colando no SQL Editor), Expo/React Native web em `app/` (testes `npm test` com `tsx --test src/lib/*.test.ts`), painel React/Vite em `painel/`.

**Spec:** `docs/superpowers/specs/2026-11-03-viagem-entre-cidades-design.md`

## Global Constraints

- Hoje: aceitar o valor calculado fecha na hora (primeiro leva). Proposta de outro valor vira opção e o passageiro escolhe. Agendada: nada fecha sozinho; aceite do valor calculado também vira opção.
- Teto da proposta: percentual único no painel, 30% inicial, vale para carro e moto. Motorista não propõe abaixo do calculado (aceitar o calculado é o mínimo).
- Espera: `fares.per_min` da cidade de origem × minutos; ida e volta = ida dobrada + espera (já é assim em `quote_ride`). O app oferece 1h a 4h; o servidor aceita até 8h (`wait_minutes` 0..480).
- Confirmação no dia (só agendada fechada): botão libera 12h antes; prazo até 2h antes; fechada com menos de 2h de antecedência não exige confirmação; sem confirmar às 2h a viagem fica sem efeito e o motorista é avisado.
- Pedido agendado aberto até o horário da viagem; sem proposta até lá, cancela e avisa o passageiro.
- Avisos só locais (`app/src/lib/notify.ts`), sem push de servidor.
- `intercity_fares` é apagada (o dono mandou). Corridas antigas continuam legíveis. Pagamento adiantado (0/50/100%) continua como hoje, escolhido pelo passageiro ao fechar.
- Textos do app em português do Brasil; comentários no estilo do código vizinho (português).
- Migrations novas começam em `20261107000000_*` (a última existente é `20261106000000_cpf_ja_cadastrado.sql`).

## Review Focus

- Motorista propõe acréscimo acima do teto, ou negativo/zero em "outro valor": o banco recusa com mensagem em português (Task 2).
- Dois motoristas fecham a mesma corrida de hoje ao mesmo tempo: só o primeiro leva, o outro recebe "Corrida indisponível" (Task 2).
- Passageiro aceita proposta de motorista que ficou offline/ocupado entre o envio e a escolha: proposta vira `withdrawn` e o passageiro vê aviso (já existe em `respond_proposal`; manter) (Task 2).
- Viagem agendada fechada a menos de 2h da hora: nasce confirmada, nunca é anulada (Task 3).
- Confirmar fora da janela (mais de 12h antes, ou depois das 2h): o banco recusa (Task 3).
- Endereço de destino longe de todas as nossas cidades: o preço segue a distância do endereço até onde o passageiro está (sem bloqueio); a cidade registrada no pedido é só a outra cidade ativa mais próxima (Task 5).
- Antes de apagar `intercity_fares`, nenhuma função do painel ou do app pode ainda lê-la (Task 1).

---

## Mapa de arquivos

| Arquivo | O que muda |
|---|---|
| `supabase/migrations/20261107000000_preco_entre_cidades.sql` | Cria: `ride_quote` intercity pela tarifa da origem, coluna do teto, remove `intercity_fares` e funções do painel de rotas |
| `supabase/migrations/20261107010000_propostas_entre_cidades.sql` | Cria: teto em `propose_extra`, acréscimo 0 permitido, aceite agendado vira proposta, aceite de hoje derruba propostas |
| `supabase/migrations/20261107020000_confirmar_viagem.sql` | Cria: `confirmed_at`, `confirm_scheduled_ride`, `void_unconfirmed_rides`, ajustes em `respond_proposal`/`open_scheduled_rides` |
| `app/src/lib/intercity.ts` + `intercity.test.ts` | Cria: funções puras: limites da proposta, janela de confirmação, cidade mais próxima, eventos de aviso |
| `app/src/lib/rides.ts`, `scheduling.ts` | Muda | Tipos e chamadas novas (`confirmScheduledRide`, `fetchProposalCap`), sem `dropoffPlace` |
| `app/src/screens/DestinationScreen.tsx`, `CityDropoffScreen.tsx` (vira `TripOptionsScreen.tsx`), `PassengerFlow.tsx`, `ConfirmRideScreen.tsx`, `RideStatusScreen.tsx`, `ScheduledListScreen.tsx` | Muda | Fluxo do passageiro |
| `app/src/screens/driver/OpenRequestCard.tsx`, `ScheduledTripsScreen.tsx`, `DriverRideScreen.tsx`, `DriverHomeScreen.tsx` | Muda | Fluxo do motorista |
| `painel/src/pages/Routes.tsx`, `App.tsx`, `Prices.tsx` | Remove/Muda | Sai a tela de rotas, entra o teto |
| `docs/EQUIPE.md` | Muda | Guia da equipe sem rotas fixas |

---

### Task 1: Preço entre cidades pela métrica e fim das rotas fixas

**Files:**
- Create: `supabase/migrations/20261107000000_preco_entre_cidades.sql`

**Interfaces:**
- Consumes: `private.ride_quote(p_city_id bigint, p_vehicle_type vehicle_type, p_origin geography, p_destination geography, p_destination_city_id bigint) returns table (price numeric, distance_km numeric)`; `public.fares`; `public.pricing_settings`; `public.staff_pricing_overview()` e `public.staff_set_pricing_settings(jsonb)` (versões de `20261104000000_precos_fase3.sql`).
- Produces: `pricing_settings.proposal_cap numeric(4,2) not null default 0.30 check (proposal_cap between 0 and 1)`; `public.proposal_cap() returns numeric` (authenticated); `staff_set_pricing_settings` aceita `proposal_cap` no patch; `intercity_fares`, `staff_set_intercity_price`, `staff_delete_intercity_pair` deixam de existir.

- [ ] **Step 1: Listar tudo que depende de `intercity_fares`**

Run: `grep -n "intercity_fares" supabase/migrations/*.sql app/src painel/src -r`
Expected: funções em `20261024080000_painel_da_equipe.sql`, `20261025010000_entrega.sql` (`staff_pricing_overview` do período), `20261104000000_precos_fase3.sql` (`ride_quote`, `staff_pricing_overview`, `staff_set_intercity_price`, `staff_delete_intercity_pair`). Anotar cada função: todas precisam ser recriadas sem a tabela antes do `drop table`.

- [ ] **Step 2: Escrever a migration**

Em `20261107000000_preco_entre_cidades.sql`, nesta ordem:
1. `alter table public.pricing_settings add column proposal_cap numeric(4, 2) not null default 0.30 check (proposal_cap between 0 and 1);`
2. `create or replace function private.ride_quote(...)` com a mesma assinatura: o ramo `if p_destination_city_id is not null and p_destination_city_id <> p_city_id` deixa de consultar `intercity_fares` e cai na mesma conta da tarifa da cidade de origem (`base + per_km × km + per_min × (km/30×60)`, `km` = distância reta × 1.3). Remover o `raise exception 'Sem preço para essa cidade'`.
3. `create or replace function public.staff_pricing_overview()` sem a chave `'intercity'` (copiar a versão da Fase 3 e tirar só esse bloco; `settings` já sai por `to_jsonb(s)`, então `proposal_cap` aparece sozinho).
4. `create or replace function public.staff_set_pricing_settings(p_patch jsonb)` com a linha `proposal_cap = coalesce((p_patch ->> 'proposal_cap')::numeric, s.proposal_cap),` (copiar a versão da Fase 3 inteira).
5. `drop function public.staff_set_intercity_price(...)` e `drop function public.staff_delete_intercity_pair(bigint, bigint)` (usar as assinaturas exatas lidas no Step 1), depois `drop table public.intercity_fares;`.
6. `public.proposal_cap()`: `language sql stable security definer set search_path = ''`, `select s.proposal_cap from public.pricing_settings s where s.id = 1;`, `revoke ... from public, anon; grant execute ... to authenticated;`.

- [ ] **Step 3: Verificar localmente por leitura**

Run: `grep -n "intercity_fares" supabase/migrations/20261107000000_preco_entre_cidades.sql`
Expected: só aparece no `drop table`. Nenhuma função recriada na migration cita a tabela.

- [ ] **Step 4: Aplicar e conferir no Supabase**

Colar a migration no SQL Editor (a pessoa clica em Run). Depois rodar:
```sql
select p.proposal_cap from public.pricing_settings p where id = 1;  -- 0.30
select to_regclass('public.intercity_fares');                        -- null
```
E uma cotação de teste logado como passageiro (`select * from public.quote_ride(<city_origem>, <lng>, <lat>, <lng>, <lat>, <city_destino>)` com coordenadas de São Benedito): devolve uma linha para `car` e uma para `moto`, com `price > 0` e sem erro "Sem preço".

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261107000000_preco_entre_cidades.sql
git commit -m "Entre cidades: preço pela tarifa da cidade, teto da proposta no painel e fim das rotas fixas"
```

---

### Task 2: Propostas com teto e aceite que respeita hoje e agendada

**Files:**
- Create: `supabase/migrations/20261107010000_propostas_entre_cidades.sql`

**Interfaces:**
- Consumes: `private.is_intercity(p_ride public.rides) returns boolean`, `private.can_see_offer(bigint)`, `private.can_take_scheduled(public.rides, uuid)`, `private.is_ride_passenger(bigint)`, `public.proposal_cap()` (Task 1), tabelas `rides`, `ride_proposals`, `ride_offers`.
- Produces: `propose_extra(p_ride_id bigint, p_extra numeric, p_advance_percent int default null)` com teto; `accept_ride(bigint, int)` que derruba propostas pendentes; `accept_scheduled_ride(bigint, int)` que cria proposta com acréscimo 0 (não fecha); `ride_proposals.extra_amount` aceita 0.

- [ ] **Step 1: Escrever a migration**

1. `alter table public.ride_proposals drop constraint <nome da check de extra_amount>` (descobrir o nome com `select conname from pg_constraint where conrelid = 'public.ride_proposals'::regclass and contype = 'c';`) e recriar `check (extra_amount >= 0 and extra_amount <= 500)`.
2. `create or replace function public.propose_extra(p_ride_id bigint, p_extra numeric, p_advance_percent int default null)`: partir da versão de `20261025040000_viagens_agendadas.sql`, trocar o filtro `(r.destination_place is not null or r.round_trip or r.scheduled_for is not null)` por `private.is_intercity(r)`, e trocar a validação do acréscimo por: `v_extra > 0` e `v_extra <= round(v_ride.estimated_price * public.proposal_cap(), 2)`, com mensagens `'Proponha um valor acima do calculado'` e `'O valor passa do limite de %% sobre o calculado'` (formatar o limite em %).
3. `create or replace function public.accept_ride(p_ride_id bigint, p_advance_percent int default null)`: partir da versão de `20261024040000_adiantamento_no_aceite.sql` e, depois do `update public.rides`, acrescentar `update public.ride_proposals set status = case when driver_id = auth.uid() then 'withdrawn'::public.proposal_status else 'declined'::public.proposal_status end where ride_id = p_ride_id and status = 'pending';`.
4. `create or replace function public.accept_scheduled_ride(p_ride_id bigint, p_advance_percent int)`: mesma validação de hoje (`can_take_scheduled`, adiantamento 0/50/100, `for update`), mas em vez de atualizar `rides` faz `insert into public.ride_proposals (ride_id, driver_id, extra_amount, advance_percent) values (p_ride_id, auth.uid(), 0, p_advance_percent) on conflict (ride_id, driver_id) do update set extra_amount = 0, advance_percent = excluded.advance_percent, status = 'pending', created_at = now() where ride_proposals.status in ('pending','withdrawn');` (se não atualizou nada: `raise exception 'O passageiro já recusou a sua proposta'`).
5. Garantir `grant execute` das três funções para `authenticated` e `revoke ... from public, anon`.

- [ ] **Step 2: Aplicar e testar no SQL Editor (dentro de `begin; ... rollback;`)**

Com um pedido intercity de teste aberto (`estimated_price` = 100, `proposal_cap` = 0.30), como motorista aprovado da cidade:
```sql
select public.propose_extra(<ride>, 31);   -- erro: passa do limite
select public.propose_extra(<ride>, 0);    -- erro: proponha um valor acima do calculado
select public.propose_extra(<ride>, 30);   -- ok
select public.accept_scheduled_ride(<ride_agendada>, 0); -- ok; rides.status continua 'requested' e há proposta pending com extra_amount 0
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20261107010000_propostas_entre_cidades.sql
git commit -m "Propostas entre cidades: teto, aceite agendado vira opção e aceite de hoje derruba as outras"
```

---

### Task 3: Confirmação da viagem agendada

**Files:**
- Create: `supabase/migrations/20261107020000_confirmar_viagem.sql`

**Interfaces:**
- Consumes: `public.respond_proposal(bigint, boolean)` (versão de `20261025040000_viagens_agendadas.sql`), `public.open_scheduled_rides()`, `public.expire_scheduled_rides()`.
- Produces: `rides.confirmed_at timestamptz`, `rides.void_reason text`; `public.confirm_scheduled_ride(p_ride_id bigint) returns void`; `public.void_unconfirmed_rides() returns int`; `respond_proposal` grava `confirmed_at = now()` quando `scheduled_for is null` ou falta menos de 2h; `expire_scheduled_rides` chama `void_unconfirmed_rides`.

- [ ] **Step 1: Escrever a migration**

1. `alter table public.rides add column confirmed_at timestamptz, add column void_reason text;`
2. `create or replace function public.respond_proposal(...)`: copiar a versão atual e, no `update public.rides` do aceite, acrescentar `confirmed_at = case when scheduled_for is null or scheduled_for <= now() + interval '2 hours' then now() end` (aproveitar também para garantir que `extra_amount = v_prop.extra_amount` continua funcionando com 0).
3. `public.confirm_scheduled_ride(p_ride_id bigint)`: `security definer`; `update public.rides set confirmed_at = now() where id = p_ride_id and passenger_id = auth.uid() and status = 'accepted' and scheduled_for is not null and confirmed_at is null and scheduled_for <= now() + interval '12 hours' and scheduled_for > now() + interval '2 hours'`; se não atualizou: `raise exception 'Ainda não dá para confirmar essa viagem'` quando falta mais de 12h, `'O prazo para confirmar acabou'` quando falta menos de 2h; qualquer outro caso: `'Viagem não encontrada'`.
4. `public.void_unconfirmed_rides() returns int`: `update public.rides set status = 'cancelled', cancelled_at = now(), void_reason = 'not_confirmed' where status = 'accepted' and scheduled_for is not null and confirmed_at is null and scheduled_for <= now() + interval '2 hours'` e devolve `row_count`. Libera o horário do motorista porque `scheduled_conflict` só olha `status = 'accepted'`.
5. Redefinir `public.expire_scheduled_rides()`: o pedido agendado aberto (`status = 'requested'`) vence na hora marcada (`scheduled_for < now()`, no lugar dos 15 minutos de hoje), e a função também faz `perform public.void_unconfirmed_rides();` (ela já roda dentro de `open_scheduled_rides()` e de `fetchMyScheduled`/`expireScheduled` no app).
6. Rotina agendada, opcional: se o projeto permitir, `create extension if not exists pg_cron;` e `select cron.schedule('void-unconfirmed-rides', '*/10 * * * *', 'select public.void_unconfirmed_rides()');` dentro de um bloco `do $$ begin ... exception when others then null; end $$;` para não quebrar se não houver permissão.
7. `grant execute` das funções públicas a `authenticated`, `revoke ... from public, anon`.

- [ ] **Step 2: Aplicar e testar no SQL Editor (`begin; ... rollback;`)**

Criar corridas de teste agendadas e aceitas e conferir:
```sql
-- falta 20h: confirm_scheduled_ride -> erro 'Ainda não dá para confirmar essa viagem'
-- falta 10h: confirm_scheduled_ride -> ok, confirmed_at preenchido
-- aceita com falta 1h30 (respond_proposal): confirmed_at já preenchido; void_unconfirmed_rides() não cancela
-- aceita, não confirmada, falta 1h50: void_unconfirmed_rides() devolve 1; status = 'cancelled', void_reason = 'not_confirmed'
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20261107020000_confirmar_viagem.sql
git commit -m "Viagem agendada: confirmação no dia, e sem confirmar a viagem fica sem efeito"
```

---

### Task 4: Regras puras do app (limites, janela, cidade, eventos)

**Files:**
- Create: `app/src/lib/intercity.ts`
- Test: `app/src/lib/intercity.test.ts`

**Interfaces:**
- Consumes: tipo `City` de `app/src/lib/rides.ts` (campos `id`, `lat`, `lng`).
- Produces (exatamente estas assinaturas, usadas pelas Tasks 5 a 7):
  - `proposalLimit(estimatedPrice: number, cap: number): number` — acréscimo máximo, em reais, arredondado a 2 casas.
  - `type ConfirmState = 'not_needed' | 'too_early' | 'open' | 'expired'` e `confirmState(scheduledFor: string, confirmedAt: string | null, now: Date): ConfirmState`.
  - `nearestCity(point: { lat: number; lng: number }, cities: City[]): City | null` — a cidade mais próxima do ponto entre as recebidas (o chamador passa só as outras cidades ativas), `null` se a lista vier vazia; sem limite de distância (usa `distanceKm` de `app/src/lib/geo.ts`).
  - `type TripSnapshot = { status: string; proposals: number; confirmedAt: string | null; voided: boolean }` e `tripEvents(prev: TripSnapshot | null, next: TripSnapshot, role: 'passenger' | 'driver'): { title: string; body: string; tag: string }[]`.

- [ ] **Step 1: Escrever os testes (devem falhar)**

Em `intercity.test.ts` (padrão `node:test`, como `feeReminder.test.ts`):
```ts
test('proposalLimit: 30% de 100 é 30', () => assert.equal(proposalLimit(100, 0.3), 30));
test('proposalLimit arredonda a 2 casas', () => assert.equal(proposalLimit(33.33, 0.3), 10));
test('confirmState: confirmada -> not_needed', () => ...);
test('confirmState: 20h antes -> too_early; 12h -> open; 1h59 -> expired', () => ...);
test('nearestCity: devolve a mais próxima', () => ...);
test('nearestCity: lista vazia -> null', () => ...);
test('tripEvents passageiro: proposals 0 -> 1 gera "Nova proposta"', () => ...);
test('tripEvents passageiro: status accepted -> cancelled gera aviso de cancelamento', () => ...);
test('tripEvents motorista: voided true gera "Viagem sem efeito"', () => ...);
test('tripEvents: mesmo snapshot não gera nada', () => assert.deepEqual(tripEvents(s, s, 'passenger'), []));
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm --prefix app test`
Expected: FAIL (módulo `intercity` não existe).

- [ ] **Step 3: Implementar `intercity.ts`**

Assinaturas acima. `confirmState`: `confirmedAt` não nulo → `not_needed`; faltam mais de 12h → `too_early`; entre 12h e 2h → `open`; menos de 2h → `expired`. `tripEvents` gera: nova proposta (passageiro, `proposals` subiu), proposta aceita/viagem fechada (motorista, `status` passou a `accepted`), cancelamento (`status` passou a `cancelled` sem `voided`), viagem sem efeito (`voided`), confirmação feita (motorista, `confirmedAt` apareceu). Cada evento leva `tag` estável (ex.: `trip-<tipo>`) para o aviso novo trocar o antigo.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm --prefix app test`
Expected: todos os testes passam (os 9 antigos mais os novos).

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/intercity.ts app/src/lib/intercity.test.ts
git commit -m "Entre cidades: regras do teto, da confirmação, da cidade do destino e dos avisos"
```

---

### Task 5: Fluxo do passageiro

**Files:**
- Modify: `app/src/screens/DestinationScreen.tsx`, `app/src/screens/PassengerFlow.tsx`, `app/src/screens/ConfirmRideScreen.tsx`, `app/src/screens/RideStatusScreen.tsx`, `app/src/screens/ScheduledListScreen.tsx`, `app/src/lib/rides.ts`, `app/src/lib/scheduling.ts`, `app/src/lib/geocode.ts`, `app/src/components/PlaceSearch.tsx`
- Rename: `app/src/screens/CityDropoffScreen.tsx` → `app/src/screens/TripOptionsScreen.tsx`

**Interfaces:**
- Consumes: `nearestCity`, `confirmState`, `proposalLimit` (Task 4); RPCs `confirm_scheduled_ride(p_ride_id)` e `proposal_cap()` (Tasks 1 e 3).
- Produces: `confirmScheduledRide(rideId: number): Promise<void>` e `fetchProposalCap(): Promise<number>` em `app/src/lib/scheduling.ts`; `Place` perde `dropoffPlace`; `Ride` ganha `confirmed_at: string | null` e `void_reason: string | null`; `TripOptionsScreen({ onConfirm(place: Place), onBack })`.

- [ ] **Step 1: Busca de endereço em outra cidade**

`DestinationScreen`: "Em outra cidade" passa a abrir só `PlaceSearch` (como "Aqui na cidade"), em vez da lista de cidades; some a prop `onPickCity`, entra `onPickOtherCityPlace(place: Place)`. `PlaceSearch`/`suggestPlaces` (`geocode.ts`) ganham um modo com viés para todas as cidades atendidas (ler `suggestPlaces` e usar um retângulo que cubra as cidades ativas, em vez do centro da cidade de origem). Ao escolher o lugar, `nearestCity(place, otherCities)` define o `cityId` do `Place` (serve só para marcar a viagem como entre cidades e mostrar o nome ao motorista); o preço vem da distância do endereço até a origem (a localização do passageiro), sem recusar endereço longe.

- [ ] **Step 2: Ida/volta e quando**

Criar `TripOptionsScreen` a partir de `CityDropoffScreen`: título "Como será a viagem?", remove o "No centro / Em outro lugar" e o campo de endereço, mantém "só ida / ida e volta", espera de 1h a 4h (`WAIT_OPTIONS` hoje, trocar a lista para 60, 120, 180, 240) e o `SchedulePicker`. Atualizar o fluxo em `PassengerFlow.tsx` (`cityDropoff` → `tripOptions`).

- [ ] **Step 3: Remover o "lugar combinado" do app**

Tirar `dropoffPlace` de `Place` e de `requestRide` (`p_destination_place` deixa de ser enviado), as linhas de `destination_place` em `RideStatusScreen`, `HistoryScreen`, `DriverRideScreen` e `OpenRequestCard` (esta tarefa cobre só o lado do passageiro; o do motorista é a Task 6). A coluna no banco fica sem uso.

- [ ] **Step 4: Confirmação do preço e propostas**

`ConfirmRideScreen`: mostrar o valor calculado e, para ida e volta, o tempo de espera incluído; manter escolha de pagamento adiantado. `RideStatusScreen`: a lista de propostas vale para qualquer pedido entre cidades (hoje a condição na linha ~133 usa `destination_place || round_trip || scheduled_for`: trocar por "destino em outra cidade"); cada proposta mostra o total (`estimated_price + extra_amount`) e o motorista; incluir proposta de acréscimo 0 como "Aceitou o valor". Para viagem de hoje, o aceite de acréscimo 0 já fecha pelo `accept_ride` e a tela passa para o estado "motorista a caminho".

- [ ] **Step 5: Confirmar viagem**

`RideStatusScreen` e `ScheduledListScreen`: para viagem agendada aceita, usar `confirmState(ride.scheduled_for, ride.confirmed_at, new Date())`: `open` mostra o botão "Confirmar viagem" (chama `confirmScheduledRide`, depois recarrega); `too_early` mostra "Você poderá confirmar a partir de <hora>"; `not_confirmed` (viagem cancelada com `void_reason = 'not_confirmed'`) mostra "Viagem sem efeito: faltou confirmar".

- [ ] **Step 6: Avisos locais** (inclui avisar o passageiro quando o pedido agendado vence sem proposta: `status` passou a `cancelled` com `requested` antes e nenhuma proposta, texto "Ninguém aceitou sua viagem até a hora marcada.")

Onde o passageiro já recebe atualização (`subscribeToRides`, `subscribeToProposals`, polling de 8 s em `RideStatusScreen`) montar `TripSnapshot` e chamar `tripEvents(prev, next, 'passenger')` e `notify(title, body, { tag })` para cada evento. No carregamento de `PassengerFlow` (`load`), para viagens aceitas com `confirmState === 'open'`, `notifyOncePerDay('confirm-<ride_id>', 'Confirme sua viagem', 'Toque para confirmar a viagem de hoje.', todayLocal())`.

- [ ] **Step 7: Verificar no navegador**

Run: `npm --prefix app run web` (preview `simbora-web`), logar com uma conta de teste e percorrer "Em outra cidade": busca de endereço, ida/volta com espera, hoje e outro dia, valor calculado. Expected: sem tela "Onde deixar", sem erro no console, endereço fora das cidades mostra o aviso.
Run: `npx tsc --noEmit` em `app/`. Expected: sem erros.

- [ ] **Step 8: Commit**

```bash
git add app/src
git commit -m "Passageiro: entre cidades só com endereço, ida e volta, quando, propostas e confirmação da viagem"
```

---

### Task 6: Fluxo do motorista

**Files:**
- Modify: `app/src/screens/driver/OpenRequestCard.tsx`, `app/src/screens/driver/ScheduledTripsScreen.tsx`, `app/src/screens/driver/DriverRideScreen.tsx`, `app/src/screens/driver/DriverHomeScreen.tsx`, `app/src/lib/scheduling.ts`

**Interfaces:**
- Consumes: `proposalLimit`, `tripEvents`, `fetchProposalCap` (Tasks 4 e 5), RPCs `propose_extra`, `accept_ride`, `accept_scheduled_ride`.
- Produces: `OpenRequestCard` com os botões "Aceitar" e "Propor outro valor" em qualquer pedido entre cidades (hoje ou agendado) e o campo de valor com o limite visível.

- [ ] **Step 1: Cartão do pedido**

`OpenRequestCard`: a condição da linha ~217 (`destination_place || round_trip || scheduled_for`) passa a ser "destino em outra cidade". Mostrar origem, destino, data, valor calculado, "ida" ou "ida e volta com espera de X h". "Propor outro valor" abre o campo; o limite (`proposalLimit(ride.estimated_price, cap)`, `cap` de `fetchProposalCap()`) aparece como "até R$ <total máximo>" e o campo recusa valor fora de faixa antes de chamar `propose_extra`. Remover a linha de `destination_place`.

- [ ] **Step 2: Agendadas**

`ScheduledTripsScreen`: o botão de aceitar passa a dizer "Aceitar pelo valor" e, depois, mostra "Proposta enviada, aguardando o passageiro" (a proposta de acréscimo 0 não fecha a viagem). Viagem aceita e ainda sem `confirmed_at` mostra "Aguardando confirmação do passageiro".

- [ ] **Step 3: Viagem de hoje**

`DriverHomeScreen`/`DriverFlow`: aceitar o valor chama `accept_ride` e fecha na hora (já é assim); se outro motorista fechou antes, o erro "Corrida indisponível" vira o texto "Outro motorista já pegou essa viagem".

- [ ] **Step 4: Avisos**

Com `tripEvents(prev, next, 'driver')`: aviso quando a proposta é aceita, quando a viagem é cancelada pelo passageiro, quando fica sem efeito ("Viagem sem efeito: o passageiro não confirmou. Seu horário foi liberado."), quando o passageiro confirma.

- [ ] **Step 5: Verificar**

`npx tsc --noEmit` em `app/`; no navegador, como motorista de teste: ver o cartão com os dois botões, propor acima do limite (bloqueado na tela), propor dentro do limite (proposta aparece para o passageiro), aceitar viagem de hoje (fecha) e agendada (vira proposta).

- [ ] **Step 6: Commit**

```bash
git add app/src
git commit -m "Motorista: aceitar ou propor outro valor com limite, e avisos da viagem"
```

---

### Task 7: Painel, guia da equipe e entrega

**Files:**
- Delete: `painel/src/pages/Routes.tsx`
- Modify: `painel/src/App.tsx`, `painel/src/pages/Prices.tsx`, `docs/EQUIPE.md`

**Interfaces:**
- Consumes: `staff_pricing_overview()` (devolve `settings.proposal_cap`) e `staff_set_pricing_settings({ proposal_cap })` (Task 1).

- [ ] **Step 1: Painel**

`App.tsx`: remover `RoutesPage` (import na linha 13, uso na ~126) e o item de menu "Rotas" (conferir a lista de abas no arquivo). `Prices.tsx` (cartão `SettingsCard`): novo campo "Limite da proposta do motorista (% acima do calculado)" que lê `settings.proposal_cap` (0.30 → 30) e salva `proposal_cap` (30 → 0.30), no estilo dos campos vizinhos (`parseDecimal`, `Field`).

- [ ] **Step 2: Guia da equipe**

`docs/EQUIPE.md`: trocar a seção "Viagem entre cidades" (ao redor da linha 93) pelo novo fluxo: preço calculado, propostas, teto no painel, confirmação no dia.

- [ ] **Step 3: Verificar**

Run: `npm --prefix painel run build` (ou `tsc` do painel). Expected: compila sem a tela de rotas. No painel local (`painel`, porta 5174): o campo do teto aparece com 30 e salva (ver o valor mudar no banco com `select proposal_cap from public.pricing_settings`).

- [ ] **Step 4: Commit e passada final**

```bash
git add painel docs/EQUIPE.md
git commit -m "Painel: teto da proposta no lugar das rotas fixas; guia da equipe atualizado"
```
Rodar `npm --prefix app test`, `npx tsc --noEmit` (app) e uma passada manual do fluxo completo: pedido de hoje com proposta + escolha, pedido agendado com aceite do valor + escolha + confirmação + viagem sem efeito (ajustando `scheduled_for` no banco para testar a janela).
