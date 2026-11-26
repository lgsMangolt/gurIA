import type { StudyMode } from '../domain';

export const MODE_LABELS: Record<StudyMode, { title: string; blurb: string }> = {
  rapido: {
    title: 'Rápido',
    blurb: 'De 15 a 20 minutos de escolha e ligar, com feedback na hora. Pesa pouco no domínio.',
  },
  aprofundar: {
    title: 'Aprofundar',
    blurb:
      'Desenho, ligar e escrita, no seu ritmo, com explicação. É o que mais conta para o domínio.',
  },
  prova: {
    title: 'Prova',
    blurb: 'Com tempo. Você só vê o resultado no final, e a correção por IA é feita em lote.',
  },
  revisao: {
    title: 'Revisão espaçada',
    blurb:
      'Perguntas curtas dos conceitos vencidos ou com erro recente. Um erro devolve o conceito a "em estudo".',
  },
};

export const CONFIDENCE_LEVELS = [
  { id: 'chute', label: 'Chutando', value: 0.25 },
  { id: 'meio', label: 'Mais ou menos', value: 0.6 },
  { id: 'certeza', label: 'Tenho certeza', value: 0.9 },
] as const;

export const COST_NOTICE_DRAWING =
  'Este desenho será enviado à IA escolhida e consome sua cota. Deseja enviar?';

export const STATE_LABELS = {
  pendente: 'Pendente de correção',
  falhou: 'Falhou',
  corrigida: 'Corrigida',
} as const;

// Espelha GRADE_BATCH_LIMIT de exercises/submission-service.ts (um teste confere).
export const BATCH_LIMIT = 12;

export function costNotice(estimate: {
  writings: number;
  drawings: number;
  total: number;
  overLimit: boolean;
}): string {
  const parts: string[] = [];
  if (estimate.writings)
    parts.push(`${estimate.writings} ${estimate.writings === 1 ? 'texto' : 'textos'}`);
  if (estimate.drawings)
    parts.push(`${estimate.drawings} ${estimate.drawings === 1 ? 'desenho' : 'desenhos'}`);
  if (!parts.length) return '';
  let text = `Serão enviados à IA escolhida: ${parts.join(' e ')}. Desenhos consomem mais cota.`;
  if (estimate.overLimit) text += ` Só os primeiros ${BATCH_LIMIT} serão corrigidos agora.`;
  return text;
}

export const practiceCopy = {
  tab: 'Praticar',
  chooseMode: 'Escolha como quer estudar agora',
  chooseConcepts: 'Conceitos (opcional; obrigatório na Prova, de 1 a 10)',
  start: 'Começar sessão',
  resume: 'Sessão em andamento',
  confidenceTitle: 'Quanta confiança você tem antes de responder?',
  answer: 'Responder',
  skip: 'Pular este item',
  next: 'Próximo',
  finish: 'Encerrar sessão',
  registered: 'Resposta registrada.',
  timeUp: 'Tempo esgotado.',
  gradeNow: 'Corrigir agora',
  confirmSend: 'Confirmar e enviar',
  cancel: 'Cancelar',
  summaryTitle: 'Resumo da sessão',
  pendingTitle: 'Respostas pendentes',
  regrade: 'Reenviar',
  discard: 'Descartar',
  gradePending: 'Corrigir pendentes',
  waitingProva: 'Aguardando o fim da prova',
} as const;
