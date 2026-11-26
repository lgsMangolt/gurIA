# gurIA Fase 2A — Domínio e modelo de exercícios — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar a regra de domínio pela aprovada (duas demonstrações sem ajuda, com 3 dias de intervalo) e criar o modelo de dados dos quatro tipos de exercício, com migração das perguntas antigas e correção local de `escolha` e `ligar`. Sem interface nova e sem IA nesta parte.

**Architecture:** Funções puras em `lib/study` (domínio e `lib/study/exercises/*`), cobertas por testes. As tentativas ganham metadados opcionais com padrão seguro, então os dados atuais continuam válidos. A fase 2 inteira é dividida em quatro planos, nesta ordem: **2A** (este: domínio e modelo), **2B** (correção por IA com rubrica, estados pendente/falhou e lote da Prova), **2C** (sessões persistidas e os quatro modos, integrados ao planejador), **2D** (interface: seletor de modo e telas dos quatro tipos, incluindo o canvas de desenho).

**Tech Stack:** TypeScript, zod, vitest (`vitest.study.config.ts`).

**Spec:** `docs/superpowers/specs/2026-11-17-guria-reestruturacao-design.md` (seções "Modos de estudo", "Motor de exercícios" e "Definição de domínio")

## Global Constraints

- Português brasileiro em todo texto visível.
- Regra de domínio, valores do spec: dominado = acerto em **2** sessões diferentes, com pelo menos **3** dias entre elas, em `ligar`, `desenho` ou `escrita`, **sem ajuda**. Ajuda = dica, explicação aberta antes da resposta, nova tentativa logo após ver o feedback. Acertos no modo Rápido ou só em `escolha` têm peso baixo e não bastam sozinhos. Erro em **revisão espaçada** devolve o conceito a "em estudo". Os limites ficam em constantes exportadas (`MASTERY_MIN_EVIDENCE = 2`, `MASTERY_MIN_GAP_DAYS = 3`), porque o dono vai ajustá-los depois de testar.
- Tipos de exercício: `escolha`, `ligar`, `desenho`, `escrita`. Modos: `rapido`, `aprofundar`, `prova`, `revisao`.
- Dados existentes (workspace `study-local`, revisão 76) precisam continuar válidos em `workspaceSchema` sem migração de banco.
- Trabalhar na branch `guria`. **Nunca** `git push`. **Nunca** `git add -A`/`git add .`: só caminhos explícitos (`AGENTS.md` e `tsconfig.json` têm alterações do dono que não são desta parte).
- Não escrever no banco da instalação pessoal (porta 5440). A Task 5 só lê.
- Ao concluir: `node node_modules/vitest/vitest.mjs run --config vitest.study.config.ts` e `node node_modules/typescript/bin/tsc -p tsconfig.study.json --noEmit` passam.

## Review Focus

- Tentativas antigas (sem os campos novos, tipos `explanation`/`application`) continuam válidas e contam como evidência (Tasks 1 e 2).
- Duas evidências no mesmo dia, ou com menos de 3 dias, não dominam; vale a diferença em dias de calendário local (Task 2).
- Um erro em `revisao` retira o domínio e exige duas evidências novas; um erro em outro modo não retira (Task 2).
- Entradas inválidas: confiança fora de 0..1, `escolha` com índice de resposta fora das opções, `ligar` com lado repetido (Tasks 1 e 3).
- O workspace real do dono (JSON exportado) passa em `workspaceSchema` e o relatório mostra quais conceitos mudam de estado (Task 5).

---

### Task 1: Metadados da tentativa e `recordAnswer`

**Files:**
- Modify: `lib/study/domain.ts` (schema de `attempts` e `recordAnswer`)
- Test: `tests/study/attempts.test.ts`

**Interfaces:**
- Produces (em `lib/study/domain.ts`):
  - `attemptKinds = ['choice','explanation','application','connect','draw','write'] as const`; `type AttemptKind`.
  - `studyModes = ['rapido','aprofundar','prova','revisao'] as const`; `type StudyMode`.
  - `type AttemptExtra = { mode?: StudyMode; helped?: boolean; confidence?: number; sessionId?: string }`.
  - `recordAnswer(node: Concept, correct: boolean, kind: AttemptKind, score = Number(correct), now = Date.now(), sourceId?: string, extra: AttemptExtra = {}): Concept`. Os seis primeiros parâmetros mantêm o significado atual.
  - Cada tentativa gravada tem `{ at, sourceId?, correct, kind, score, mode?, helped: boolean, confidence?, sessionId? }`.

- [ ] **Step 1: Escrever os testes que falham** (`tests/study/attempts.test.ts`, nomes exatos)

  - `guarda modo, ajuda, confiança e sessão na tentativa`: `recordAnswer(base, true, 'write', 1, t0, undefined, { mode: 'aprofundar', helped: false, confidence: 0.7, sessionId: 's1' })` → `attempts[0]` contém esses quatro valores e `kind === 'write'`.
  - `tentativa antiga sem campos novos continua válida e helped vale false`: `workspaceSchema.parse` de um workspace cujo conceito tem `attempts: [{ at: 1, correct: true, kind: 'application', score: 1 }]` não lança, e `attempts[0].helped === false`.
  - `acerto com ajuda não avança o intervalo`: após um acerto sem ajuda em `t0` (`due = t0 + 1 dia`), um acerto **com** `helped: true` em `t0 + 1 dia` deixa `due === t0 + 2 dias` (e não `t0 + 4 dias`).
  - `confiança fora de 0..1 é recusada`: `workspaceSchema.parse` com `confidence: 1.5` lança.

- [ ] **Step 2: Rodar e ver falhar**

  Run: `node node_modules/vitest/vitest.mjs run --config vitest.study.config.ts tests/study/attempts.test.ts`
  Expected: FAIL (`kind 'write'` inválido, campos ausentes).

- [ ] **Step 3: Implementar** em `lib/study/domain.ts`: extrair `attemptSchema` com `kind: z.enum(attemptKinds)`, `mode` opcional (`z.enum(studyModes)`), `helped: z.boolean().default(false)`, `confidence: z.number().min(0).max(1).optional()`, `sessionId: z.string().optional()`; usar no `conceptSchema`. Em `recordAnswer`: gravar os campos de `extra`; o intervalo é 1 dia quando `!correct || extra.helped`, e a contagem de dias distintos que escolhe o degrau `[1,3,7,14,30]` considera só acertos sem ajuda.

- [ ] **Step 4: Rodar e ver passar**

  Run: o comando do Step 2.
  Expected: PASS (4 testes). Rodar também `tests/study/domain.test.ts` e `tests/study/learning-lifecycle.test.ts`; **não** devem mudar de resultado nesta task.

- [ ] **Step 5: Commit**

```bash
git add lib/study/domain.ts tests/study/attempts.test.ts
git commit -m "feat: metadados na tentativa (modo, ajuda, confiança, sessão)"
```

---

### Task 2: Nova regra de domínio

**Files:**
- Modify: `lib/study/domain.ts` (`mastery`), `tests/study/domain.test.ts`, `tests/study/graph-status.test.ts`, `tests/study/learning-lifecycle.test.ts`
- Test: `tests/study/mastery.test.ts`

**Interfaces:**
- Consumes: `attemptKinds`, `StudyMode`, tentativas da Task 1.
- Produces (em `lib/study/domain.ts`):
  - `MASTERY_MIN_EVIDENCE = 2`, `MASTERY_MIN_GAP_DAYS = 3`, `EVIDENCE_KINDS: AttemptKind[] = ['connect','draw','write','application','explanation']`.
  - `isEvidence(a: Attempt): boolean` = `a.correct && !a.helped && EVIDENCE_KINDS.includes(a.kind)`.
  - `mastery(node): { fraction: number; mastered: boolean; days: number; accuracy: number; evidenceCount: number }`. `days` e `accuracy` mantêm o significado atual (dias distintos com acerto e proporção de acertos).

- [ ] **Step 1: Escrever os testes que falham** (`tests/study/mastery.test.ts`; use datas locais fixas, ex.: `new Date('2026-11-03T12:00:00-03:00')`)

  - `só escolha nunca domina, mesmo em muitos dias`: 5 acertos `choice` em 5 dias → `mastered === false` e `fraction <= 0.3`.
  - `duas evidências sem ajuda com 3 dias de intervalo dominam`: `write` no dia 0 e `write` no dia 3 → `mastered === true`.
  - `duas evidências com menos de 3 dias não dominam`: dia 0 e dia 2 → `false`.
  - `duas evidências no mesmo dia não dominam`: dois `draw` no dia 0 → `false`.
  - `evidência com ajuda não conta`: `write` com `helped: true` no dia 0 e `write` no dia 3 → `false`.
  - `application e explanation antigos contam como evidência`: `application` no dia 0 e `explanation` no dia 3 → `true`.
  - `erro em revisão espaçada retira o domínio e exige duas evidências novas`: `write` d0, `write` d3 (dominado); `choice` errado com `mode: 'revisao'` em d10 → `false`; `write` d11 e `write` d14 → `true`.
  - `erro fora de revisão espaçada não retira o domínio`: mesmo caso, mas o erro em d10 com `mode: 'prova'` → continua `true`.
  - `a diferença é em dias de calendário local`: evidências em `2026-11-03T23:50-03:00` e `2026-11-06T00:10-03:00` → `true`.
  - `sem tentativas, nada`: `fraction === 0` e `mastered === false`.

- [ ] **Step 2: Rodar e ver falhar**

  Run: `node node_modules/vitest/vitest.mjs run --config vitest.study.config.ts tests/study/mastery.test.ts`
  Expected: FAIL (a regra antiga ainda vale).

- [ ] **Step 3: Implementar `mastery`** com estas regras:
  - Janela de evidência: tentativas **posteriores** à última tentativa errada com `mode === 'revisao'` (ou todas, se não houver).
  - `evidenceCount` = quantidade de `isEvidence` na janela. `mastered` = `evidenceCount >= MASTERY_MIN_EVIDENCE` e a diferença em dias de calendário local entre a primeira e a última evidência da janela é `>= MASTERY_MIN_GAP_DAYS`.
  - `fraction = Math.min(0.95, 0.1 * Math.min(diasDistintosComAcertoDeEscolhaSemAjuda, 3) + 0.4 * Math.min(evidenceCount, 2))` (0 sem tentativas).

- [ ] **Step 4: Atualizar os testes antigos que codificavam a regra velha** (3 dias + aplicação + 80%), mantendo a intenção de cada um: `tests/study/domain.test.ts` ("requires spaced successes and application"), `tests/study/graph-status.test.ts` (o caso "verde só enquanto a revisão está em dia") e `tests/study/learning-lifecycle.test.ts` (ciclo novo/aprendizagem/revisão/domínio e o limite de 80%). Em cada um, trocar as tentativas por evidências (`write`/`application`) com os intervalos da nova regra, e remover a expectativa de 80% de acerto como condição de domínio (ela deixa de existir na regra).

- [ ] **Step 5: Rodar tudo**

  Run: `node node_modules/vitest/vitest.mjs run --config vitest.study.config.ts`
  Expected: tudo PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/study/domain.ts tests/study/mastery.test.ts tests/study/domain.test.ts tests/study/graph-status.test.ts tests/study/learning-lifecycle.test.ts
git commit -m "feat: regra de domínio com duas evidências sem ajuda e 3 dias de intervalo"
```

---

### Task 3: Modelo dos exercícios e migração das perguntas

**Files:**
- Create: `lib/study/exercises/schema.ts`, `lib/study/exercises/migrate.ts`
- Modify: `lib/study/domain.ts` (campo `exercises` no conceito)
- Test: `tests/study/exercises.test.ts`

**Interfaces:**
- Consumes: `Concept`, `Workspace` (apenas tipos, `import type`, para não criar ciclo).
- Produces (`lib/study/exercises/schema.ts`):
  - `rubricItemSchema = { criterion: string (1..300), weight: number (0.1..5, padrão 1) }`.
  - `escolhaSchema`: `{ type:'escolha', id, prompt, options: string[] (2..6), answerIndexes: number[] (min 1, cada um < options.length, sem repetição), explanation: string (padrão '') }`.
  - `ligarSchema`: `{ type:'ligar', id, prompt, pairs: {left,right}[] (2..8), lados esquerdos únicos e direitos únicos }`.
  - `desenhoSchema`: `{ type:'desenho', id, prompt, rubric: rubricItem[] (2..6) }`.
  - `escritaSchema`: `{ type:'escrita', id, prompt, rubric: rubricItem[] (2..6), minChars: int (0..5000, padrão 0) }`.
  - `exerciseSchema = z.discriminatedUnion('type', [...])`; `type Exercise`; `type ExerciseType`.
  - `attemptKindOf(type: ExerciseType): AttemptKind` com `escolha→'choice'`, `ligar→'connect'`, `desenho→'draw'`, `escrita→'write'`.
- Produces (`lib/study/exercises/migrate.ts`):
  - `exercisesOf(concept: Concept): Exercise[]`: devolve `concept.exercises` se não vazio; senão, se há `concept.question`, um `escolha` derivado com `id: 'escolha:' + concept.id`; senão `[]`.
  - `materializeExercises(workspace: Workspace): Workspace`: preenche `exercises` dos conceitos que têm `question` e nenhum exercício; idempotente; **mantém** `question` (o player do OpenMAIC ainda a usa até a fase 4).
- `conceptSchema` ganha `exercises: z.array(exerciseSchema).max(30).default([])`.

- [ ] **Step 1: Escrever os testes que falham** (`tests/study/exercises.test.ts`)

  - `escolha válida passa e índice de resposta fora das opções é recusado`.
  - `escolha com menos de 2 opções é recusada`.
  - `ligar com lado esquerdo repetido é recusado`.
  - `desenho e escrita exigem de 2 a 6 itens de rubrica`.
  - `attemptKindOf mapeia os quatro tipos`.
  - `exercisesOf deriva um escolha da pergunta antiga` (4 opções, `answerIndexes: [answerIndex]`, `explanation` copiada, id `escolha:<id>`).
  - `exercisesOf devolve [] sem pergunta nem exercícios` e `exercisesOf prefere os exercícios do conceito`.
  - `materializeExercises é idempotente e mantém a pergunta antiga`: duas aplicações seguidas dão o mesmo resultado e `concept.question` continua presente.
  - `conceito antigo sem o campo exercises continua válido`: `workspaceSchema.parse` do fixture de `scripts/readme-demo/fixture.ts` (`buildDemoWorkspace()`) passa e cada conceito sai com `exercises: []`.

- [ ] **Step 2: Rodar e ver falhar**

  Run: `node node_modules/vitest/vitest.mjs run --config vitest.study.config.ts tests/study/exercises.test.ts`
  Expected: FAIL (módulos não existem).

- [ ] **Step 3: Implementar** os dois módulos e o campo `exercises` em `conceptSchema`. As regras de unicidade e de intervalo usam `.refine`/`.superRefine` com mensagens em português.

- [ ] **Step 4: Rodar e ver passar** (arquivo novo e a suíte inteira)

  Run: `node node_modules/vitest/vitest.mjs run --config vitest.study.config.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/study/exercises lib/study/domain.ts tests/study/exercises.test.ts
git commit -m "feat: modelo dos exercícios e migração das perguntas antigas"
```

---

### Task 4: Correção local de `escolha` e `ligar`

**Files:**
- Create: `lib/study/exercises/grade-local.ts`
- Test: `tests/study/grade-local.test.ts`

**Interfaces:**
- Consumes: `Exercise` (Task 3).
- Produces:
  - `type LocalGrade = { correct: boolean; score: number }`.
  - `gradeEscolha(exercise: Extract<Exercise,{type:'escolha'}>, chosen: number[]): LocalGrade`: acerto só se o conjunto escolhido é igual ao de `answerIndexes`; `score` 1 ou 0.
  - `gradeLigar(exercise: Extract<Exercise,{type:'ligar'}>, matches: Record<string, string>): LocalGrade`: `matches` liga o lado esquerdo ao direito escolhido; `score` = fração de pares certos; `correct` só se todos certos.

- [ ] **Step 1: Escrever os testes que falham**

  - `escolha única certa e errada`, `escolha múltipla exige o conjunto exato` (falta uma ou sobra uma → errado), `índices repetidos na resposta contam uma vez`.
  - `ligar com todos os pares certos dá 1`, `ligar com metade certa dá score 0.5 e correct false`, `ligar ignora lado esquerdo inexistente`.

- [ ] **Step 2: Rodar e ver falhar**

  Run: `node node_modules/vitest/vitest.mjs run --config vitest.study.config.ts tests/study/grade-local.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implementar** as duas funções puras (sem IA, sem acesso a banco).

- [ ] **Step 4: Rodar e ver passar**

  Run: o comando do Step 2.
  Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/study/exercises/grade-local.ts tests/study/grade-local.test.ts
git commit -m "feat: correção local de escolha e ligar"
```

---

### Task 5: Textos, contexto do MCP e relatório de impacto nos dados reais

**Files:**
- Modify: `components/study/StudyApp.tsx` (parágrafo do conceito, hoje `{node.attempts.length} respostas · {mastery(node).days} dias com acertos. O domínio exige revisão espaçada e aplicação.`), `lib/study/context.ts` (objeto `progress`), `docs/guia/estudos.md` (seção "Domínio de um conceito")
- Create: `lib/study/mastery-impact.ts`, `scripts/mastery-impact.ts`
- Test: `tests/study/mastery-impact.test.ts`, ajuste em `tests/study/context.test.ts`

**Interfaces:**
- Consumes: `mastery`, `isEvidence` (Task 2), `workspaceSchema`.
- Produces:
  - `legacyMastered(node: Concept): boolean`: a regra **antiga** (3 dias distintos com acerto, ao menos um acerto que não seja `choice`, 80% de acerto), só para comparação.
  - `compareMastery(concepts: Concept[]): { total: number; before: number; after: number; lost: string[]; gained: string[] }` (rótulos dos conceitos que mudam).
  - `progress` do contexto do MCP ganha `evidence: number` (= `mastery(node).evidenceCount`) mantendo os campos atuais.
  - Script: `node node_modules/tsx/dist/cli.mjs scripts/mastery-impact.ts <arquivo.json>` imprime os totais e os rótulos que mudam.

- [ ] **Step 1: Escrever os testes que falham**

  - `legacyMastered reproduz a regra antiga` (3 dias + aplicação + 80% → `true`; 2 dias → `false`).
  - `compareMastery conta quem perde e quem ganha domínio` com três conceitos construídos à mão.
  - `o contexto do MCP expõe a quantidade de evidências` (ajuste em `context.test.ts`).
  - `o guia explica a regra nova`: `docs/guia/estudos.md` contém `duas demonstrações sem sua ajuda` e `3 dias`, e não contém `três dias distintos`.
  - `o texto do conceito descreve a regra nova`: `StudyApp.tsx` contém `evidências sem ajuda` e não contém `exige revisão espaçada e aplicação`.

- [ ] **Step 2: Rodar e ver falhar**

  Run: `node node_modules/vitest/vitest.mjs run --config vitest.study.config.ts tests/study/mastery-impact.test.ts tests/study/context.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implementar** `mastery-impact.ts`, o script fino que lê o JSON e valida com `workspaceSchema`, o campo `evidence` em `context.ts`, o novo texto em `StudyApp.tsx` (`{node.attempts.length} respostas · {mastery(node).evidenceCount} evidências sem ajuda. O domínio exige duas demonstrações sem ajuda (ligar, desenhar ou escrever), com pelo menos 3 dias de intervalo.`) e a seção do guia ("Domínio de um conceito") com a regra nova.

- [ ] **Step 4: Rodar tudo**

  Run: `node node_modules/vitest/vitest.mjs run --config vitest.study.config.ts` e `node node_modules/typescript/bin/tsc -p tsconfig.study.json --noEmit`
  Expected: PASS e `tsc` sem erros.

- [ ] **Step 5: Relatório com os dados reais (somente leitura)**

  Exportar o workspace do dono para o scratchpad, **sem commitar o arquivo**: `docker exec guria-db-postgres-1 sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select data from study_workspace where owner_id=\$\$study-local\$\$"' > <scratchpad>/workspace.json`, depois rodar o script do relatório sobre esse arquivo.
  Expected: `workspaceSchema.parse` passa sobre o JSON real; o relatório imprime `total`, `before`, `after` e os rótulos que mudam. Mostrar o resultado ao dono (é a prévia do que ele verá no mapa).

- [ ] **Step 6: Commit** (sem o JSON exportado)

```bash
git add components/study/StudyApp.tsx lib/study/context.ts lib/study/mastery-impact.ts scripts/mastery-impact.ts docs/guia/estudos.md tests/study/mastery-impact.test.ts tests/study/context.test.ts
git commit -m "feat: textos da nova regra e relatório de impacto do domínio"
```

---

## Autoavaliação

- **Cobertura do spec (partes 2A):** regra de domínio e perda por erro em revisão (Task 2), definição de ajuda e peso baixo de `escolha` (Tasks 1 e 2), quatro tipos de exercício com rubrica e `minChars` (Task 3), migração das perguntas antigas (Task 3), correção local de `escolha`/`ligar` (Task 4), confiança antes de responder gravada na tentativa (Task 1), limites ajustáveis em constantes (Task 2), texto da regra no app e no guia (Task 5).
- **Fica para 2B/2C/2D:** correção por IA e pendência por cota (2B), sessão persistida, cronômetro da Prova e seleção da Revisão espaçada (2C), seletor de modo e telas dos exercícios, incluindo o canvas (2D).
- **Consistência de nomes:** `AttemptKind`, `StudyMode`, `AttemptExtra`, `isEvidence`, `EVIDENCE_KINDS`, `exercisesOf`, `materializeExercises`, `attemptKindOf`, `gradeEscolha`, `gradeLigar` são usados com a mesma grafia em todas as tasks.
- **Efeito visível nos dados reais:** conceitos hoje "dominados" só por três dias de acerto de `escolha` deixam de estar. A Task 5 mostra a lista antes de o dono abrir o app.
