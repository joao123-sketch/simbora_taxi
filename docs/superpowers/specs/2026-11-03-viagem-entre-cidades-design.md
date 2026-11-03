# Viagem entre cidades por proposta (Simbora)

## Intenção
Hoje a viagem entre cidades usa valor fixo por rota (`intercity_fares`) e pede "onde deixar" na outra cidade. O dono quer trocar isso por um fluxo parecido com a corrida normal: o passageiro informa o endereço de destino, o app calcula o preço pela métrica normal (distância real do endereço), e os motoristas aceitam o valor ou propõem outro. O passageiro escolhe entre as propostas e a viagem só fecha depois disso.

## Objetivos
- Remover o valor fixo por rota e o "Onde deixar em <cidade>".
- Preço calculado pela métrica atual a partir do endereço (distância real). Ida e volta soma o tempo de espera como acréscimo.
- Motorista pode aceitar o valor calculado ou propor outro, até um teto configurável no painel (sugestão inicial: 30% acima do calculado).
- Agendada: passageiro vê todas as propostas e escolhe uma; fecha só com essa escolha. Hoje: aceite do valor calculado fecha na hora; propostas de outro valor exigem escolha do passageiro.
- Avisos (locais) a cada movimentação.

## Não objetivos
- Push pelo servidor (app totalmente fechado). Fica para uma segunda etapa. Esta versão usa só os avisos locais de `app/src/lib/notify.ts` (app aberto ou em segundo plano).
- Novas formas de pagamento ou mudança na métrica de preço.

## Anti-objetivos
- Viagem agendada ou com valor diferente do calculado fechada sem o passageiro ter escolhido.
- Motorista propondo acima do teto.

## Fluxo do passageiro
1. "Em outra cidade": só a barra de busca de endereço (como "Aqui na cidade"), confirma.
2. "A viagem é só de ida ou ida e volta?" Se ida e volta, escolhe o tempo de espera.
3. "Quando você quer ir?" Hoje: carro ou moto, lança como corrida normal. Outro dia: dia da semana e horário (agendamento existente).
4. O app mostra o valor calculado (com espera). Passageiro confirma e informa onde quer ser buscado. Chat ativo.
5. O pedido fica aberto até haver aceite ou propostas; viagem agendada fica aberta até o horário da viagem.
6. Agendada: passageiro vê as propostas (e o aceite do valor calculado) e escolhe uma; aí fecha. Hoje: o aceite do valor calculado fecha na hora; proposta de outro valor espera a escolha.

## Confirmação no dia (viagens agendadas)
- Depois de fechada, a viagem precisa de "Confirmar viagem" no dia.
- Botão libera 12h antes do horário (palpite aceito). O app avisa o passageiro de manhã (aviso local).
- Prazo para confirmar: até 2h antes da viagem (palpite aceito). Sem confirmar, a viagem fica sem efeito e o motorista é avisado para liberar o horário.
- Motorista vê "aguardando confirmação do passageiro".

## Tela do motorista
Origem, destino, data, valor calculado, ida ou ida e volta com espera. Botões "Aceitar" e "Propor outro valor" (limitado ao teto).

## Avisos (locais)
Nova proposta, aceite, cancelamento, viagem sem confirmação, lembrete de confirmar. Avisos de "nenhuma proposta ainda" não se aplicam. Quem recebe: passageiro ou motorista conforme o evento.

## Restrições
- Banco: Supabase, nova migration (ver `supabase/migrations/20261105000000_...`). Aplicação: Expo/React Native web (PWA) em `app/`; painel em `painel/`.
- Reaproveitar `SchedulePicker`, `scheduling.ts`, `ScheduledTripsScreen`, `CityDropoffScreen`, `OpenRequestCard`.
- Painel: remover tela de rotas (`Routes.tsx`/valor fixo), adicionar campo do teto da proposta em configurações de preço.

## Decisões do dono
Proposta fecha só com escolha do passageiro; passageiro vê todas as propostas; teto de proposta editável no painel; expiração na hora da viagem; confirmação no dia; push de servidor depois.

## Respostas do dono (rodada do revisor)
- Viagem de hoje (decisão final, substitui a anterior): motorista que aceita o valor calculado fecha na hora, primeiro que aceita leva, como na corrida normal. Proposta com outro valor vira opção na lista e o passageiro escolhe; se um motorista fechar antes, as propostas pendentes caem e os autores são avisados.
- Viagem agendada: nenhum aceite fecha sozinho. Aceite do valor calculado e propostas viram opções, e o passageiro escolhe entre todas.
- Pagamento adiantado (0, 50, 100%) continua como hoje: o passageiro escolhe ao fechar a viagem.

## Decisões minhas (construtor/autor), para conferir
- A proposta de total substitui o fluxo antigo de "valor extra" nas viagens entre cidades. Reaproveitar `ride_proposals`/`propose_extra`/`respond_proposal` adaptando para valor total; o antigo "outra cidade com lugar combinado" deixa de ser alcançável.
- Motorista não pode propor abaixo do valor calculado (aceitar o calculado é o mínimo). Teto: um percentual único no painel (30% inicial), junto das demais configurações de preço, valendo para carro e moto.
- Preço: métrica atual (Fase 3, `20261104000000_precos_fase3.sql`) pela distância real. Espera: valor por minuto da tarifa da cidade/veículo (`fares.per_min`, já editável no painel), sem campo novo. Ida e volta = ida dobrada + `per_min` × minutos de espera, como a cotação já faz (`quote_ride`, `wait_minutes`). O app oferece espera de 1h a 4h; o servidor já aceita até 8h.
- Quem vê o pedido: motoristas online da cidade de origem com o tipo de veículo certo; favoritos continuam valendo.
- "Fechada" e "sem efeito" viram estados novos da corrida; a janela de confirmação (12h a 2h antes) é aplicada no servidor. Viagem fechada com menos de 12h de antecedência exige confirmação imediata; com menos de 2h, não exige. A anulação às 2h é verificada no servidor ao abrir telas e por rotina agendada, se o Supabase permitir; senão, só na abertura.
- Pedido sem proposta até o horário: cancela e avisa o passageiro. Propostas não escolhidas: motoristas são avisados quando outra é escolhida. Motorista pode retirar a proposta. Passageiro e motorista podem cancelar depois de fechada, avisando o outro lado.
- `intercity_fares`: o dono mandou apagar. Migration remove a tabela, suas policies e o que depender dela (cotação/pedido antigos de valor fixo); corridas antigas continuam legíveis. A tela de rotas do painel sai.

## Deixado ao construtor
Modelo de dados das propostas, regras de expiração de corrida de hoje sem motorista, texto das mensagens, ordem segura para remover `intercity_fares`.

## Fora desta entrega (mudanças pequenas, feitas à parte)
1. Opções de instalar o app (Android/iPhone) na tela do telefone.
2. Fundo com textura (carrinhos, pinos, mapa) com identidade visual.
4. Mensagem de CPF já cadastrado com o telefone do suporte (88988941408).
