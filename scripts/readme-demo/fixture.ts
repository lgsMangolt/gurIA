import type { Concept, Workspace } from '../../lib/study/domain';

const DAY = 86400000;
type Attempt = Concept['attempts'][number];

// Dados inteiramente inventados para screenshots públicos. Nada aqui vem de materiais reais.
export function buildDemoWorkspace(now = Date.now()): Workspace {
  const day = (offset: number) => new Date(now + offset * DAY).toISOString().slice(0, 10);
  const attempt = (daysAgo: number, kind: Attempt['kind'], correct = true): Attempt => ({
    at: now - daysAgo * DAY,
    correct,
    kind,
    score: correct ? 1 : 0,
    helped: false,
  });
  const concept = (
    id: string,
    label: string,
    summary: string,
    courseId: string,
    attempts: Attempt[],
    dueInDays: number,
    exercises: Concept['exercises'] = [],
  ): Concept => ({
    id,
    label,
    summary,
    note: '',
    courseIds: [courseId],
    origin: 'lesson',
    evidence: [],
    attempts,
    due: attempts.length ? now + dueInDays * DAY : 0,
    exercises,
  });
  const rubric = (a: string, b: string) => [
    { criterion: a, weight: 1 },
    { criterion: b, weight: 1 },
  ];
  const choice = (id: string, prompt: string, options: string[], right: number, why: string) => ({
    type: 'escolha' as const,
    id,
    prompt,
    options,
    answerIndexes: [right],
    explanation: why,
  });
  const match = (id: string, prompt: string, pairs: [string, string][]) => ({
    type: 'ligar' as const,
    id,
    prompt,
    pairs: pairs.map(([left, right]) => ({ left, right })),
  });
  const writing = (id: string, prompt: string, a: string, b: string) => ({
    type: 'escrita' as const,
    id,
    prompt,
    rubric: rubric(a, b),
    minChars: 20,
  });
  const drawing = (id: string, prompt: string, a: string, b: string) => ({
    type: 'desenho' as const,
    id,
    prompt,
    rubric: rubric(a, b),
  });
  const mastered = [attempt(9, 'choice'), attempt(6, 'explanation'), attempt(2, 'application')];
  const learning = [attempt(3, 'choice'), attempt(1, 'choice', false)];

  const concepts: Concept[] = [
    concept('c1', 'População e amostra', 'Quem se quer estudar e quem foi de fato medido.', 'stats', mastered, 14, [
      choice('c1-e', 'O que é uma amostra?', ['O grupo todo', 'Uma parte medida do grupo', 'Um gráfico'], 1, 'A amostra é a parte da população que foi de fato medida.'),
      match('c1-l', 'Ligue o termo à ideia', [['População', 'Todos os casos de interesse'], ['Amostra', 'Parte observada'], ['Parâmetro', 'Valor da população']]),
    ]),
    concept('c2', 'Média e mediana', 'Duas formas de resumir o centro dos dados.', 'stats', mastered, 7, [
      choice('c2-e', 'Qual medida resiste melhor a valores extremos?', ['Média', 'Mediana', 'Amplitude'], 1, 'A mediana não é puxada por valores extremos.'),
      match('c2-l', 'Ligue a medida ao uso', [['Média', 'Centro aritmético'], ['Mediana', 'Valor do meio'], ['Moda', 'Valor mais comum']]),
    ]),
    concept('c3', 'Variância', 'Quanto os valores se afastam da média.', 'stats', learning, 2, [
      choice('c3-e', 'A variância mede…', ['O centro dos dados', 'O afastamento da média', 'A quantidade de dados'], 1, 'Quanto os valores se afastam da média.'),
      match('c3-l', 'Ligue o termo à definição', [['Variância', 'Média dos desvios ao quadrado'], ['Desvio', 'Distância até a média'], ['Amplitude', 'Maior menos menor']]),
      writing('c3-w', 'Explique com suas palavras o que é variância e dê um exemplo.', 'Define variância corretamente', 'Dá um exemplo concreto'),
      drawing('c3-d', 'Desenhe dois conjuntos de pontos, um com pouca e outro com muita variância.', 'Mostra a diferença de dispersão', 'Identifica qual tem mais variância'),
    ]),
    concept('c4', 'Desvio padrão', 'Raiz da variância, na mesma unidade dos dados.', 'stats', learning, 3, [
      choice('c4-e', 'O desvio padrão é…', ['O quadrado da variância', 'A raiz da variância', 'A média dos dados'], 1, 'É a raiz quadrada da variância, na unidade original.'),
      match('c4-l', 'Ligue a medida à unidade', [['Variância', 'Unidade ao quadrado'], ['Desvio padrão', 'Mesma unidade dos dados'], ['Média', 'Mesma unidade dos dados (centro)']]),
      writing('c4-w', 'Por que o desvio padrão é mais fácil de interpretar que a variância?', 'Cita a unidade dos dados', 'Relaciona com a variância'),
      drawing('c4-d', 'Desenhe uma curva em sino marcando a média e um desvio padrão.', 'Marca a média no centro', 'Mostra um desvio padrão de cada lado'),
    ]),
    concept('c5', 'Distribuição normal', 'Curva em sino definida por média e desvio.', 'stats', [attempt(10, 'choice')], -1),
    concept('c6', 'Intervalo de confiança', 'Faixa plausível para o valor verdadeiro.', 'stats', [], 0),
    concept('c7', 'Teste de hipótese', 'Comparar uma suposição com os dados observados.', 'stats', [], 0),
    concept('c8', 'Variáveis e tipos', 'Números, textos e listas em Python.', 'py', mastered, 10),
    concept('c9', 'Listas e dicionários', 'Coleções para guardar e consultar dados.', 'py', mastered, 5),
    concept('c10', 'Funções', 'Blocos reutilizáveis com entrada e saída.', 'py', learning, 2),
    concept('c11', 'Laços e condições', 'Repetir e decidir ao longo do código.', 'py', [attempt(12, 'choice')], -2),
    concept('c12', 'Tabelas com pandas', 'Ler, filtrar e agrupar dados em colunas.', 'py', [], 0),
    concept('c13', 'Gráficos com matplotlib', 'Transformar números em figuras.', 'py', [], 0),
    concept('c14', 'Correlação', 'Relação entre duas variáveis numéricas.', 'stats', learning, 4),
  ];
  const link = (id: string, source: string, target: string, relation: string) => ({
    id,
    source,
    target,
    relation,
  });

  return {
    improvement: { events: [] },
    courses: [
      {
        id: 'stats',
        title: 'Introdução à Estatística',
        url: '',
        minutes: 600,
        practiceMinutes: 120,
        reviewMinutes: 60,
        completedMinutes: 240,
        deadline: day(45),
        hoursSource: 'estimate',
        learningType: 'course',
        sourceNote: '',
        lessons: [
          { id: 'stats-1', title: 'Dados e amostras', minutes: 40 },
          { id: 'stats-2', title: 'Resumindo dados', minutes: 50 },
          { id: 'stats-3', title: 'Distribuições', minutes: 60 },
        ],
      },
      {
        id: 'py',
        title: 'Python para Dados',
        url: '',
        minutes: 480,
        practiceMinutes: 120,
        reviewMinutes: 40,
        completedMinutes: 200,
        deadline: day(60),
        hoursSource: 'estimate',
        learningType: 'course',
        sourceNote: '',
        lessons: [
          { id: 'py-1', title: 'Primeiros passos', minutes: 30 },
          { id: 'py-2', title: 'Coleções', minutes: 45 },
          { id: 'py-3', title: 'Funções', minutes: 40 },
        ],
      },
    ],
    concepts,
    connections: [
      link('e1', 'c1', 'c2', 'prepara'),
      link('e2', 'c2', 'c3', 'prepara'),
      link('e3', 'c3', 'c4', 'origina'),
      link('e4', 'c4', 'c5', 'descreve'),
      link('e5', 'c5', 'c6', 'sustenta'),
      link('e6', 'c6', 'c7', 'sustenta'),
      link('e7', 'c3', 'c14', 'relacionado'),
      link('e8', 'c8', 'c9', 'prepara'),
      link('e9', 'c9', 'c10', 'prepara'),
      link('e10', 'c11', 'c10', 'combina com'),
      link('e11', 'c10', 'c12', 'prepara'),
      link('e12', 'c12', 'c13', 'prepara'),
      link('e13', 'c12', 'c2', 'calcula'),
      link('e14', 'c13', 'c14', 'mostra'),
    ],
    availability: [0, 60, 60, 90, 60, 60, 30],
    energy: 'normal',
    sessions: [
      { id: 's1', taskId: 'stats-1', courseId: 'stats', kind: 'lesson', date: day(-3), actualMinutes: 45, completedMinutes: 40, title: 'Dados e amostras' },
      { id: 's2', taskId: 'py-1', courseId: 'py', kind: 'lesson', date: day(-2), actualMinutes: 35, completedMinutes: 30, title: 'Primeiros passos' },
      { id: 's3', taskId: 'stats-2', courseId: 'stats', kind: 'practice', date: day(-1), actualMinutes: 30, completedMinutes: 20, title: 'Resumindo dados' },
    ],
    dayOverrides: {},
  };
}
