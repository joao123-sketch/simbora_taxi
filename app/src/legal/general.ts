// Texto PROVISÓRIO dos termos de uso e da política de privacidade, escrito de
// acordo com o que o app faz hoje. Precisa da revisão de um advogado antes do
// lançamento (principalmente o contato do responsável pelos dados e o prazo de
// guarda). Ao mudar o texto, mude a versão.
export const GENERAL_LEGAL_VERSION = 'rascunho-1';

export type LegalSection = { title: string; text: string };

export const TERMS: LegalSection[] = [
  {
    title: 'O que é o Simbora Car',
    text: 'O Simbora Car é um aplicativo que liga passageiros a motoristas autônomos de carro e de moto. O Simbora Car não é empresa de transporte e não emprega os motoristas.',
  },
  {
    title: 'Seu cadastro',
    text: 'Você entra com o número do seu celular e um código enviado por SMS. Use seus dados verdadeiros. A conta é pessoal e não deve ser passada para outra pessoa.',
  },
  {
    title: 'Preço e pagamento',
    text: 'Você vê o preço antes de chamar a corrida. O pagamento é feito direto ao motorista, por Pix, dinheiro ou maquininha de cartão (o cartão custa 5% a mais). Em viagem para outra cidade o preço é fechado, e o motorista pode pedir parte do valor adiantado.',
  },
  {
    title: 'Cancelamento',
    text: 'Você pode cancelar a corrida antes de ela começar. Cancelar muitas vezes sem necessidade pode levar à suspensão da conta.',
  },
  {
    title: 'Segurança',
    text: 'O app tem um botão de SOS, que avisa a equipe do Simbora Car com a sua localização, e um link para compartilhar a viagem com alguém. Em caso de perigo, procure também a polícia (190) ou o socorro (192).',
  },
  {
    title: 'Respeito e conduta',
    text: 'Trate motoristas e passageiros com respeito. Comportamento ofensivo, perigoso ou fraude pode levar à suspensão ou à exclusão da conta.',
  },
  {
    title: 'Avaliações',
    text: 'Depois da corrida, passageiro e motorista podem se avaliar com estrelas. As notas não são mostradas à outra pessoa.',
  },
  {
    title: 'Sua conta',
    text: 'Você pode parar de usar o app quando quiser e pedir a exclusão da sua conta.',
  },
  {
    title: 'Mudanças',
    text: 'Estes termos podem mudar. Quando mudarem de forma importante, o app avisa antes de você continuar usando.',
  },
];

export const PRIVACY: LegalSection[] = [
  {
    title: 'Que dados usamos',
    text: 'Seu nome e o número do celular. Sua localização, para marcar onde você está e, para o motorista, enquanto ele está online. O histórico das suas corridas e as mensagens do chat da corrida. Do motorista, também CPF, data de nascimento, CNH e dados do veículo, guardados em área privada.',
  },
  {
    title: 'Para que usamos',
    text: 'Para fazer a corrida acontecer, dar segurança, falar com você quando precisar e, no caso do motorista, cuidar da mensalidade. Não vendemos os seus dados.',
  },
  {
    title: 'Quem vê o quê',
    text: 'O motorista vê seu nome, onde buscar e para onde ir, e, até você embarcar, onde você está. Você vê o nome do motorista, o carro e a placa. Ninguém vê o telefone de ninguém: a conversa é pelo chat do app, e números de telefone escritos no chat são escondidos. Se você usar o SOS, a equipe recebe a sua localização.',
  },
  {
    title: 'Por quanto tempo guardamos',
    text: 'Guardamos o histórico enquanto a sua conta existir. Quando você excluir a conta, apagamos seus dados pessoais, menos o que a lei mandar guardar. Do motorista guardamos só um código irreversível do CPF, para não repetir o mês grátis.',
  },
  {
    title: 'Seus direitos',
    text: 'Pela Lei Geral de Proteção de Dados você pode saber quais dados temos, corrigir, pedir a exclusão e tirar o seu consentimento. É só pedir à equipe do Simbora Car. Contato do responsável pelos dados: a definir antes do lançamento.',
  },
];
