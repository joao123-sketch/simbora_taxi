# Várias cidades (Ipu, Ipueiras, Groaíras, Pires Ferreira...) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Abrir uma cidade nova só com um formulário no painel (nome, UF, ponto no mapa, raio), sem mexer em código, e o app passar a tratar cada pessoa na cidade onde ela está.

**Architecture:** A cidade do passageiro e do motorista vem do GPS (cidade ativa mais próxima cujo centro está a até `radius_km`). O banco passa a conferir que a **origem** da cotação está dentro do raio da cidade. A busca de endereço usa o raio da cidade, não uma constante. O painel ganha "Abrir cidade": cria, copia as tarifas de uma cidade modelo e ativa de uma vez.

**Tech Stack:** Supabase (Postgres/PostGIS, SQL migrations, testes em SQL no estilo de `supabase/tests/fase3_precos.sql`), Expo/React Native web (`app/`, testes `tsx --test src/lib/*.test.ts`), painel Vite/React (`painel/`).

**Spec:** conversa de 2026-11-06 (sem documento de design). Pontos já decididos pelo dono:
1. A cidade vem do GPS (ou seleção), não da "primeira ativa".
2. O cadastro de motorista usa a cidade detectada.
3. Conferir a origem no banco.
4. Tirar "Guaraciaba do Norte" fixo do convite de WhatsApp e do foro dos termos.
5. Busca universal: abrir cidade não pode exigir configurar a busca.

## Fatos do código que o plano usa (conferidos em 2026-11-06)

- `PassengerFlow.tsx` usa `cities?.find((c) => c.active)` para todo mundo (linha ~270) e passa `city.id` ao `DriverFlow` (linha ~467), que o repassa ao `DriverSignupScreen` como `cityId`. Corrigir a escolha da cidade corrige o cadastro do motorista junto.
- A coluna `service_radius_km` e a conferência de destino **foram removidas** em `20261023010000_destino_combinado.sql` (destino dentro da cidade é livre, decisão do dono). Hoje **não existe nenhum raio no banco**, nem para origem nem para destino. O destino continua livre; só a origem ganha conferência.
- A view `public.cities_map` expõe `id, name, state, active, lat, lng`. `City` em `app/src/lib/rides.ts:9` espelha isso.
- O preço de viagem entre cidades **já não usa tabela de pares**: sai por km das tarifas (`fares.intercity_per_km`, faixas) da cidade de origem (migrations `20261108` e `20261109`). Abrir cidade só precisa de linhas em `public.fares`; não precisa de rota/par.
- `quote_ride` mais recente: `supabase/migrations/20261109000000_faixas_de_preco.sql:88`. Todo pedido passa por uma cotação (`price_quotes`), então conferir a origem na cotação cobre corrida, entrega, "para outra pessoa" e agendada. Confirmar com `grep -n "price_quotes" supabase/migrations/*.sql` que nenhum `request_*` mais recente insere sem cotação.
- `nearestCity(point, cities)` já existe em `app/src/lib/intercity.ts:38` (não filtra por raio).
- Painel: aba Cidades em `painel/src/pages/Cities.tsx`, funções `staff_add_city`, `staff_set_city_active` em `20261104000000_precos_fase3.sql`.
- Árvore de trabalho suja no início: `app/src/legal/driverTerms.ts`, `general.ts`, `LegalScreen.tsx` e `DriverSignupScreen.tsx` têm edições **do dono**, ainda sem commit. O Task 5 edita dois deles: ler `git diff` antes e preservar o que já está lá.

## Global Constraints

- Texto do app e do painel em português do Brasil. Mensagens de erro do banco em português, claras para idoso (regra do projeto: usável por quem tem 90 anos).
- Não mostrar fator de preço nem aviso novo de preço (regras de preço do dono não mudam).
- Raio padrão ao abrir cidade: **8 km** (`check` de 1 a 50). Guaraciaba do Norte e as outras cidades já cadastradas recebem 8 km na migration.
- Destino em outra cidade e destino dentro da cidade continuam livres (sem conferência).
- Migrations: o dono aplica (`npx supabase db push` ou SQL Editor). Nome com versão **maior que `20261113000000`** e única (o `db push` exige versões únicas).
- Commit só quando o dono pedir. Os passos "Commit" abaixo valem só depois desse pedido; até lá, deixe as mudanças na árvore.
- `graphify update .` depois de mexer em código (regra do projeto).

## Review Focus

1. Passageiro com GPS exatamente no limite do raio (ex.: 8,0 km): decidir `<=`; teste dos dois lados.
2. Duas cidades ativas cujos raios se sobrepõem (Ipu e Ipueiras): vale a mais próxima do GPS, não a primeira da lista.
3. GPS fora de todas as cidades abertas: tela "ainda não atendemos aqui", sem pedido, sem tela em branco nem spinner eterno.
4. GPS negado ou lento: não escolher cidade "no chute"; manter o aviso de localização que já existe.
5. Cidade aberta sem tarifa de moto ou de carro (cópia incompleta): `staff_open_city` deve falhar inteira, não deixar cidade ativa sem tarifa.

---

### Task 1: Raio da cidade e conferência da origem (banco)

**Files:**
- Create: `supabase/migrations/20261114000000_raio_da_cidade.sql`
- Test: `supabase/tests/cidades_abertas.sql`

**Interfaces:**
- Produces: coluna `public.cities.radius_km numeric(5,2) not null default 8 check (radius_km between 1 and 50)`; `cities_map` com a coluna extra `radius_km`; `private.assert_origin_in_city(p_city_id bigint, p_origin extensions.geography) returns void` (levanta exceção em português se a distância ao centro passar de `radius_km * 1000` m); `public.quote_ride(...)` com a **mesma assinatura** de hoje, agora chamando a conferência.

- [ ] **Step 1: Write the failing test** em `supabase/tests/cidades_abertas.sql`, copiando o esqueleto de `fase3_precos.sql` (transação desfeita, `zz_fx`, `mk_user`, `as_user`, personagens ST e PS). Casos:
  - origem a ~2 km do centro de Guaraciaba cota normalmente (`quote_ride` devolve 2 linhas, carro e moto);
  - origem a ~30 km do centro (ponto de São Benedito) com `p_city_id` de Guaraciaba: devolve **0 linhas** (o `quote_ride` engole `raise_exception` por tipo de veículo; então o teste chama `private.assert_origin_in_city` direto e espera a mensagem `Você está fora da área desta cidade`);
  - origem a 7,9 km passa, a 8,1 km falha (valores do raio padrão).
- [ ] **Step 2: Run** o arquivo no SQL Editor antes da migration. Expected: falha (função/coluna não existe).
- [ ] **Step 3: Implement** a migration: `alter table ... add column radius_km`; `drop view public.cities_map` e recriar com `radius_km` no fim (o padrão já usado em `20261023010000`); criar `private.assert_origin_in_city` (`stable`, `security definer set search_path = ''`, `revoke execute ... from public, anon, authenticated`); **copiar** `public.quote_ride` de `20261109000000_faixas_de_preco.sql` com `create or replace` e acrescentar, logo depois do teste de `auth.uid()`, `perform private.assert_origin_in_city(p_city_id, v_origin);` **fora** do bloco `begin ... exception when raise_exception` por veículo, para o erro chegar ao app. Mensagem: `Você está fora da área desta cidade. O Simbora Car atende só perto do centro de cada cidade aberta.`
- [ ] **Step 4: Run** o teste de novo. Expected: `RESULTADO` com todos os casos ok.
- [ ] **Step 5: Commit** (só se o dono pedir): `git add supabase/migrations/20261114000000_raio_da_cidade.sql supabase/tests/cidades_abertas.sql`.

### Task 2: Abrir cidade e editar raio (banco + painel)

**Files:**
- Modify: `supabase/migrations/20261114000000_raio_da_cidade.sql` (mesma migration, no fim)
- Modify: `supabase/tests/cidades_abertas.sql`
- Modify: `painel/src/pages/Cities.tsx`
- Create: `painel/src/lib/coords.ts` e `painel/src/lib/coords.test.ts` (se o painel não tiver runner de teste, a função é pequena: teste manual descrito no Step 6)

**Interfaces:**
- Produces (SQL): `public.staff_open_city(p_name text, p_state text, p_lat double precision, p_lng double precision, p_radius_km numeric, p_copy_fares_from bigint) returns bigint` (só equipe: `private.require_staff()`); cria a cidade **já ativa**, copia para ela as tarifas vigentes de `p_copy_fares_from` (todas as linhas de `public.fares` mais recentes por `vehicle_type`, `effective_from = current_date`, **todas** as colunas de tarifa, inclusive `intercity_*` e `city_far_*`), e **falha inteira** se a cidade modelo não tiver tarifa de carro e de moto. `public.staff_set_city_radius(p_city_id bigint, p_radius_km numeric) returns void`. `staff_pricing_overview` passa a trazer `radius_km` em cada cidade.
- Produces (painel): `parseCoords(text: string): { lat: number; lng: number } | null` em `painel/src/lib/coords.ts`; aceita o formato que o Google Maps copia ao clicar com o botão direito (`-3.8545, -40.9210`), com vírgula ou ponto e vírgula, e devolve `null` para qualquer outra coisa.

- [ ] **Step 1: Write the failing tests**: no SQL, `staff_open_city` por PS (não equipe) falha; por ST cria cidade com `active = true`, `radius_km` pedido e 2 linhas em `fares` iguais às da modelo; modelo sem moto falha e **não** deixa a cidade criada (transação inteira); nome repetido devolve `Essa cidade já existe`. Em `coords.test.ts`: `parseCoords('-3.8545, -40.9210')` → `{ lat: -3.8545, lng: -40.921 }`; `parseCoords('abc')` → `null`; `parseCoords('95, 10')` → `null` (fora de -90..90).
- [ ] **Step 2: Run** e ver falhar.
- [ ] **Step 3: Implement** as duas funções SQL (reusar a validação de nome/UF de `staff_add_city`; `revoke ... from public, anon` e `grant ... to authenticated`) e `parseCoords`.
- [ ] **Step 4: Implement** em `Cities.tsx`: trocar o formulário de adicionar por "Abrir cidade": nome, UF, campo único "Ponto no mapa (cole do Google Maps)" usando `parseCoords`, raio em km (padrão 8), seletor "Copiar tarifas de" (cidades ativas; padrão Guaraciaba) e botão "Abrir cidade". Na lista, campo de raio editável por cidade (chama `staff_set_city_radius`). Atualizar o texto de dica do topo (hoje diz que a cidade nasce desativada).
- [ ] **Step 5: Run** os testes SQL e `coords.test.ts`. Expected: tudo passa.
- [ ] **Step 6: Verify** no painel em dev (`preview_start` com `painel`): abrir uma cidade de teste com ponto colado e confirmar que ela aparece ativa na lista e na aba Preços; apagar a cidade de teste no fim (pelo SQL Editor, o dono).
- [ ] **Step 7: Commit** (só se o dono pedir).

### Task 3: App escolhe a cidade pelo GPS

**Files:**
- Modify: `app/src/lib/rides.ts:9` (tipo `City` ganha `radius_km: number`)
- Modify: `app/src/lib/intercity.ts` (nova função ao lado de `nearestCity`)
- Test: `app/src/lib/intercity.test.ts`
- Modify: `app/src/screens/PassengerFlow.tsx` (linha ~270 e o início do componente)
- Create: `app/src/screens/OutOfAreaScreen.tsx`

**Interfaces:**
- Consumes: `distanceKm(a, b)` de `app/src/lib/geo.ts`; `City.radius_km` (Task 1).
- Produces: `cityAt(point: Coord, cities: City[]): City | null` em `intercity.ts`: entre as cidades com `active`, devolve a mais próxima cujo `distanceKm(point, city) <= city.radius_km`; `null` se nenhuma.

- [ ] **Step 1: Write the failing tests** em `intercity.test.ts` (reusar o array `cities` do arquivo, acrescentando `radius_km: 8` e a cidade 1 ativa): ponto no centro da cidade 1 → id 1; ponto a ~20 km de qualquer cidade → `null`; duas cidades ativas a ~10 km uma da outra e ponto a 4 km da primeira e 6 km da segunda → a primeira; cidade `active: false` nunca é devolvida.
- [ ] **Step 2: Run** `cd app && npm test`. Expected: FAIL (`cityAt` não existe).
- [ ] **Step 3: Implement** `cityAt` e o campo `radius_km` em `City`.
- [ ] **Step 4: Implement** em `PassengerFlow.tsx`: `const city = here ? cityAt(here, cities) : null` no lugar do `find(active)`. Quando `cities` já carregou e `here` ainda é `null`, manter o carregamento/aviso de localização que existe hoje (nenhuma cidade "de chute"). Quando `here` existe e `city` é `null`, renderizar `OutOfAreaScreen`. Cuidado: hoje `city` alimenta `HomeScreen` com `center={here ?? city}`; a Home precisa de um centro antes de ter cidade, então usar o centro da primeira cidade ativa **só** como mapa de fundo enquanto o GPS não chegou.
- [ ] **Step 5: Implement** `OutOfAreaScreen`: título "Ainda não atendemos aqui", texto "O Simbora Car funciona em: {nomes das cidades ativas}.", com botão de voltar. Nada além disso (YAGNI).
- [ ] **Step 6: Run** `npm test` e `npx tsc --noEmit`. Expected: passam.
- [ ] **Step 7: Verify** no navegador interno: o `preview_start` do app com GPS simulado dentro de Guaraciaba abre o início normal; com GPS fora de todas as cidades abre "Ainda não atendemos aqui". Simular GPS por `javascript_tool` sobrescrevendo `navigator.geolocation.getCurrentPosition` antes de carregar, ou pelo painel de sensores do navegador.
- [ ] **Step 8: Commit** (só se o dono pedir).

### Task 4: Cadastro do motorista na cidade detectada

**Files:**
- Modify: `app/src/screens/driver/DriverSignupScreen.tsx` (mostrar a cidade)
- Modify: `app/src/screens/driver/DriverFlow.tsx` (receber o nome)
- Modify: `app/src/screens/PassengerFlow.tsx` (passar `cityName`)

**Interfaces:**
- Consumes: `city` de `cityAt` (Task 3). O `cityId` já chega ao `register_driver` (`DriverSignupScreen.tsx:75`); não muda a assinatura do RPC.
- Produces: prop `cityName: string` em `DriverFlow` e `DriverSignupScreen`.

- [ ] **Step 1: Implement** a prop `cityName` e uma linha fixa no resumo do último passo do cadastro: "Cidade: {cityName}". Texto de apoio no passo 1: "Você vai atender em {cityName}."
- [ ] **Step 2: Verify** (`npx tsc --noEmit`). Não há teste automatizado de tela no projeto; conferir no navegador interno com GPS dentro de Guaraciaba: a linha mostra "Guaraciaba do Norte". Com GPS fora de todas as cidades, o botão "Quero ser motorista" não é alcançado (a Home mostra "Ainda não atendemos aqui").
- [ ] **Step 3: Commit** (só se o dono pedir).

### Task 5: Textos sem cidade fixa

**Files:**
- Modify: `app/src/lib/share.ts` (`driverRecruitMessage`, linha ~56)
- Modify: `app/src/legal/general.ts:46`
- Modify: `app/src/legal/driverTerms.ts:44`
- Test: `app/src/lib/share.test.ts` (novo)

**Interfaces:**
- Produces: `driverRecruitMessage(cityName?: string): string`. Com nome: "Quer ganhar dinheiro dirigindo em {cityName}? No Simbora Car o primeiro mês é grátis. Cadastre-se como motorista: {link}". Sem nome: "Quer ganhar dinheiro dirigindo? ..." (sem a cidade). O chamador em `RideStatusScreen.tsx` passa o nome da cidade da corrida; adicionar `cityName` às props de `RideStatusScreen` via `PassengerFlow` (usar o `city.name` da Task 3).

- [ ] **Step 1: Write the failing test**: `driverRecruitMessage('Ipu')` contém `Ipu` e `/motorista`; `driverRecruitMessage()` não contém `Guaraciaba`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** a mensagem e a passagem de `cityName`.
- [ ] **Step 4: Implement** o foro. **Antes**: `git diff app/src/legal/` e preservar o que o dono já editou. Texto proposto (rascunho, **precisa de revisão do advogado do dono**, porque muda quem pode ser processado onde): `general.ts` → "Qualquer questão sobre estes termos será resolvida no foro da comarca do domicílio do usuário." (regra do consumidor no CDC, art. 101, I). `driverTerms.ts` → "...no foro da comarca da cidade em que o motorista está cadastrado." Se o dono preferir manter um foro único, a alternativa é deixar Guaraciaba do Norte nos termos de motorista e mudar só os termos gerais; decidir antes de escrever.
- [ ] **Step 5: Run** `npm test` e `npx tsc --noEmit`. Expected: passam.
- [ ] **Step 6: Commit** (só se o dono pedir).

### Task 6: Busca de endereço sem número fixo

**Files:**
- Modify: `app/src/lib/geocode.ts` (constantes `BOX` e `GOOGLE_BOX`, linhas ~20-26, e `suggestPlaces`/`nominatimSearch`)
- Create: `app/src/lib/geocode.test.ts`
- Modify: `app/src/screens/DestinationScreen.tsx` (só se `otherCitiesBias` usar `GOOGLE_BOX`; conferir)

**Interfaces:**
- Consumes: `City.radius_km` (Task 1).
- Produces: `searchBoxDegrees(city: City, factor?: number): number` exportada de `geocode.ts`; devolve `max(0.03, (city.radius_km * (factor ?? 1.3)) / 111)` (graus; 1,3 dá folga para lugar na borda). `suggestPlaces(city, input, session, box?)` usa `box ?? searchBoxDegrees(city)`; o Nominatim usa o mesmo valor (some o `BOX` 0.25 fixo).

- [ ] **Step 1: Write the failing test** em `geocode.test.ts`: `searchBoxDegrees({ radius_km: 8 } as City)` ≈ 0.0937; raio 1 → piso 0.03; o resultado cresce com o raio. Teste só a função pura (o resto fala com o Google).
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** `searchBoxDegrees` e trocar as duas constantes pelo uso dela.
- [ ] **Step 4: Run** `npm test` e `npx tsc --noEmit`. Expected: passam.
- [ ] **Step 5: Verify** no navegador interno com a chave do Google: buscar "praça" em Guaraciaba e ver sugestões só da cidade, sem vizinhas na frente. Com o raio de uma cidade pequena de teste mudado para 3, conferir que o quadrado encolhe (olhar a requisição em `read_network_requests`).
- [ ] **Step 6: Commit** (só se o dono pedir).

### Task 7: Conferência ponta a ponta e atualização do grafo

**Files:**
- Modify: `docs/superpowers/plans/2026-11-06-varias-cidades.md` (marcar os checkboxes)
- Modify: `README.md` (a frase "Onde: começa em Guaraciaba do Norte ... se expande para..." só se ficar desatualizada)

- [ ] **Step 1: Verify** com duas contas de teste (**não** as dos aparelhos do dono: 2, 3 e 5; usar 1 e 4 só pela API): abrir uma cidade de teste no painel, simular GPS nela, pedir cotação (`quote_ride`) com origem lá: 2 preços; com origem em Guaraciaba e `p_city_id` da cidade de teste: erro "fora da área".
- [ ] **Step 2: Run** `cd app && npm test && npx tsc --noEmit` e `cd ../painel && npx tsc --noEmit`. Expected: passam.
- [ ] **Step 3: Run** `graphify update .`.
- [ ] **Step 4: Desativar** a cidade de teste (ou apagar pelo SQL Editor) para não aparecer a passageiro real.

## Fora deste plano (decidir depois)

- Motorista que muda de cidade: o cadastro fixa `drivers.city_id`; trocar de cidade fica para depois (hoje só a equipe mexe).
- Convite de WhatsApp por cidade na tela "Ainda não atendemos aqui" (lista de espera por cidade): ideia boa, mas é produto novo.
- Raio por formato (em vez de círculo) para cidades alongadas: círculo basta para o piloto.
