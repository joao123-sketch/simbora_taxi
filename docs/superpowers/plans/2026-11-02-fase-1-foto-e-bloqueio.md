# Fase 1: foto de perfil e bloqueio de passageiro — Plano de implementação

> **Para quem executar:** use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans, tarefa por tarefa. Os passos usam `- [ ]`.

**Objetivo:** todo passageiro tem uma selfie obrigatória; o motorista vê foto e nome antes de aceitar; o motorista pode bloquear um passageiro para sempre; a equipe consegue ver a foto para investigar denúncia, com registro de quem viu.

**Arquitetura:** a foto fica num bucket privado do Supabase Storage (`passenger-photos`), o caminho em `profiles.photo_path`. O motorista só lê a foto de quem tem pedido visível para ele ou corrida dele (política do Storage chamando uma função do banco). O bloqueio é uma tabela por motorista, consultada pelo despacho, pela lista de agendadas e pela visão de pedidos. App e painel só falam com o banco por funções (`rpc`).

**Tecnologias:** Supabase (SQL, Storage, RLS), Expo web (React Native Web), `expo-image-picker`, painel Vite + React.

**Escopo/decisões:** fechado com o usuário em 2026-11-02 (sem documento de design separado; as regras estão em "Restrições globais" abaixo e na memória do projeto `simbora-pwa-google`).

## Restrições globais

- Foto **só por câmera** (`ImagePicker.launchCameraAsync`, câmera frontal), obrigatória. No computador, sem câmera, o navegador abre o seletor de arquivo: aceitável.
- Bucket `passenger-photos`, privado, máximo **1 MB** (1048576), só `image/jpeg`. Arquivo em `{user_id}/avatar.jpg`. Lado maior da imagem: **640 px**, JPEG qualidade 0,7.
- O motorista vê **nome completo** e **foto** antes de aceitar. Em **corrida para outra pessoa**: foto do **titular da conta** e **apenas o nome de quem vai andar**; o nome do titular não aparece.
- Bloqueio: o passageiro **nunca é avisado**; vale para pedidos agora, agendados e futuros daquele motorista; recusar não tem limite.
- A equipe do painel vê a foto **só para investigar denúncia** e cada visualização é registrada (`photo_views`).
- Excluir a conta apaga a foto do Storage. Apagar por SQL em `storage.objects` é bloqueado pelo Supabase: a remoção é feita pelo app, pela API do Storage.
- Textos em português do Brasil, tom simples (público idoso). Alvo de toque mínimo 56 px, usar `Screen`, `BigButton`, `ChoiceCard` existentes.
- Funções do banco: `security definer set search_path = ''`, `revoke ... from public, anon` e `grant ... to authenticated`.
- **Git: não commitar nem enviar sem o usuário pedir** (regra do projeto). Os passos de "commit" abaixo são só para pedir ao usuário.
- O banco hospedado é aplicado pelo usuário colando o SQL no SQL Editor; depois registrar a migration em `supabase_migrations.schema_migrations` (`insert ... on conflict do nothing`). O agente não tem acesso ao banco.
- Não há executor de testes de JavaScript no projeto. A lógica pura é testada com `node:test` via `tsx`; o banco é testado por scripts SQL que terminam em `rollback`; o resto é verificado com `npx tsc --noEmit` e no navegador.

## Foco da revisão

1. Passageiro **sem foto** chama a API direto (pulando a tela do app): o banco recusa o pedido ("Tire a sua foto antes de pedir uma corrida").
2. Motorista bloqueia um passageiro que **já tem pedido aberto** para ele: a oferta some para esse motorista e a onda segue para o próximo motorista.
3. Corrida **para outra pessoa**: `passenger_name` é o nome informado e `passenger_photo_path` é a foto do titular; o nome do titular não vaza em nenhum lugar que o motorista lê.
4. Um motorista ou passageiro **sem relação** com a corrida tenta gerar link assinado da foto de outro: o Storage recusa.
5. **Excluir a conta** com foto: a foto sai do Storage; se a remoção falha, a conta não é excluída e a pessoa vê o motivo.

## Mapa de arquivos

Banco (novos):
- `supabase/migrations/20261103000000_foto_passageiro.sql`: coluna, bucket, políticas, função de visibilidade, gatilho de pedido, `ride_details`, `open_scheduled_rides`.
- `supabase/migrations/20261103010000_bloqueio_passageiro.sql`: tabela, funções de bloquear, filtros no despacho.
- `supabase/migrations/20261103020000_painel_fotos.sql`: busca de passageiro e registro de visualização.
- `supabase/tests/fase1_foto_bloqueio.sql`: script de testes (transação com `rollback`).

App (`app/src/`):
- `lib/photo.ts` + `lib/photo.test.ts`: tirar, reduzir, enviar, link assinado, remover.
- `lib/blocks.ts`: bloquear, desbloquear, listar.
- `components/Avatar.tsx`: foto redonda com ícone de reserva.
- `screens/PhotoScreen.tsx`, `screens/driver/BlockedPassengersScreen.tsx`.
- Alterados: `App.tsx`, `lib/rides.ts`, `lib/scheduling.ts`, `screens/PassengerFlow.tsx`, `screens/SettingsScreen.tsx`, `screens/DeleteAccountScreen.tsx`, `screens/driver/{OpenRequestCard,DriverRideScreen,ScheduledTripsScreen,DriverSettingsScreen,DriverFlow,DriverHomeScreen}.tsx`.

Painel (`painel/src/`): `pages/Passengers.tsx` (novo), `App.tsx` (aba).

---

### Tarefa 1: Banco — foto do passageiro

**Arquivos:**
- Criar: `supabase/migrations/20261103000000_foto_passageiro.sql`
- Criar: `supabase/tests/fase1_foto_bloqueio.sql` (seção "foto")

**Interfaces:**
- Produz: `profiles.photo_path text`; bucket `passenger-photos`; `private.driver_can_see_photo(p_passenger uuid) returns boolean`; gatilho `private.require_photo()` em `public.rides`; `ride_details.passenger_photo_path text`; `open_scheduled_rides()` com colunas novas `passenger_name text` e `passenger_photo_path text` no lugar de `passenger_first_name`.
- Consome: `private.can_see_offer(bigint)`, `private.can_take_scheduled(public.rides, uuid)`, `public.staff_me()` (já existem).

- [ ] **Passo 1: escrever os testes SQL (devem falhar)** em `supabase/tests/fase1_foto_bloqueio.sql`. Cada teste cria seus usuários em `auth.users` dentro da transação (o gatilho `handle_new_user` cria o perfil) e simula o login com `set local role authenticated` e `select set_config('request.jwt.claims', '{"sub":"<uuid>"}', true)`. Nomes e asserts:
  - `foto_pedido_sem_foto_recusado`: insert em `rides` por passageiro com `photo_path is null` levanta `'Tire a sua foto antes de pedir uma corrida'`.
  - `foto_pedido_com_foto_aceito`: o mesmo com `photo_path = '<uid>/avatar.jpg'` insere.
  - `foto_motorista_ve_foto_com_oferta`: `private.driver_can_see_photo(passageiro)` é `true` quando há pedido `requested` com oferta visível para o motorista; `false` para outro motorista sem oferta.
  - `foto_motorista_ve_foto_na_corrida_aceita`: `true` para o motorista da corrida `accepted`/`arrived`/`in_progress`; `false` depois de `completed`.
  - `foto_motorista_le_perfil_do_pedido`: o motorista com oferta visível consegue `select full_name, photo_path from public.profiles where id = <passageiro>`; um motorista sem relação recebe 0 linhas.
  - `foto_ride_details_outra_pessoa`: em corrida com `rider_name = 'Maria'`, `ride_details.passenger_name = 'Maria'` e `passenger_photo_path` é o do titular; o nome do titular não aparece em nenhuma coluna.
  - `foto_agendadas_nome_completo`: `open_scheduled_rides()` devolve `passenger_name` com o nome completo (não só o primeiro) e `passenger_photo_path`.
- [ ] **Passo 2: rodar e ver falhar.** Colar o script no SQL Editor. Esperado: erro nas colunas/funções que ainda não existem.
- [ ] **Passo 3: escrever a migration.** Em ordem: (a) `alter table public.profiles add column photo_path text`; (b) bucket via `insert into storage.buckets` como o de `fee-receipts` em `20261025020000_mensalidade.sql` (`public=false`, limite `1048576`, `array['image/jpeg']`); (c) políticas em `storage.objects`: insert/update/delete quando `(storage.foldername(name))[1] = (select auth.uid())::text`; select quando a pasta é do próprio usuário **ou** `private.driver_can_see_photo((storage.foldername(name))[1]::uuid)` **ou** `public.staff_me()`; (d) `private.driver_can_see_photo` (definer): `true` se existe corrida do passageiro com (`status='requested'` e (`private.can_see_offer(r.id)` ou `private.can_take_scheduled(r, auth.uid())`)) ou (`r.driver_id = auth.uid()` e `status in ('accepted','arrived','in_progress')`); (e) gatilho `before insert on public.rides` que levanta a mensagem do teste quando `profiles.photo_path` do `new.passenger_id` é nulo; (f) `drop view public.ride_details` e recriar a partir da definição em `20261102000000_pedir_para_outra_pessoa.sql`, acrescentando `p.photo_path as passenger_photo_path` e mantendo `coalesce(r.rider_name, p.full_name) as passenger_name`, mais `grant select ... to authenticated`; (g) `drop function public.open_scheduled_rides()` e `create function` com a mesma lógica de `20261102000000_pedir_para_outra_pessoa.sql`, trocando a coluna `passenger_first_name` por `passenger_name` (= `coalesce(r.rider_name, p.full_name, '')`, nome completo) e acrescentando `passenger_photo_path`; refazer `revoke`/`grant`; (h) `grant select (photo_path) on public.profiles to authenticated` (o acesso a `profiles` é por coluna, `20261023000000_etapa1_base.sql` liberou só `id, full_name, created_at`); (i) política em `public.profiles`: `create policy "motorista vê o passageiro do pedido" on public.profiles for select to authenticated using (private.driver_can_see_photo(id))`, porque hoje o motorista só vê o perfil do passageiro depois de aceitar (`private.shares_ride_with`); (j) `revoke execute on function private.driver_can_see_photo(uuid) from public, anon` e `grant execute ... to authenticated` (políticas rodam com o papel de quem chama).
- [ ] **Passo 4: aplicar e rodar os testes.** Imprimir o SQL para o usuário colar no SQL Editor, depois colar o script de testes. Esperado: todos os `assert` passam e o script termina em `rollback`.
- [ ] **Passo 5: pedir ao usuário para registrar a migration** (`insert into supabase_migrations.schema_migrations (version, name) values ('20261103000000','foto_passageiro') on conflict (version) do nothing`).

---

### Tarefa 2: Banco — bloqueio de passageiro

**Arquivos:**
- Criar: `supabase/migrations/20261103010000_bloqueio_passageiro.sql`
- Modificar: `supabase/tests/fase1_foto_bloqueio.sql` (seção "bloqueio")

**Interfaces:**
- Consome: `private.dispatch_ride`, `private.can_see_offer`, `private.can_take_scheduled`, `public.open_scheduled_rides` (versões mais recentes: `20261025040000_viagens_agendadas.sql` e a da Tarefa 1), `public.decline_ride(bigint)`.
- Produz: tabela `public.driver_blocked_passengers(driver_id uuid, passenger_id uuid, created_at timestamptz)`; `public.block_passenger(p_ride_id bigint) returns void`; `public.unblock_passenger(p_passenger_id uuid) returns void`; `public.my_blocked_passengers() returns table (passenger_id uuid, full_name text, photo_path text, blocked_at timestamptz)`.

- [ ] **Passo 1: testes SQL (devem falhar).**
  - `bloqueio_cria_e_lista`: `block_passenger(ride)` pelo motorista com oferta visível cria a linha; `my_blocked_passengers()` devolve nome completo e `photo_path`.
  - `bloqueio_recusa_sem_relacao`: motorista sem oferta nem corrida para aquele pedido recebe `'Pedido indisponível'`.
  - `bloqueio_despacho_pula`: com o passageiro bloqueado, `private.dispatch_ride(novo_pedido)` não cria oferta para aquele motorista.
  - `bloqueio_oferta_aberta_some`: após bloquear, a oferta existente some para o motorista (`private.can_see_offer(ride)` é `false`) e o próximo motorista da fila vê o pedido.
  - `bloqueio_agendadas`: `open_scheduled_rides()` não lista a viagem agendada do passageiro bloqueado; `private.can_take_scheduled` é `false`.
  - `bloqueio_desbloqueia`: `unblock_passenger` remove a linha e o passageiro volta a aparecer no despacho.
  - `bloqueio_isolado`: o bloqueio de um motorista não afeta outro motorista.
- [ ] **Passo 2: rodar e ver falhar** (funções inexistentes).
- [ ] **Passo 3: migration.** Tabela com `primary key (driver_id, passenger_id)`, FKs `on delete cascade` para `public.drivers` e `public.profiles`, RLS ligada e `revoke all` (acesso só pelas funções). `block_passenger`: exige `private.can_see_offer(p_ride_id)` ou corrida do motorista ou `private.can_take_scheduled`; senão `raise exception 'Pedido indisponível'`; insere (`on conflict do nothing`) e chama `public.decline_ride` para cada pedido `requested` desse passageiro que o motorista vê, para a onda seguir. `my_blocked_passengers`: junta `profiles`. Filtro `and not exists (select 1 from public.driver_blocked_passengers b where b.driver_id = <motorista> and b.passenger_id = <passageiro>)` em: candidatos de `private.dispatch_ride`, `private.can_see_offer`, `private.can_take_scheduled` e `public.open_scheduled_rides`, todos com `create or replace` a partir da última versão. Em `private.driver_can_see_photo` (Tarefa 1) acrescentar a cláusula "ou o passageiro está bloqueado por quem chama", para a lista de bloqueados mostrar a foto.
- [ ] **Passo 4: aplicar e rodar os testes** (como na Tarefa 1). Esperado: tudo passa, `rollback`.
- [ ] **Passo 5: pedir ao usuário para registrar a migration** `20261103010000`.

---

### Tarefa 3: Banco — painel de fotos (auditoria)

**Arquivos:**
- Criar: `supabase/migrations/20261103020000_painel_fotos.sql`
- Modificar: `supabase/tests/fase1_foto_bloqueio.sql` (seção "painel")

**Interfaces:**
- Produz: `public.photo_views(id bigint identity, staff_id uuid, passenger_id uuid, viewed_at timestamptz)`; `public.staff_find_passenger(p_query text) returns table (passenger_id uuid, full_name text, phone text, photo_path text, rides_count bigint)`; `public.staff_log_photo_view(p_passenger_id uuid) returns void`.

- [ ] **Passo 1: testes SQL.**
  - `painel_busca_so_equipe`: usuário fora de `public.staff` recebe erro ao chamar `staff_find_passenger`.
  - `painel_busca_por_nome_ou_telefone`: a busca acha por parte do nome e por parte do telefone, limitada a 20 linhas.
  - `painel_log_registra`: `staff_log_photo_view` grava uma linha com o `auth.uid()` do staff; chamada por não-staff falha.
- [ ] **Passo 2: rodar e ver falhar.**
- [ ] **Passo 3: migration.** Tabela `photo_views` com RLS e `revoke all`. As duas funções começam com `if not public.staff_me() then raise exception 'Acesso restrito à equipe'`, seguindo o padrão das funções `staff_*` de `20261024080000_painel_da_equipe.sql`.
- [ ] **Passo 4: aplicar e rodar os testes.** Esperado: tudo passa.
- [ ] **Passo 5: pedir ao usuário para registrar a migration** `20261103020000`.

---

### Tarefa 4: App — biblioteca da foto

**Arquivos:**
- Criar: `app/src/lib/photo.ts`, `app/src/lib/photo.test.ts`
- Modificar: `app/package.json` (devDependency `tsx`, script `"test": "tsx --test src/lib/photo.test.ts"`)

**Interfaces:**
- Produz (`photo.ts`):
  - `fitWithin(width: number, height: number, max: number): { width: number; height: number }` — reduz mantendo a proporção; nunca amplia.
  - `takeSelfie(): Promise<string | null>` — câmera frontal, `mediaTypes: ['images']`, `quality: 1`; devolve a uri ou `null` se cancelou ou sem permissão.
  - `shrinkToJpeg(uri: string): Promise<Blob>` — web: desenha em `canvas` com `fitWithin(w, h, 640)` e `toBlob('image/jpeg', 0.7)`.
  - `uploadMyPhoto(userId: string, blob: Blob): Promise<string>` — envia a `passenger-photos/{userId}/avatar.jpg` com `upsert: true`, grava `profiles.photo_path` e devolve o caminho.
  - `photoUrl(path: string | null): Promise<string | null>` — link assinado de 3600 s, com cache em memória por caminho até 50 min.
  - `removeMyPhoto(userId: string): Promise<void>` — remove o arquivo pela API do Storage e zera `profiles.photo_path`.

- [ ] **Passo 1: escrever o teste** `fitWithin` em `photo.test.ts` com `node:test`: `fitWithin(4000, 3000, 640)` → `{ width: 640, height: 480 }`; `fitWithin(3000, 4000, 640)` → `{ width: 480, height: 640 }`; `fitWithin(300, 200, 640)` → `{ width: 300, height: 200 }`; `fitWithin(640, 640, 640)` → `{ width: 640, height: 640 }`.
- [ ] **Passo 2: instalar `tsx` e rodar** `npm test` dentro de `app/`. Esperado: FAIL (`fitWithin` não existe).
- [ ] **Passo 3: implementar** `fitWithin` e as demais funções em `photo.ts`, seguindo o padrão de upload de `app/src/lib/fees.ts` (`uploadReceipt`).
- [ ] **Passo 4: rodar** `npm test` e `npx tsc --noEmit`. Esperado: 4 testes passam; `tsc` sem erro.
- [ ] **Passo 5: pedir ao usuário para commitar** (não commitar sozinho).

---

### Tarefa 5: App — tela da foto, portão no cadastro e em Configurações

**Arquivos:**
- Criar: `app/src/components/Avatar.tsx`, `app/src/screens/PhotoScreen.tsx`
- Modificar: `app/App.tsx`, `app/src/screens/PassengerFlow.tsx`, `app/src/screens/SettingsScreen.tsx`

**Interfaces:**
- Consome: `takeSelfie`, `shrinkToJpeg`, `uploadMyPhoto`, `photoUrl` (Tarefa 4).
- Produz: `Avatar({ path, size }: { path: string | null; size?: number })` (padrão 56; mostra a foto por `photoUrl` ou um ícone `person` cinza); `PhotoScreen({ userId, onSaved, onBack }: { userId: string; onSaved: (path: string) => void; onBack?: () => void })`.

- [ ] **Passo 1: `Avatar`** redondo com `accessibilityLabel="Foto"`; sem foto ou erro mostra o ícone.
- [ ] **Passo 2: `PhotoScreen`** com `Screen` (título "Sua foto", subtítulo "O motorista vê esta foto antes de aceitar a corrida. Tire uma selfie de rosto, com boa luz."). Botão "Tirar foto" chama `takeSelfie`; depois mostra a prévia (`Avatar` grande) com "Usar esta foto" (reduz, envia, chama `onSaved`) e "Tirar de novo". Se `takeSelfie` volta `null`, mostra "Não conseguimos abrir a câmera. Permita o acesso à câmera e tente de novo." Com `onBack`, mostra a seta de voltar.
- [ ] **Passo 3: portão em `App.tsx`.** Buscar `select('full_name, photo_path')`; estado `photoPath`; depois de `NameScreen`, se `photoPath` é nulo renderizar `<PhotoScreen userId onSaved={setPhotoPath} />` (sem `onBack`). Vale para contas novas e antigas.
- [ ] **Passo 4: Configurações.** `SettingsScreen` ganha `onOpenPhoto` e um botão "Minha foto" (`icon="camera"`); `PassengerFlow` ganha o passo `{ kind: 'photo' }` que mostra `PhotoScreen` com `onBack` para Configurações.
- [ ] **Passo 5: verificar.** `npx tsc --noEmit` limpo. No navegador (com o SQL das Tarefas 1 a 3 aplicado): conta sem foto cai em "Sua foto" antes do Início; depois de enviar, abre o Início; "Minha foto" em Configurações troca a foto. Em computador sem câmera, o seletor de arquivo abre.
- [ ] **Passo 6: pedir ao usuário para commitar.**

---

### Tarefa 6: App — motorista vê foto e nome completo

**Arquivos:**
- Modificar: `app/src/lib/rides.ts` (tipo `Ride`: `passenger_photo_path: string | null`), `app/src/lib/scheduling.ts` (mapeia `passenger_name` e `passenger_photo_path`), `app/src/screens/driver/OpenRequestCard.tsx`, `app/src/screens/driver/DriverRideScreen.tsx`, `app/src/screens/driver/ScheduledTripsScreen.tsx`

**Interfaces:**
- Consome: `Avatar` (Tarefa 5); colunas `passenger_name`, `passenger_photo_path` (Tarefa 1).

- [ ] **Passo 1:** no topo de `OpenRequestCard`, uma linha com `<Avatar path={ride.passenger_photo_path} size={64} />` e `ride.passenger_name` em negrito (nome completo; em corrida para outra pessoa já vem o nome informado).
- [ ] **Passo 2:** `DriverRideScreen` troca o texto de `ride.passenger_name` por `Avatar` + nome; `ScheduledTripsScreen` mostra `Avatar` e `passenger_name` no lugar do primeiro nome (usa o campo novo de `open_scheduled_rides`).
- [ ] **Passo 3: verificar.** `npx tsc --noEmit` limpo. No navegador, com um motorista online e um pedido de uma conta com foto: o cartão mostra foto e nome completo. Em pedido "Para outra pessoa": foto do titular e só o nome informado.
- [ ] **Passo 4: pedir ao usuário para commitar.**

---

### Tarefa 7: App — bloquear e desbloquear passageiro

**Arquivos:**
- Criar: `app/src/lib/blocks.ts`, `app/src/screens/driver/BlockedPassengersScreen.tsx`
- Modificar: `app/src/screens/driver/OpenRequestCard.tsx`, `app/src/screens/driver/DriverHomeScreen.tsx`, `app/src/screens/driver/DriverSettingsScreen.tsx`, `app/src/screens/driver/DriverFlow.tsx`

**Interfaces:**
- Produz (`blocks.ts`): `blockPassenger(rideId: number): Promise<void>` (`rpc('block_passenger')`); `unblockPassenger(passengerId: string): Promise<void>`; `fetchBlockedPassengers(): Promise<BlockedPassenger[]>` com `type BlockedPassenger = { passenger_id: string; full_name: string | null; photo_path: string | null; blocked_at: string }`.
- `OpenRequestCard` ganha a prop `onBlock: () => Promise<void>`.
- `DriverSettingsScreen` ganha `onOpenBlocked: () => void`.

- [ ] **Passo 1:** em `OpenRequestCard`, abaixo de "Recusar", um link "Não atender este passageiro". O primeiro toque pede confirmação ("Esse passageiro nunca mais vai te chamar. Confirmar?" com "Sim, bloquear" e "Cancelar"); "Sim" chama `onBlock`.
- [ ] **Passo 2:** em `DriverHomeScreen`, `onBlock` chama `blockPassenger(ride.id)` e recarrega a lista de pedidos abertos (o pedido some).
- [ ] **Passo 3:** `BlockedPassengersScreen`: lista com `Avatar`, nome e botão "Desbloquear"; vazio mostra "Você não bloqueou ninguém." `DriverSettingsScreen` ganha o botão "Passageiros bloqueados" (`icon="ban"`); `DriverFlow` liga o passo.
- [ ] **Passo 4: verificar.** `npx tsc --noEmit` limpo. No navegador: bloquear no cartão faz o pedido sumir e o passageiro não volta no pedido seguinte; a lista mostra o bloqueado; "Desbloquear" o devolve; o passageiro não recebe aviso nenhum.
- [ ] **Passo 5: pedir ao usuário para commitar.**

---

### Tarefa 8: App — excluir a conta apaga a foto

**Arquivos:**
- Modificar: `app/src/screens/DeleteAccountScreen.tsx`, `app/src/screens/PassengerFlow.tsx`

**Interfaces:**
- Consome: `removeMyPhoto(userId: string): Promise<void>` (Tarefa 4).
- `DeleteAccountScreen` ganha a prop `userId: string`.

- [ ] **Passo 1:** em `confirm()`, antes de `rpc('delete_my_account')`, chamar `await removeMyPhoto(userId)`; se falhar, `setError('Não conseguimos apagar a sua foto agora. Tente de novo.')`, `setLoading(false)` e **não** excluir a conta.
- [ ] **Passo 2:** `PassengerFlow` passa `userId` à tela.
- [ ] **Passo 3: verificar.** `npx tsc --noEmit` limpo. No navegador com uma conta de teste: excluir a conta e conferir no painel do Supabase (Storage) que `passenger-photos/{id}/avatar.jpg` sumiu.
- [ ] **Passo 4: pedir ao usuário para commitar.**

---

### Tarefa 9: Painel — aba Passageiros

**Arquivos:**
- Criar: `painel/src/pages/Passengers.tsx`
- Modificar: `painel/src/App.tsx` (tipo `Tab`, botão da aba e render)

**Interfaces:**
- Consome: `staff_find_passenger`, `staff_log_photo_view` (Tarefa 3); Storage `passenger-photos` (política de `staff_me()`, Tarefa 1).

- [ ] **Passo 1:** aba "Passageiros" com campo de busca (nome ou telefone, mínimo 3 caracteres) e tabela (nome, telefone, nº de corridas, botão "Ver foto").
- [ ] **Passo 2:** "Ver foto" primeiro chama `rpc('staff_log_photo_view', { p_passenger_id })` e só depois gera `storage.from('passenger-photos').createSignedUrl(path, 60)` e mostra a imagem num painel; sem foto mostra "Sem foto".
- [ ] **Passo 3: verificar.** `npm run build` em `painel/` sem erro. No navegador logado como equipe: a busca acha o passageiro, a foto abre e `select * from public.photo_views order by id desc limit 1` mostra a visualização. Usuário fora da equipe não acessa.
- [ ] **Passo 4: pedir ao usuário para commitar.**

---

### Tarefa 10: Documentação e verificação final

**Arquivos:** modificar `README.md` (regras de negócio) e `docs/EQUIPE.md` (como consultar foto e ver o registro).

- [ ] **Passo 1:** documentar no README: foto obrigatória, quem vê a foto, bloqueio, auditoria, exclusão de conta. Em `docs/EQUIPE.md`: usar a aba Passageiros só para denúncia e a consulta do registro `photo_views`.
- [ ] **Passo 2: verificação final.** Rodar `npm test` e `npx tsc --noEmit` em `app/`, `npm run build` em `painel/`, e os testes SQL novamente (todos passam). Passar pelo fluxo completo no navegador: cadastro com foto, pedido, motorista vê foto e nome, motorista bloqueia, corrida para outra pessoa, exclusão de conta.
- [ ] **Passo 3: avisar o usuário** que contas de teste antigas passam a exigir foto na próxima abertura.
- [ ] **Passo 4: pedir ao usuário para commitar e enviar** (o Cloudflare publica app e painel).
