# gurIA Fase 2D — Interface de prática — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar tela ao que as fases 2A a 2C construíram: uma aba **Praticar** com seletor de modo, sessão guiada (confiança antes de responder, `escolha`, `ligar`, `escrita`, `desenho` com canvas), cronômetro da Prova baseado no relógio do servidor, aviso de custo antes de gastar IA e a lista de respostas pendentes com reenvio e descarte.

**Architecture:** A lógica que decide comportamento fica em módulos puros em `lib/study/ui/*`, testados no vitest atual (que roda em Node, sem DOM). Os componentes React (`components/study/practice/*`) só desenham o estado e chamam as rotas `session-*` e `exercise-*` já existentes. Antes disso, uma tarefa de servidor fecha o contrato do `workspace`: `submissions` e `studySessions` passam a pertencer ao servidor (o `PUT` do cliente não os reescreve e o `GET` não devolve as respostas nem as imagens). A verificação visual usa Playwright (Edge) na demo isolada.

**Tech Stack:** Next.js (React client components), TypeScript, canvas 2D nativo (sem dependência nova), vitest (`vitest.study.config.ts`), Playwright com Edge (já usado em `scripts/readme-demo`).

**Spec:** `docs/superpowers/specs/2026-11-17-guria-reestruturacao-design.md` (seções "1. Modos de estudo", "2. Motor de exercícios", "Escolhas do construtor"). Planos anteriores concluídos: 2A, 2B e 2C em `docs/superpowers/plans/2026-11-19-fase-2*.md`.

## Global Constraints

- Português brasileiro em todo texto visível. Os textos novos ficam em `lib/study/ui/copy.ts` (constantes), para que testes os conferam.
- Antes de responder, o aluno marca **confiança** (calibração): três níveis, `Chutando` = 0,25, `Mais ou menos` = 0,6, `Tenho certeza` = 0,9. A interface exige a marcação; o servidor continua aceitando sem ela.
- **O servidor decide modo, sessão e prazo.** O cliente nunca envia `mode`, `sessionId` de envio nem `deferGrading` (as rotas `session-answer` já recusam). O cronômetro da Prova é aviso: ao zerar, a tela encerra a sessão e mostra "tempo esgotado"; se o servidor responder `PROVA_ENCERRADA`, a tela explica e não reenvia.
- **Aviso de custo antes de gastar IA:** `desenho` pede confirmação explícita ("Este desenho será enviado à IA escolhida e consome sua cota") antes do envio; corrigir pendentes e corrigir a Prova mostram quantos textos e desenhos serão enviados. Nada chama a IA sem um clique do aluno.
- Cada item tem **id de resposta determinístico** (`<sessionId>:<índice do item>`): duplo clique ou reenvio por rede não gravam duas respostas.
- Resposta nunca se perde: se a IA falhar, a tela mostra "pendente de correção" e mantém o texto/desenho até o aluno sair; nada é guardado em `localStorage`.
- Reutilizar as classes e componentes existentes (`study-card`, `study-btn`, `Dialog`, `Field`, `api` em `components/study/shared.tsx`); estilos novos em `app/study/study.css` com prefixo `guria-practice-`. Respeitar o tema claro/escuro existente. Sem dependências novas.
- Acessibilidade: escolhas por `input` radio/checkbox com rótulo; mudanças de estado, feedback e avisos do cronômetro em região `aria-live`; foco movido para o enunciado a cada item; canvas com `aria-label`, `touch-action: none` e alternativa "Pular este item".
- A tela da Prova **não mostra resultado** de nenhum item enquanto a sessão está ativa.
- Dados existentes continuam válidos; nenhuma migração de banco.
- Trabalhar na branch `guria`. **Nunca** `git push`. **Nunca** `git add -A`/`git add .`: só caminhos explícitos (`AGENTS.md` e `tsconfig.json` têm alterações do dono). Não rodar `prettier --write` em pastas inteiras, só nos arquivos tocados.
- Não escrever no banco da instalação pessoal (portas 5440/3033) nem chamar IA real: a verificação usa a demo isolada (banco 5441, app 3034, dono `readme-demo`) e não aciona `escrita` nem `desenho` fora da Prova.
- Ao concluir: `node node_modules/vitest/vitest.mjs run --config vitest.study.config.ts` e `node node_modules/typescript/bin/tsc -p tsconfig.study.json --noEmit` passam, e o roteiro Playwright da Task 6 passa sem erros no console.

## Review Focus

- Recarregar a página no meio de uma sessão retoma a mesma sessão, sem repetir itens já respondidos e sem perder o cronômetro (Tasks 3 e 6).
- Outras telas continuam salvando o workspace (`PUT`) sem apagar sessões nem envios pendentes (Task 1).
- Relógio do computador errado: o cronômetro da Prova usa o relógio do servidor (Tasks 2 e 3).
- Desenho em branco não é enviado; imagem grande demais mostra mensagem clara; o envio do desenho só acontece depois da confirmação de custo (Tasks 2 e 4).
- Duplo clique em "Responder" e queda de rede no meio não duplicam respostas; erro 409 (`ITEM_JA_RESPONDIDO`, `PROVA_ENCERRADA`, `SESSAO_ENCERRADA`) vira mensagem em português, não erro genérico (Tasks 2 e 3).
- Cota esgotada ao corrigir: a resposta aparece como pendente com "Reenviar", e o lote para com a mensagem do motivo (Tasks 2 e 5).
- Tela estreita (390 px): sem rolagem horizontal, canvas e botões utilizáveis por toque (Tasks 4 e 6).

---

### Task 1: Contrato do workspace (campos do servidor) e relógio do servidor

**Files:**
- Create: `lib/study/workspace-contract.ts`
- Modify: `app/api/study/[...path]/route.ts` (`GET`/`PUT` de `workspace`; `now` em `session-start` e `session-active`)
- Test: `tests/study/workspace-contract.test.ts`, ajustes em `tests/study/session-routes.test.ts`

**Interfaces:**
- Consumes: `Workspace`, `workspaceSchema` (`domain.ts`).
- Produces (`lib/study/workspace-contract.ts`):
  - `redactForClient(ws: Workspace): Workspace`: igual ao workspace, mas cada `submissions[i].answer` vira `{ type: 'escrita', text: '…' }` com texto fixo `'(guardada no servidor)'` para escrita e `{ type: 'desenho' }` para desenho (sem texto nem imagem); `result` e demais campos ficam.
  - `mergeServerOwned(incoming: unknown, current: Workspace): unknown`: devolve `incoming` com `submissions` e `studySessions` **substituídos** pelos de `current` (o cliente não os reescreve); se `incoming` não for objeto, devolve como veio (a validação normal recusa).
  - Rotas: `GET workspace` devolve `{ revision, data: redactForClient(data) }`; `PUT workspace` lê o atual, aplica `mergeServerOwned` e só então chama `saveWorkspace` (o conflito de revisão continua valendo); `session-start` e `session-active` passam a incluir `now: Date.now()` na resposta.

- [ ] **Step 1: Escrever os testes que falham**

  - `workspace-contract.test.ts`:
    - `redactForClient apaga texto e imagem das respostas e mantém o resto`.
    - `mergeServerOwned ignora submissions e studySessions vindos do cliente` (cliente manda sessão com prazo estendido e envio com resposta trocada: o resultado tem os do servidor).
    - `ida e volta GET→PUT não perde nem corrompe respostas guardadas`: `merge(redact(ws), ws)` parseia em `workspaceSchema` e mantém `answer` original no envio pendente.
    - `mergeServerOwned deixa passar entrada que não é objeto`.
  - `session-routes.test.ts`: `GET workspace não devolve o texto nem a imagem das respostas`, `PUT workspace do cliente não reescreve studySessions nem submissions` (cliente tenta apagar o carimbo e estender o prazo) e `session-start e session-active devolvem now`.

- [ ] **Step 2: Rodar e ver falhar**

  Run: `node node_modules/vitest/vitest.mjs run --config vitest.study.config.ts tests/study/workspace-contract.test.ts tests/study/session-routes.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implementar** o módulo e ligar nas rotas. As demais rotas que gravam o workspace (`studies`, `courses`, `classroom-result`) partem do estado lido no servidor e não mudam.

- [ ] **Step 4: Rodar tudo**

  Run: `node node_modules/vitest/vitest.mjs run --config vitest.study.config.ts` e `node node_modules/typescript/bin/tsc -p tsconfig.study.json --noEmit`
  Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/study/workspace-contract.ts "app/api/study/[...path]/route.ts" tests/study/workspace-contract.test.ts tests/study/session-routes.test.ts
git commit -m "feat: sessões e envios pertencem ao servidor no contrato do workspace"
```

---

### Task 2: Lógica pura da interface (`lib/study/ui`)

**Files:**
- Create: `lib/study/ui/copy.ts`, `lib/study/ui/confidence.ts`, `lib/study/ui/timer.ts`, `lib/study/ui/match.ts`, `lib/study/ui/drawing.ts`, `lib/study/ui/pending.ts`, `lib/study/ui/errors.ts`
- Test: `tests/study/ui-logic.test.ts`

**Interfaces:**
- Consumes: `StudySession`, `Submission`, `Exercise`, `estimateBatch` (resultado), `StudyMode`.
- Produces:
  - `copy.ts`: `MODE_LABELS: Record<StudyMode,{title; blurb}>` (Rápido, Aprofundar, Prova, Revisão espaçada, com descrição de uma linha cada), `CONFIDENCE_LEVELS = [{id:'chute',label:'Chutando',value:0.25},{id:'meio',label:'Mais ou menos',value:0.6},{id:'certeza',label:'Tenho certeza',value:0.9}]`, `COST_NOTICE_DRAWING`, `costNotice(estimate)` (texto com quantos textos e desenhos, citando que desenho consome mais cota), `STATE_LABELS` (`pendente` = "Pendente de correção", `falhou` = "Falhou", `corrigida` = "Corrigida") e o restante dos textos da tela.
  - `errors.ts`: `friendlyError(code: string | undefined, fallback: string): string` com mensagem em português para `PROVA_ENCERRADA`, `SESSAO_ENCERRADA`, `ITEM_JA_RESPONDIDO`, `SESSAO_ATIVA`, `SEM_EXERCICIOS`, `PROVA_SEM_CONCEITOS`, `QUOTA_EXCEEDED`, `SUBSCRIPTION_REQUIRED`, `HARNESS_CHANGED`, `FILA_CHEIA`, `RESPOSTA_INVALIDA`, `JA_CORRIGIDA`, `REVISION_CONFLICT`; desconhecido devolve `fallback`. A função `api` de `shared.tsx` passa a anexar `code` ao `Error` lançado (ajuste mínimo e compatível: `Object.assign(new Error(...), { code: data.code })`).
  - `confidence.ts`: `confidenceValue(id: string): number | undefined`.
  - `timer.ts`: `clockSkew(serverNow: number, clientNow: number): number`; `remainingMs(session: StudySession, clientNow: number, skew: number): number | null` (`null` fora da Prova; nunca negativo); `formatRemaining(ms: number): string` (`mm:ss`, `h:mm:ss` a partir de 1 h); `timerWarning(ms: number): 'ok' | 'cinco' | 'um' | 'zero'` (limites: ≤ 5 min, ≤ 1 min, 0); `itemId(sessionId: string, index: number): string` = `` `${sessionId}:${index}` ``.
  - `match.ts` (reducer do exercício `ligar`): `type MatchState = { rights: string[]; selectedLeft?: string; matches: Record<string,string> }`; `initMatch(exercise: {pairs; id}, sessionId: string): MatchState` (lados direitos embaralhados de forma **determinística** por `exercise.id + sessionId`, para o mesmo item aparecer igual depois de recarregar); `matchReduce(state, action: {type:'left',left:string}|{type:'right',right:string}|{type:'clear'}): MatchState` (escolher esquerdo e depois direito cria o par; ligar um direito já usado por outro esquerdo move o par; clicar de novo num esquerdo já ligado desfaz); `matchComplete(state, total): boolean`.
  - `drawing.ts` (modelo do canvas, sem DOM): `type Tool = 'pen'|'line'|'rect'|'ellipse'|'text'`; `type DrawItem = {tool; color: string; width: number; points: {x:number;y:number}[]; text?: string}`; `type DrawingDoc = { width: number; height: number; items: DrawItem[] }`; `emptyDrawing(width=800, height=520)`; `addItem(doc, item)` (ignora item sem pontos, limita a 2000 itens e 20000 pontos por traço, descartando o excedente); `undo(doc)`; `clearDrawing(doc)`; `isBlank(doc)` (sem itens, ou só texto vazio); `fitDataUrl(encoders: (() => string)[], max = 1_400_000): string` (tenta cada codificador em ordem; devolve o primeiro dentro do limite; se nenhum couber, lança `Error('Desenho grande demais…')` em português). A função que desenha num `CanvasRenderingContext2D` fica no componente (Task 4), não aqui.
  - `pending.ts`: `describePending(items, estimate)` → `{ title, rows: {id, stateLabel, detail}[], notice: string }` usando `STATE_LABELS` e `friendlyError(lastError.code,…)`; `canRegrade(state)` verdadeiro para `pendente` e `falhou`.

- [ ] **Step 1: Escrever os testes que falham** (`tests/study/ui-logic.test.ts`)

  - `friendlyError traduz os códigos conhecidos e usa o fallback para os desconhecidos`; `todo código de erro das rotas 2B/2C tem mensagem` (lista conferida).
  - `confidenceValue devolve 0.25, 0.6 e 0.9 e undefined para id desconhecido`.
  - `remainingMs usa o relógio do servidor`: relógio do cliente adiantado 10 min e `skew` corrige; fora da Prova devolve `null`; nunca negativo.
  - `formatRemaining` (`65_000` → `01:05`, `3_725_000` → `1:02:05`) e `timerWarning` nos limites exatos (300000 → `cinco`, 60000 → `um`, 0 → `zero`, 300001 → `ok`).
  - `itemId é determinístico`.
  - `initMatch embaralha os lados direitos de forma determinística e estável` (mesma entrada, mesma ordem; ordem diferente da original em pelo menos um caso conhecido; sem perder nem repetir lados).
  - `matchReduce cria, move e desfaz pares` e `matchComplete só quando todos os esquerdos têm par`.
  - `drawing`: `addItem ignora item sem pontos`, `limita itens e pontos`, `undo/clear`, `isBlank` (inclui texto vazio), `fitDataUrl escolhe o primeiro codificador que cabe e lança mensagem em português quando nenhum cabe`.
  - `describePending lista estado e motivo em português e costNotice cita textos e desenhos`.

- [ ] **Step 2: Rodar e ver falhar**

  Run: `node node_modules/vitest/vitest.mjs run --config vitest.study.config.ts tests/study/ui-logic.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implementar** os módulos puros e o ajuste do `api` em `shared.tsx`.

- [ ] **Step 4: Rodar tudo** (suíte inteira e `tsc`)

  Run: `node node_modules/vitest/vitest.mjs run --config vitest.study.config.ts` e `node node_modules/typescript/bin/tsc -p tsconfig.study.json --noEmit`
  Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/study/ui components/study/shared.tsx tests/study/ui-logic.test.ts
git commit -m "feat: lógica pura da interface de prática (confiança, cronômetro, ligar, desenho, pendências)"
```

---

### Task 3: Aba Praticar — seletor de modo e sessão guiada (escolha, ligar, escrita)

**Files:**
- Create: `components/study/practice/PracticeTab.tsx`, `components/study/practice/ModePicker.tsx`, `components/study/practice/SessionRunner.tsx`, `components/study/practice/ConfidenceSelector.tsx`, `components/study/practice/ChoiceExercise.tsx`, `components/study/practice/MatchExercise.tsx`, `components/study/practice/WritingExercise.tsx`, `components/study/practice/practice-api.ts`
- Modify: `components/study/useStudyNavigation.ts` (nova aba `practice`), `components/study/StudyApp.tsx` (item de navegação "Praticar", descrição da seção, renderização de `PracticeTab`), `lib/study/locale.ts` (rótulo da aba), `app/study/study.css` (estilos `guria-practice-*`)
- Test: `tests/study/ui-logic.test.ts` (ampliar com o que for lógica nova) e verificação visual no Step 5

**Interfaces:**
- Consumes: Tasks 1 e 2; rotas `session-start`, `session-answer`, `session-finish`, `session-grade`, `session-active`; `Workspace` do estado do `StudyApp`.
- Produces:
  - `practice-api.ts`: funções finas e tipadas sobre `api`: `startSession(args: {id; mode; conceptIds?})`, `answer(args)`, `finish(sessionId)`, `gradeSession(sessionId)`, `activeSession()`; cada uma devolve o JSON da rota e, nas respostas de sessão, o `now` do servidor para calcular o `skew`.
  - `PracticeTab` (props: `state: Workspace`, `refresh: () => void` que recarrega o workspace do servidor, `notify`, `initialMode?: StudyMode`, `harness: string`, `ready: boolean`): na montagem chama `activeSession()` e **retoma** a sessão ativa; sem sessão, mostra o `ModePicker` (quatro cartões com título e descrição; Prova e os demais modos permitem **escolher conceitos** em uma lista com busca, de 1 a 10 na Prova; Rápido, Aprofundar e Revisão usam a seleção automática, e a escolha de conceitos é opcional neles, necessária para conceitos ainda sem tentativas).
  - `SessionRunner`: um item por vez, com enunciado (foco movido para ele), confiança obrigatória, o exercício, "Responder" (desabilitado enquanto envia), e o feedback conforme o modo (imediato: acerto/erro, explicação da `escolha`, e para `escrita` a nota, o comentário por critério e o que faltou; Prova: apenas "Resposta registrada", sem resultado). "Pular este item" avança sem chamar o servidor. Ao fim (ou "Encerrar sessão"), chama `finish` e mostra o resumo (`total`, `answered`, `correct`; na Prova o `correct` só aparece depois de encerrada) e, se houver pendentes, o aviso `costNotice` com o botão **"Corrigir agora"** (chama `gradeSession`; mostra resultado do lote e o motivo quando para por cota).
  - Cronômetro da Prova no topo da sessão, atualizado a cada segundo com `remainingMs`, avisos nos limites via região `aria-live`; ao zerar, chama `finish` e mostra "Tempo esgotado".
  - `ChoiceExercise`: `radio` quando há uma resposta certa, `checkbox` quando `answerIndexes.length > 1`. `MatchExercise`: duas colunas clicáveis pelo reducer de `match.ts`, com rótulos de teclado. `WritingExercise`: `textarea` com contador e o mínimo de caracteres (`minChars`) visível. Os três disparam o mesmo `onSubmit(answerPayload)`.
  - Erros das rotas passam por `friendlyError`; o texto digitado é mantido em caso de erro.

- [ ] **Step 1: Escrever os testes que falham** (apenas lógica; os componentes são conferidos no Step 5)

  - Em `ui-logic.test.ts`: `buildAnswerPayload(exercise, draft, confidence)` (nova função pura em `lib/study/ui/payload.ts`, que fica no escopo desta task): monta o corpo de `session-answer` (`id` determinístico, `answer` do tipo certo, `confidence`), recusa confiança ausente, `escolha` sem seleção, `ligar` incompleto, `escrita` abaixo de `minChars` e **nunca** inclui `mode`, `sessionId` nem `deferGrading` (propriedade ausente).
  - `nextPendingIndex(session)`: primeiro item sem `answeredAt` (retomada), `-1` quando todos foram respondidos.
  - `sessionSummaryView(summary, mode, ended)`: oculta `correct` na Prova enquanto `ended` é falso.

- [ ] **Step 2: Rodar e ver falhar**

  Run: `node node_modules/vitest/vitest.mjs run --config vitest.study.config.ts tests/study/ui-logic.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implementar** `payload.ts`, os componentes, a nova aba (navegação, descrição, rótulo, estilos). A aba nova entra depois de "Biblioteca" e antes de "Plano de estudos", e a navegação por histórico (`useStudyNavigation`) aceita o novo valor sem quebrar entradas antigas salvas.

- [ ] **Step 4: Rodar tudo** (suíte inteira e `tsc`)

  Run: `node node_modules/vitest/vitest.mjs run --config vitest.study.config.ts` e `node node_modules/typescript/bin/tsc -p tsconfig.study.json --noEmit`
  Expected: PASS.

- [ ] **Step 5: Verificação visual rápida**

  Subir a demo isolada, abrir a aba Praticar no navegador do app (Playwright ou painel) e conferir: os quatro cartões, iniciar Rápido, marcar confiança, responder uma `escolha`, ver o feedback e o resumo. Sem chamar IA. O roteiro completo e automatizado fica na Task 6.

- [ ] **Step 6: Commit**

```bash
git add components/study/practice components/study/useStudyNavigation.ts components/study/StudyApp.tsx lib/study/locale.ts lib/study/ui app/study/study.css tests/study/ui-logic.test.ts
git commit -m "feat: aba Praticar com seletor de modo e sessão guiada"
```

---

### Task 4: Exercício de desenho (canvas) com aviso de custo

**Files:**
- Create: `components/study/practice/DrawingExercise.tsx`, `components/study/practice/drawing-render.ts`
- Modify: `components/study/practice/SessionRunner.tsx` (usar `DrawingExercise`), `app/study/study.css`
- Test: `tests/study/ui-logic.test.ts` (ampliar) e verificação visual no Step 5

**Interfaces:**
- Consumes: `drawing.ts` (Task 2), `buildAnswerPayload` (Task 3).
- Produces:
  - `drawing-render.ts`: `renderDrawing(ctx: CanvasRenderingContext2D, doc: DrawingDoc): void` (fundo branco, traços suaves, linha, retângulo, elipse e texto) e `exportDataUrl(canvas: HTMLCanvasElement): string` que usa `fitDataUrl` com os codificadores PNG, depois WebP 0,9 e JPEG 0,8.
  - `DrawingExercise`: canvas 800×520 que escala à largura disponível mantendo a proporção; eventos de ponteiro (`pointerdown/move/up`, mouse, toque e caneta, `touch-action: none`); ferramentas caneta, linha, retângulo, elipse e texto (clique, campo de texto, confirma com Enter), 5 cores e 3 espessuras, **desfazer** e **limpar**; mostra a rubrica do exercício ao lado ("O que será avaliado"); botão "Enviar desenho" desabilitado com o canvas em branco; antes do envio mostra o aviso `COST_NOTICE_DRAWING` e exige o clique em "Confirmar e enviar" (não aplicável à Prova, onde o envio só guarda e a correção é pedida depois, com aviso de custo próprio); erro de tamanho do `fitDataUrl` aparece como mensagem e o desenho permanece na tela.

- [ ] **Step 1: Escrever os testes que falham** (lógica nova só se surgir; o modelo já está coberto na Task 2)

  - `payload`: `buildAnswerPayload` para `desenho` recusa documento em branco e imagem que não começa com `data:image/(png|jpeg|webp);base64,`, e inclui a imagem e a confiança quando válido.
  - `requiresCostConfirmation(mode, exerciseType)` (função pura em `lib/study/ui/payload.ts`): verdadeiro para `desenho` fora da Prova; falso na Prova e para os demais tipos.

- [ ] **Step 2: Rodar e ver falhar**

  Run: `node node_modules/vitest/vitest.mjs run --config vitest.study.config.ts tests/study/ui-logic.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implementar** o canvas e a integração no `SessionRunner`.

- [ ] **Step 4: Rodar tudo** (suíte inteira e `tsc`)

  Run: `node node_modules/vitest/vitest.mjs run --config vitest.study.config.ts` e `node node_modules/typescript/bin/tsc -p tsconfig.study.json --noEmit`
  Expected: PASS.

- [ ] **Step 5: Verificação visual rápida**

  Na demo isolada, abrir uma Prova com um exercício `desenho`, desenhar com o mouse (traço, retângulo, texto), desfazer, enviar e conferir "Resposta registrada" sem resultado e sem chamar IA. Conferir também a largura de 390 px.

- [ ] **Step 6: Commit**

```bash
git add components/study/practice lib/study/ui app/study/study.css tests/study/ui-logic.test.ts
git commit -m "feat: exercício de desenho com canvas e aviso de custo"
```

---

### Task 5: Respostas pendentes e integração com o plano

**Files:**
- Create: `components/study/practice/PendingList.tsx`
- Modify: `components/study/practice/PracticeTab.tsx` (seção "Respostas pendentes"), `components/study/AdaptivePlan.tsx` (botão por tarefa com `suggestedMode`), `components/study/StudyApp.tsx` (`practiceMode` e abertura da aba), `app/study/study.css`
- Test: `tests/study/ui-logic.test.ts` (ampliar) e verificação visual no Step 5

**Interfaces:**
- Consumes: `describePending`, `canRegrade`, `costNotice` (Task 2); rotas `exercise-pending`, `exercise-regrade`, `exercise-grade-batch`, `exercise-discard`; `PlanItem.suggestedMode` (2C).
- Produces:
  - `PendingList`: carrega `exercise-pending` ao abrir e depois de cada ação; cada linha mostra o conceito e o enunciado (achados pelo `conceptId`/`exerciseId` no workspace), o estado em português, o motivo do erro e os botões **Reenviar** (só quando `canRegrade`), **Descartar** (com confirmação); o botão **"Corrigir pendentes"** mostra `costNotice(estimate)` e só chama o lote após confirmação; o resultado do lote mostra quantos foram corrigidos e, se parou, o motivo (`stoppedBy` traduzido). Envios de uma Prova ainda ativa aparecem como "Aguardando o fim da prova" e não oferecem reenvio.
  - `AdaptivePlan`: cada item com `suggestedMode` ganha o botão "Praticar (modo sugerido)", que abre a aba Praticar com `initialMode` já escolhido (o aluno ainda confirma a sessão); sem `suggestedMode`, nada muda.

- [ ] **Step 1: Escrever os testes que falham**

  - `describePending` com um envio de Prova ativa: `detail` = "Aguardando o fim da prova" e `canRegrade` falso para ele (função `pendingActions(item, activeSessionIds)` pura em `lib/study/ui/pending.ts`).
  - `pendingActions` devolve `['regrade','discard']` para `pendente`/`falhou` fora de Prova ativa e `[]` para Prova ativa.

- [ ] **Step 2: Rodar e ver falhar**

  Run: `node node_modules/vitest/vitest.mjs run --config vitest.study.config.ts tests/study/ui-logic.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implementar** a lista e a integração no plano.

- [ ] **Step 4: Rodar tudo** (suíte inteira e `tsc`)

  Run: `node node_modules/vitest/vitest.mjs run --config vitest.study.config.ts` e `node node_modules/typescript/bin/tsc -p tsconfig.study.json --noEmit`
  Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/study/practice components/study/AdaptivePlan.tsx components/study/StudyApp.tsx lib/study/ui app/study/study.css tests/study/ui-logic.test.ts
git commit -m "feat: respostas pendentes e botão de modo sugerido no plano"
```

---

### Task 6: Roteiro Playwright, demo com exercícios e fixture na regra nova

**Files:**
- Create: `scripts/practice-e2e.mjs`
- Modify: `scripts/readme-demo/fixture.ts` (exercícios nos conceitos; tentativas com `helped` e alinhadas à regra nova de domínio), `tests/study/readme-fixture.test.ts`, `docs/guia/estudos.md` (como usar a aba Praticar, com a explicação do aviso de custo e das pendências), `tests/study/mastery-impact.test.ts` (texto do guia)
- Test: o próprio roteiro e `tests/study/readme-fixture.test.ts`

**Interfaces:**
- Consumes: tudo das Tasks 1 a 5; a demo isolada (`scripts/readme-demo/up.mjs`, banco 5441, app 3034, dono `readme-demo`).
- Produces:
  - Fixture da demo: pelo menos dois conceitos com `escolha`, `ligar`, `desenho` e `escrita`; conceitos "dominados" da demo passam a ter duas evidências sem ajuda com 3 ou mais dias de intervalo (regra nova), e todas as tentativas têm `helped: false`; o teste da fixture valida o workspace com `workspaceSchema` e confere que os conceitos esperados como dominados passam em `mastery`.
  - `scripts/practice-e2e.mjs`: abre a demo no Edge (Playwright), com viewport desktop e depois 390 px, e executa: (1) abrir Praticar e ver os quatro modos; (2) Rápido: confiança, `escolha` e `ligar`, feedback imediato e resumo; (3) **recarregar no meio** de uma sessão e confirmar a retomada sem repetir item; (4) Prova com `escolha` e `desenho`: confiança, desenhar no canvas, enviar, conferir que **nenhum resultado** aparece, encerrar e ver o resumo e o aviso de custo (sem clicar em "Corrigir agora"); (5) tentar enviar o desenho em branco e confirmar que o botão está desabilitado; (6) conferir ausência de rolagem horizontal em 390 px e que a lista de pendentes abre; (7) zero erros no console e nenhuma chamada a `session-grade`, `exercise-regrade` ou `exercise-grade-batch` (monitorando as requisições). Nenhuma chamada de IA real.

- [ ] **Step 1: Escrever os testes que falham** (`tests/study/readme-fixture.test.ts` ampliado)

  - `a demo tem exercícios dos quatro tipos em pelo menos dois conceitos`, `todas as tentativas da demo têm helped false` e `os conceitos dominados da demo respeitam a regra nova`.
  - `mastery-impact.test.ts`: `o guia explica a aba Praticar`: `docs/guia/estudos.md` contém `Praticar`, `Corrigir agora` e `confirmação de custo`.

- [ ] **Step 2: Rodar e ver falhar**

  Run: `node node_modules/vitest/vitest.mjs run --config vitest.study.config.ts tests/study/readme-fixture.test.ts tests/study/mastery-impact.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implementar** a fixture, a seção do guia e o roteiro `practice-e2e.mjs` (sobe/usa a demo, escreve capturas **só no scratchpad**, nunca em `docs/`; as imagens do README são regeneradas depois da fase 3).

- [ ] **Step 4: Rodar tudo** (suíte inteira e `tsc`)

  Run: `node node_modules/vitest/vitest.mjs run --config vitest.study.config.ts` e `node node_modules/typescript/bin/tsc -p tsconfig.study.json --noEmit`
  Expected: PASS.

- [ ] **Step 5: Rodar o roteiro na demo isolada**

  Subir a demo (`node scripts/readme-demo/up.mjs`; o Docker Desktop pode precisar ser iniciado), rodar `node scripts/practice-e2e.mjs`, ler a saída.
  Expected: todos os passos aprovados, zero erros de console, nenhuma chamada de correção por IA. Parar a demo e o container 5441 no fim. Não tocar nas portas 5440/3033.

- [ ] **Step 6: Commit**

```bash
git add scripts/practice-e2e.mjs scripts/readme-demo/fixture.ts tests/study/readme-fixture.test.ts tests/study/mastery-impact.test.ts docs/guia/estudos.md
git commit -m "test: roteiro e2e da aba Praticar, demo com exercícios e fixture na regra nova"
```

---

## Autoavaliação

- **Cobertura do spec (2D):** seletor de modo ao iniciar a sessão (Task 3); telas dos quatro tipos de exercício, incluindo canvas com traços, formas e texto (Tasks 3 e 4); confiança antes de responder (Tasks 2 e 3); cronômetro da Prova no cliente com aviso e prazo no servidor (Tasks 2 e 3); aviso de custo antes de enviar desenho e antes da correção em lote (Tasks 2, 4 e 5); pendentes com reenvio (Task 5); integração com o planejador (Task 5); renderização na tela própria da gurIA, sem o player do OpenMAIC (Task 3). Também fecha dois adiamentos: as imagens pendentes saem do `GET workspace` e o `PUT` não reescreve sessões (Task 1), e a fixture da demo passa à regra nova (Task 6).
- **Fica para a fase 3 (skills) e a fase 4:** geração e melhoria de skills; remoção do OpenMAIC, inclusive o botão "Revisar" do conceito e a aba Biblioteca/Prática que usam o player antigo; novas imagens do README (depois da fase 3, como o spec determina).
- **Limite conhecido:** as tentativas (`attempts`) continuam no `GET workspace`, então, em teoria, os acertos de uma Prova ativa são legíveis por quem inspecionar a rede. A tela não os mostra, e esconder isso no servidor quebraria o `PUT` das outras telas. Documentado no guia.
- **Testes de interface:** o vitest do projeto roda em Node, sem DOM. Por isso a lógica fica em módulos puros testados e os componentes são verificados por Playwright na demo (Tasks 3 a 6). Sem dependência nova de teste.
- **Consistência de nomes:** `redactForClient`, `mergeServerOwned`, `friendlyError`, `confidenceValue`, `remainingMs`, `clockSkew`, `formatRemaining`, `timerWarning`, `itemId`, `initMatch`, `matchReduce`, `matchComplete`, `emptyDrawing`, `addItem`, `undo`, `clearDrawing`, `isBlank`, `fitDataUrl`, `describePending`, `pendingActions`, `canRegrade`, `buildAnswerPayload`, `requiresCostConfirmation`, `nextPendingIndex`, `sessionSummaryView`, `costNotice`, `COST_NOTICE_DRAWING`, `MODE_LABELS`, `CONFIDENCE_LEVELS`, `STATE_LABELS` aparecem com a mesma grafia em todas as tasks.
- **Decisões minhas, ajustáveis:** três níveis de confiança (0,25 / 0,6 / 0,9); canvas 800×520 com 5 cores e 3 espessuras; limite de imagem de 1,4 milhão de caracteres no cliente (abaixo dos 1,5 milhão do servidor); a aba Praticar entra entre Biblioteca e Plano de estudos; "Pular este item" sem chamada ao servidor.
- **Risco principal:** a Task 3 é a maior (aba, sessão, três tipos de exercício, retomada e cronômetro). A lógica que decide comportamento está isolada e testada na Task 2 e em `payload.ts`, e a retomada após recarregar tem verificação própria na Task 6.
