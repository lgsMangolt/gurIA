# gurIA Fase 2C — Sessões persistidas e os quatro modos — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a sessão de estudo persistida (`Rápido`, `Aprofundar`, `Prova`, `Revisão espaçada`), com seleção dos exercícios por modo, prazo da Prova controlado pelo servidor, respostas ligadas à sessão e integração com o planejador. Sem interface (fica na 2D).

**Architecture:** Funções puras em `lib/study/sessions/*` (modelo, ciclo de vida, seleção) testadas sem rede nem banco. Um serviço fino (`session-service.ts`) reaproveita `submitExercise`/`gradePendingBatch` da 2B, mas **o servidor decide o modo e o prazo**, nunca o cliente. Rotas novas `session-*` ligam o serviço ao banco. O planejador passa a enxergar conceitos que só têm `exercises` e sugere o modo de cada tarefa.

**Tech Stack:** TypeScript, zod, vitest (`vitest.study.config.ts`).

**Spec:** `docs/superpowers/specs/2026-11-17-guria-reestruturacao-design.md` (seções "1. Modos de estudo", "Escolhas do construtor": Prova e Sessão). Planos anteriores concluídos: 2A (`2026-11-19-fase-2a-dominio-e-exercicios.md`) e 2B (`2026-11-19-fase-2b-correcao-por-ia.md`).

## Global Constraints

- Português brasileiro em todo texto visível.
- Tabela de modos do spec, valores exatos: **Rápido** 15–20 min, formatos `escolha` e `ligar`, feedback imediato, peso baixo. **Aprofundar** duração livre, formatos `desenho`, `ligar` e `escrita`, feedback imediato com explicação, peso alto. **Prova** com tempo, formatos `escolha` e `escrita`, feedback só no final, correção em lote, peso alto. **Revisão espaçada** curta, recuperação curta (`escolha` ou, se não houver, `escrita`), feedback imediato, atualiza o intervalo.
- Prova: o servidor registra início e fim e **rejeita envio após prazo + tolerância** (`PROVA_TOLERANCE_MS = 60000`). O cronômetro do cliente é só aviso.
- O **modo e o `sessionId` de cada tentativa vêm da sessão no servidor**, nunca do corpo do pedido: o modo decide o peso e a perda de domínio, então o cliente não pode escolhê-lo por resposta.
- A IA só é chamada ao enviar ou reenviar (regra da 2B). A Prova adia a correção e só corrige quando pedido, em lote, com os limites da 2B. Nunca troca de provedor.
- Constantes exportadas (o dono vai ajustá-las): `SESSION_IDLE_MS = 12 * 3600 * 1000`, `PROVA_TOLERANCE_MS = 60000`, `MAX_ITEMS = { rapido: 10, aprofundar: 6, prova: 10, revisao: 8 }`, `RAPIDO_MAX_MINUTES = 20`, `PROVA_MIN_MINUTES = 10`, `PROVA_MAX_MINUTES = 90`, `ESTIMATE_MINUTES = { escolha: 1, ligar: 2, desenho: 6, escrita: 5 }`, `KEEP_ENDED_SESSIONS = 50`.
- Não confundir com `sessions` do workspace (registros de tempo de estudo, `sessionSchema`): a entidade nova se chama `studySessions`.
- Dados existentes continuam válidos: o campo novo tem `default([])`.
- Trabalhar na branch `guria`. **Nunca** `git push`. **Nunca** `git add -A`/`git add .`: só caminhos explícitos (`AGENTS.md` e `tsconfig.json` têm alterações do dono). Não rodar `prettier --write` em `lib/study` inteiro, só nos arquivos tocados.
- Não escrever no banco da instalação pessoal (porta 5440) nem chamar IA real nos testes.
- Ao concluir: `node node_modules/vitest/vitest.mjs run --config vitest.study.config.ts` e `node node_modules/typescript/bin/tsc -p tsconfig.study.json --noEmit` passam.

## Review Focus

- Envio depois do prazo da Prova + tolerância é recusado pelo servidor mesmo com o relógio do cliente adiantado; dentro da tolerância é aceito (Tasks 1 e 3).
- O cliente tenta mandar `mode`/`sessionId` próprios no envio: são ignorados em favor dos da sessão (Task 3).
- Iniciar sessão sem nenhum exercício elegível não cria sessão e explica por quê (Task 2).
- Segunda sessão ativa: recusada com mensagem clara; sessão esquecida aberta expira sozinha, sem timer (Tasks 1 e 3).
- Mesmo item respondido duas vezes na sessão, item de outra sessão ou de conceito fora da sessão: recusados (Task 3).
- Na Prova, nem o resultado local de `escolha` aparece antes do fim; depois de encerrar, o resultado e a correção em lote funcionam e uma cota esgotada deixa o resto pendente (Task 3).

---

### Task 1: Modelo da sessão e ciclo de vida (puro)

**Files:**
- Create: `lib/study/sessions/session.ts`
- Modify: `lib/study/domain.ts` (campo `studySessions` no workspace e em `emptyWorkspace`)
- Test: `tests/study/sessions.test.ts`

**Interfaces:**
- Consumes: `StudyMode`, `studyModes`, `Workspace` (`domain.ts`); `AppError` (`runtime/analysis.ts`); `Submission` (2B).
- Produces (`lib/study/sessions/session.ts`; o schema fica em `session-schema.ts` do mesmo diretório, importado por `domain.ts`, para não criar ciclo, como na 2B; os modos são duplicados e um teste confere):
  - Constantes do Global Constraints.
  - `studySessionSchema` = `{ id: string (1..200), mode: StudyMode, state: 'ativa'|'encerrada'|'expirada', startedAt: number, endedAt?: number, deadlineAt?: number (só Prova), limitMinutes?: int (só Prova), items: { conceptId: string, exerciseId: string, answeredAt?: number }[] (1..30) }`; `type StudySession`.
  - `workspaceSchema.studySessions: z.array(studySessionSchema).max(200).default([])`.
  - `activeSession(ws: Workspace, now: number): StudySession | undefined`: a sessão `ativa` não vencida (veja `isExpired`).
  - `isExpired(s: StudySession, now: number): boolean`: Prova com `now > deadlineAt + PROVA_TOLERANCE_MS`, ou qualquer modo com `now - lastActivity > SESSION_IDLE_MS` (`lastActivity` = maior `answeredAt` ou `startedAt`).
  - `expireStale(ws: Workspace, now: number): Workspace`: marca `expirada` (com `endedAt = now`) as `ativa` vencidas. Sem timers: chamada sempre que o servidor lê sessões.
  - `createSession(ws: Workspace, input: { id: string; mode: StudyMode; items: {conceptId; exerciseId}[]; limitMinutes?: number; now: number }): Workspace`: chama `expireStale`; recusa com `AppError(409,'SESSAO_ATIVA',…)` se já há sessão ativa; define `deadlineAt = now + limitMinutes*60000` só na Prova; idempotente por `id`; aplica `pruneSessions`.
  - `markAnswered(ws, sessionId, conceptId, exerciseId, now): Workspace`: carimba `answeredAt` do item; recusa `ITEM_JA_RESPONDIDO` (409) se já respondido, `ITEM_FORA_DA_SESSAO` (404) se o item não existe na sessão, `SESSAO_ENCERRADA` (409) se a sessão não está `ativa`, e `PROVA_ENCERRADA` (409) se Prova com `now > deadlineAt + PROVA_TOLERANCE_MS` (nesse caso também marca a sessão como `expirada` no retorno da função de serviço, veja Task 3; aqui só lança).
  - `finishSession(ws, sessionId, now): Workspace`: `ativa` → `encerrada` com `endedAt`; sessão já encerrada/expirada devolve o workspace igual (idempotente); inexistente → `AppError(404,'SESSAO_INEXISTENTE',…)`.
  - `pruneSessions(ws)`: mantém as ativas e as `KEEP_ENDED_SESSIONS` encerradas/expiradas mais recentes.

- [ ] **Step 1: Escrever os testes que falham** (`tests/study/sessions.test.ts`; workspace com um conceito e dois exercícios)

  - `os modos do schema acompanham os modos do domínio`.
  - `createSession cria ativa, define o prazo só na Prova e é idempotente por id`.
  - `uma segunda sessão ativa é recusada com SESSAO_ATIVA, mas outra é aceita depois de encerrar a primeira`.
  - `sessão esquecida aberta expira sozinha por inatividade (12 h) e libera uma nova`.
  - `Prova expira depois do prazo + tolerância, e dentro da tolerância ainda aceita` (limite exato: `deadlineAt + 60000` aceito, `+ 60001` recusado em `markAnswered`).
  - `markAnswered recusa item respondido, item de fora e sessão encerrada`.
  - `finishSession é idempotente e recusa sessão inexistente`.
  - `pruneSessions mantém as ativas e só as 50 encerradas mais recentes`.
  - `workspace antigo sem studySessions continua válido`: `workspaceSchema.parse(buildDemoWorkspace())` dá `studySessions: []`.

- [ ] **Step 2: Rodar e ver falhar**

  Run: `node node_modules/vitest/vitest.mjs run --config vitest.study.config.ts tests/study/sessions.test.ts`
  Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar** `session-schema.ts`, `session.ts` e o campo no `workspaceSchema`/`emptyWorkspace` (corrigir os pontos que constroem `Workspace` à mão e que o `tsc` apontar). Todas as funções são puras e recebem `now` como parâmetro.

- [ ] **Step 4: Rodar tudo**

  Run: `node node_modules/vitest/vitest.mjs run --config vitest.study.config.ts` e `node node_modules/typescript/bin/tsc -p tsconfig.study.json --noEmit`
  Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/study/sessions lib/study/domain.ts tests/study/sessions.test.ts
git commit -m "feat: modelo da sessão de estudo e ciclo de vida"
```

---

### Task 2: Seleção dos exercícios por modo (pura)

**Files:**
- Create: `lib/study/sessions/select.ts`
- Test: `tests/study/session-select.test.ts`

**Interfaces:**
- Consumes: `exercisesOf` (`exercises/migrate.ts`), `Exercise`/`ExerciseType` (`exercises/schema.ts`), `mastery`, `isEvidence` (`domain.ts`), constantes da Task 1.
- Produces (`lib/study/sessions/select.ts`):
  - `MODE_FORMATS: Record<StudyMode, ExerciseType[]>` com `rapido: ['escolha','ligar']`, `aprofundar: ['desenho','ligar','escrita']`, `prova: ['escolha','escrita']`, `revisao: ['escolha','escrita']`.
  - `selectItems(ws: Workspace, args: { mode: StudyMode; conceptIds?: string[]; now: number }): { items: {conceptId: string; exerciseId: string}[]; limitMinutes?: number }`.
    - **Elegibilidade:** só conceitos com tentativas ou escolhidos explicitamente em `conceptIds`; só exercícios cujo tipo está em `MODE_FORMATS[mode]`. Um exercício por conceito, exceto Aprofundar (até 2 por conceito, tipos diferentes). Em `revisao`, prefere `escolha` e só usa `escrita` quando o conceito não tem `escolha`.
    - **Prioridade** (empates por `id`, resultado determinístico): conceitos cuja última tentativa foi errada primeiro, depois os vencidos (`due > 0 && due <= now`) do mais atrasado ao menos, depois os demais. `rapido` e `revisao` usam esse critério sozinho; `aprofundar` prefere conceitos com **menos evidências** (`mastery(c).evidenceCount`); `prova` exige `conceptIds` (de 1 a 10 conceitos escolhidos pelo aluno).
    - **Limites:** no máximo `MAX_ITEMS[mode]` itens; `rapido` também para quando a soma de `ESTIMATE_MINUTES` passa de `RAPIDO_MAX_MINUTES`.
    - **Prova:** `limitMinutes = clamp(soma das estimativas, PROVA_MIN_MINUTES, PROVA_MAX_MINUTES)`.
    - **Revisão:** só conceitos vencidos ou com último erro (nada de conceito recém-estudado e em dia).
    - Sem exercício elegível: lança `AppError(409,'SEM_EXERCICIOS', mensagem em português dizendo o que falta, por modo)`. Em `prova` sem `conceptIds` ou com mais de 10: `AppError(400,'PROVA_SEM_CONCEITOS',…)`. Conceito inexistente em `conceptIds`: `AppError(404,…)`.
    - **Rotação:** entre vários exercícios do mesmo conceito e formato, escolhe o menos usado (número de tentativas do tipo correspondente, módulo o número de exercícios), para não repetir sempre o primeiro.

- [ ] **Step 1: Escrever os testes que falham** (`tests/study/session-select.test.ts`; fábrica de conceitos com exercícios dos quatro tipos e tentativas)

  - `rapido usa só escolha e ligar, respeita 10 itens e 20 minutos`.
  - `aprofundar usa desenho, ligar e escrita, prefere conceitos com menos evidências e dá até 2 exercícios de tipos diferentes por conceito`.
  - `prova exige conceptIds (1 a 10), usa só escolha e escrita e calcula limitMinutes entre 10 e 90`: 1 escolha = piso de 10; 20 escritas impossíveis (máx. 10 itens) ficam em no máximo 90.
  - `revisao só traz conceitos vencidos ou com último erro e prefere escolha`.
  - `erro recente vem antes de vencido, e vencido mais atrasado vem antes` (ordem determinística, com empate por id).
  - `sem exercício elegível lança SEM_EXERCICIOS com mensagem do modo` (um caso por modo; conceito só com `question` antigo entra em `rapido`/`revisao` pela migração de `exercisesOf`).
  - `conceptIds inexistente lança 404` e `prova com 11 conceitos lança PROVA_SEM_CONCEITOS`.
  - `a rotação não repete sempre o mesmo exercício do conceito`.

- [ ] **Step 2: Rodar e ver falhar**

  Run: `node node_modules/vitest/vitest.mjs run --config vitest.study.config.ts tests/study/session-select.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implementar** `selectItems` e `MODE_FORMATS`. Funções puras, sem acesso a banco.

- [ ] **Step 4: Rodar tudo** (suíte inteira e `tsc`)

  Run: `node node_modules/vitest/vitest.mjs run --config vitest.study.config.ts` e `node node_modules/typescript/bin/tsc -p tsconfig.study.json --noEmit`
  Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/study/sessions/select.ts tests/study/session-select.test.ts
git commit -m "feat: seleção de exercícios por modo de estudo"
```

---

### Task 3: Serviço de sessão (início, resposta, fim, correção da Prova)

**Files:**
- Create: `lib/study/sessions/session-service.ts`
- Test: `tests/study/session-service.test.ts`

**Interfaces:**
- Consumes: Tasks 1 e 2; `submitExercise`, `gradePendingBatch`, `estimateBatch`, `Store`, `Deps`, `SubmitInput`, `SubmitOutcome` (`exercises/submission-service.ts`, 2B).
- Produces (`lib/study/sessions/session-service.ts`):
  - `startStudySession(deps: Deps, args: { id: string; mode: StudyMode; conceptIds?: string[] }): Promise<{ session: StudySession; revision: number }>`: `load` → `selectItems` → `createSession` → `save` (com a releitura/reaplicação única em 409 já usada na 2B; se `mutate` não for exportável, exportá-lo de `submission-service.ts`).
  - `answerInSession(deps: Deps, args: { sessionId: string; answer: Omit<SubmitInput, 'mode' | 'sessionId' | 'deferGrading'> }): Promise<SubmitOutcome>`: valida e carimba o item com `markAnswered` **antes** de gravar a resposta; chama `submitExercise` com `mode` e `sessionId` **da sessão** (ignora qualquer `mode`/`sessionId` do chamador) e `deferGrading: true` na Prova; na Prova, o `SubmitOutcome` devolvido **não inclui `result`** enquanto a sessão está `ativa` (feedback só no final). Se `markAnswered` lançar `PROVA_ENCERRADA`, grava a sessão como `expirada` antes de relançar o erro. Se `submitExercise` falhar por resposta inválida (400), o item **não** fica marcado como respondido (desfaz o carimbo).
  - `finishAndSummarize(deps: Deps, args: { sessionId: string }): Promise<{ session: StudySession; summary: { total: number; answered: number; correct: number; pending: number; failed: number }; estimate: ReturnType<typeof estimateBatch> }>`: encerra (idempotente) e resume pelas tentativas e envios com o `sessionId`. Só depois de encerrada a Prova revela os resultados (`correct`).
  - `gradeSession(deps: Deps, args: { sessionId: string; harness: 'codex'|'claude'; model?: string }): Promise<Awaited<ReturnType<typeof gradePendingBatch>>>`: recusa sessão `ativa` (`AppError(409,'SESSAO_ATIVA_NAO_CORRIGE',…)`) e chama `gradePendingBatch` só com os ids de envios da sessão.
  - `getSession(deps: Deps, args: { sessionId: string })`: `load` + `expireStale` (grava se algo expirou) e devolve a sessão.

- [ ] **Step 1: Escrever os testes que falham** (`tests/study/session-service.test.ts`; `Store` em memória como em `submission-service.test.ts`, `generate` é `vi.fn()`)

  - `rapido: responder escolha registra a tentativa com mode rapido e a sessão, e devolve o resultado na hora`.
  - `o modo e o sessionId do corpo são ignorados`: o chamador manda `mode: 'revisao'` e `sessionId: 'outra'` num envio da sessão `rapido`; a tentativa gravada tem `mode: 'rapido'` e o `sessionId` da sessão.
  - `prova: aceita dentro do prazo, recusa depois de prazo + tolerância com PROVA_ENCERRADA e marca a sessão expirada` (relógio injetado em `deps.now`).
  - `prova: nenhum resultado aparece antes do fim, nem o de escolha local, mas a tentativa já foi registrada`; depois de `finishAndSummarize` o resumo traz `correct`.
  - `prova: escrita fica pendente sem chamar a IA até gradeSession`, e `gradeSession` com cota esgotada deixa o resto pendente (`stoppedBy`).
  - `gradeSession recusa sessão ainda ativa e só corrige envios daquela sessão`.
  - `item repetido, item de outra sessão e conceito de fora são recusados e a tentativa não é gravada`.
  - `resposta inválida não deixa o item marcado como respondido` (escrita só com espaços).
  - `um erro em revisao derruba o domínio do conceito` (usa a regra da 2A pelo `mode` da sessão).
  - `iniciar com sessão ativa dá SESSAO_ATIVA; sem exercícios elegíveis dá SEM_EXERCICIOS e nada é salvo`.
  - `getSession expira sessão esquecida e persiste`.

- [ ] **Step 2: Rodar e ver falhar**

  Run: `node node_modules/vitest/vitest.mjs run --config vitest.study.config.ts tests/study/session-service.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implementar** o serviço. A ordem em `answerInSession` é: ler → validar sessão e item (`markAnswered` em memória) → `submitExercise` (que grava a resposta) → só então gravar o carimbo `answeredAt`; se o envio falhar, nada do carimbo é gravado.

- [ ] **Step 4: Rodar tudo** (suíte inteira e `tsc`)

  Run: `node node_modules/vitest/vitest.mjs run --config vitest.study.config.ts` e `node node_modules/typescript/bin/tsc -p tsconfig.study.json --noEmit`
  Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/study/sessions/session-service.ts lib/study/exercises/submission-service.ts tests/study/session-service.test.ts
git commit -m "feat: serviço de sessão com prazo da Prova no servidor"
```

---

### Task 4: Planejador, rotas e guia

**Files:**
- Modify: `lib/study/planner.ts` (revisões para conceitos só com `exercises`; modo sugerido), `app/api/study/[...path]/route.ts` (rotas `session-*`), `docs/guia/estudos.md` (seção "Modos de estudo")
- Test: `tests/study/planner.test.ts` (ampliar), `tests/study/session-routes.test.ts` (padrão de duplas de `tests/study/exercise-routes.test.ts`), `tests/study/mastery-impact.test.ts` (texto do guia)

**Interfaces:**
- Consumes: Task 3; `exercisesOf`; `planStudy`, `PlanItem`.
- Produces:
  - `planner.ts`: a condição `state.concepts.filter((n) => n.question)` passa a `exercisesOf(n).length > 0` (a migração de `question` continua valendo). `PlanItem` ganha `suggestedMode?: StudyMode`: `review` → `'revisao'`, `practice` → `'aprofundar'`, `lesson` → sem sugestão. Prioridade e `reason` das tarefas **não mudam**.
  - Rotas (todas sob `withRequestOwner`, harness checado como nas rotas da 2B, `targetFor(input.harness ?? s.harness)`):
    - `POST session-start`: `{ id, mode, conceptIds? (máx. 10) }` → `{ session, revision }`.
    - `POST session-answer`: `{ sessionId, id, conceptId, exerciseId, answer, harness?, helped?, confidence? }` (o corpo **não aceita** `mode`, `sessionId` de envio nem `deferGrading`: `z.strictObject` ou campos ausentes) → `SubmitOutcome`.
    - `POST session-finish`: `{ sessionId }` → `finishAndSummarize`.
    - `POST session-grade`: `{ sessionId, harness? }` → `gradeSession`.
    - `GET session-active`: sessão ativa (ou `null`) já com `expireStale`, **sem** gabarito nem respostas.

- [ ] **Step 1: Escrever os testes que falham**

  - `planner.test.ts`: `conceito só com exercises gera tarefa de revisão`, `tarefa de revisão sugere revisao e prática sugere aprofundar`, e os testes antigos continuam passando sem mudar de resultado.
  - `session-routes.test.ts`: `session-start sem dono recebe 401`; `session-start rapido devolve sessão e grava`; `session-answer ignora mode e sessionId extras do corpo` (corpo com campos extras dá 400 ou é ignorado, e a tentativa fica com o modo da sessão); `session-answer da Prova depois do prazo dá 409 PROVA_ENCERRADA`; `session-finish e session-grade usam o harness pedido e nunca o outro` (outro → 409 `HARNESS_CHANGED`); `session-grade de sessão ativa dá 409`; `session-active devolve null sem sessão`.
  - `mastery-impact.test.ts`: `o guia explica os modos`: `docs/guia/estudos.md` contém `Prova`, `prazo`, `Revisão espaçada` e `modo é definido pela sessão`.

- [ ] **Step 2: Rodar e ver falhar**

  Run: `node node_modules/vitest/vitest.mjs run --config vitest.study.config.ts tests/study/planner.test.ts tests/study/session-routes.test.ts tests/study/mastery-impact.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implementar** o ajuste do planejador, as cinco rotas (ao lado das rotas `exercise-*`) e a seção do guia: tabela dos quatro modos, o prazo da Prova controlado pelo servidor com tolerância de 1 minuto, "o modo é definido pela sessão", feedback só no fim da Prova, correção em lote sob pedido e expiração de sessão esquecida (12 h).

- [ ] **Step 4: Rodar tudo**

  Run: `node node_modules/vitest/vitest.mjs run --config vitest.study.config.ts` e `node node_modules/typescript/bin/tsc -p tsconfig.study.json --noEmit`
  Expected: PASS.

- [ ] **Step 5: Verificação com banco isolado (sem IA real)**

  Subir a demo isolada (`scripts/readme-demo`, banco 5441, app 3034, dono `readme-demo`; o Docker Desktop pode precisar ser iniciado). Publicar no workspace da demo (via `PUT workspace`) um conceito com exercícios `escolha` e `escrita`, iniciar uma sessão `prova` com `limitMinutes` pequeno por `session-start`, responder uma `escolha` por `session-answer`, conferir que a resposta **não traz resultado**, esperar passar do prazo + tolerância (ou iniciar a sessão com o relógio do servidor adiantado só em teste, sem mexer no relógio real) e conferir `409 PROVA_ENCERRADA`. Nenhuma chamada de IA real. Não tocar nas portas 5440/3033. Parar a demo e o container 5441 no fim.
  Expected: respostas como descritas, sem alterar a instalação pessoal.

- [ ] **Step 6: Commit**

```bash
git add lib/study/planner.ts "app/api/study/[...path]/route.ts" docs/guia/estudos.md tests/study/planner.test.ts tests/study/session-routes.test.ts tests/study/mastery-impact.test.ts
git commit -m "feat: rotas de sessão, modo sugerido no planejador e guia dos modos"
```

---

## Autoavaliação

- **Cobertura do spec (2C):** os quatro modos com formatos, duração, feedback e peso (Tasks 2 e 3; o peso baixo do Rápido já está na regra de domínio da 2A); modo escolhido ao iniciar a sessão e integrado ao planejador (Tasks 3 e 4); Prova com prazo no servidor, tolerância, feedback só no final e correção em lote (Tasks 1 e 3, reaproveitando a 2B); sessão persistida com modo, início, fim e estado de correção (Tasks 1 e 3: o estado de correção é derivado dos envios com `sessionId`); Revisão espaçada alimentada por vencidos e erros recentes (Task 2).
- **Fica para a 2D:** seletor de modo, telas dos quatro tipos, canvas de desenho, marcação de confiança antes de responder, cronômetro visual e aviso de custo; a separação das imagens pendentes do `GET workspace` (adiada da 2B).
- **Fica para a fase 4:** o `classroom-result` do player do OpenMAIC continua gravando `choice` sem modo (um erro ali ainda não derruba o domínio), pois o player sai nessa fase.
- **Consistência de nomes:** `StudySession`, `studySessionSchema`, `studySessions`, `createSession`, `markAnswered`, `finishSession`, `expireStale`, `isExpired`, `activeSession`, `pruneSessions`, `selectItems`, `MODE_FORMATS`, `startStudySession`, `answerInSession`, `finishAndSummarize`, `gradeSession`, `getSession`, `suggestedMode` e as constantes aparecem com a mesma grafia em todas as tasks. Os campos `mode`, `sessionId`, `deferGrading` de `SubmitInput` são os da 2B.
- **Decisões minhas, ajustáveis:** uma sessão ativa por vez (recusa em vez de encerrar a anterior); expiração por inatividade em 12 h; tolerância da Prova de 1 minuto; limites de itens por modo e estimativas de minutos por formato (constantes); cada item respondido uma vez (para tentar de novo, nova sessão).
- **Risco principal:** o carimbo `answeredAt` e a gravação da resposta são duas gravações; a ordem do Step 3 da Task 3 garante que uma falha no meio nunca marca como respondido um item sem resposta, e os testes cobrem isso.
