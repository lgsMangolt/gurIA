const MESSAGES: Record<string, string> = {
  PROVA_ENCERRADA: 'O prazo da prova terminou. Esta resposta não foi aceita.',
  SESSAO_ENCERRADA: 'Esta sessão já foi encerrada. Comece outra para continuar.',
  ITEM_JA_RESPONDIDO: 'Este exercício já foi respondido nesta sessão.',
  SESSAO_ATIVA: 'Já existe uma sessão em andamento. Retome ou encerre antes de começar outra.',
  SESSAO_ATIVA_NAO_CORRIGE: 'Encerre a sessão antes de pedir a correção.',
  SEM_EXERCICIOS:
    'Não há exercícios disponíveis para este modo. Crie exercícios ou escolha outros conceitos.',
  PROVA_SEM_CONCEITOS: 'Escolha de 1 a 10 conceitos para a Prova.',
  QUOTA_EXCEEDED:
    'A cota da sua IA acabou. As respostas ficam pendentes e podem ser reenviadas depois.',
  SUBSCRIPTION_REQUIRED:
    'A IA escolhida não está disponível agora. Confira o login nas configurações.',
  HARNESS_CHANGED:
    'A escolha de IA mudou em outra aba. Confira as configurações e repita o pedido.',
  FILA_CHEIA: 'Há respostas demais aguardando correção. Reenvie ou descarte as pendentes.',
  RESPOSTA_INVALIDA: 'A resposta não pôde ser aceita. Confira o conteúdo e tente de novo.',
  JA_CORRIGIDA: 'Esta resposta já foi corrigida.',
  REVISION_CONFLICT: 'Outra aba alterou seus estudos. Recarregue e tente de novo.',
  INVALID_AI_RESPONSE: 'A IA devolveu uma correção fora do formato. Tente reenviar.',
  PROVIDER_TIMEOUT: 'A IA demorou demais para responder. Tente reenviar.',
  CODEX_TIMEOUT: 'A IA demorou demais para responder. Tente reenviar.',
  MODEL_UNAVAILABLE: 'O modelo configurado não está disponível. Confira as configurações.',
  INVALID_API_KEY: 'O login da IA foi recusado. Confira as configurações.',
  ENVIO_INEXISTENTE: 'Esta resposta não existe mais.',
  SESSAO_INEXISTENTE: 'Esta sessão não existe mais.',
  ITEM_FORA_DA_SESSAO: 'Este exercício não faz parte da sessão.',
  CONCEITO_NAO_DOMINADO: 'Só conceitos dominados sem ajuda podem entrar em uma skill.',
  DADOS_SENSIVEIS: 'O texto tem dados sensíveis. Revise os avisos antes de salvar.',
  VERSAO_DESATUALIZADA: 'Esta skill mudou desde que você abriu a revisão. Gere a proposta de novo.',
  GIT_SEM_IDENTIDADE:
    'Configure sua identidade no git (git config --global user.name e user.email) e tente de novo.',
  NADA_A_COMMITAR: 'Nada mudou em relação à versão já registrada.',
  SEM_GIT: 'O git não está instalado. Instale em git-scm.com e tente de novo.',
  SEM_DESTINO: 'Escolha primeiro onde as skills serão guardadas.',
  SEM_REMOTO: 'Este repositório não tem um remoto "origin" configurado.',
  REMOTO_DIFERENTE: 'O remoto confirmado não é o atual. Confira e confirme de novo.',
  REMOTO_RECUSADO: 'Este remoto não pode receber skills (use um repositório do GitHub seu).',
  NADA_A_ENVIAR: 'Não há commits novos para enviar.',
  NADA_A_MELHORAR: 'Nada mudou desde a versão anterior da skill.',
  SKILL_INVALIDA: 'O SKILL.md não está válido. Confira o cabeçalho (name e description).',
  SEM_REPOSITORIO: 'A pasta de destino ainda não é um repositório git.',
  DESTINO_INVALIDO: 'Esse destino não pode ser usado. Confira o caminho da pasta.',
  SEM_PUSH_IN_REPO: 'Não há envio automático para skills-geradas/.',
  SO_MODO_LOCAL: 'As skills só funcionam no modo local de estudo (GURIA_LOCAL=true).',
  MANIFESTO_INVALIDO:
    'A pasta desta skill existe, mas o manifesto está ausente ou inválido. Corrija ou remova a pasta.',
  DESTINO_DENTRO_DE_REPOSITORIO:
    'Essa pasta está dentro de outro repositório git. Escolha a pasta raiz do repositório de skills.',
  ESTADO_MUDOU: 'O repositório mudou depois que você abriu a confirmação. Confirme de novo.',
  CAMINHO_INVALIDO: 'Um dos arquivos da skill tem um caminho não permitido.',
};

export const KNOWN_ERROR_CODES = Object.keys(MESSAGES);

export function friendlyError(code: string | undefined, fallback: string): string {
  return (code && MESSAGES[code]) || fallback;
}
