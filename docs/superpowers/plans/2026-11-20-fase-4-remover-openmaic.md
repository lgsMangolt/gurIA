# gurIA Fase 4 — Remover o OpenMAIC — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tirar da gurIA todo o código herdado do OpenMAIC que ela não usa, trocando as poucas dependências reais por módulos próprios, migrando os quizzes antigos para o motor de exercícios e deixando o projeto instalável sozinho (`package.json` e `node_modules` próprios), sem perder nenhum dado de estudo.

**Architecture:** A análise de importações mostra que o código da gurIA (`components/study`, `lib/study`, `app/study`, `app/api/study`) toca o resto do projeto em **só 10 pontos** (as "costuras" abaixo). O plano troca cada costura por um módulo próprio pequeno, guiado por um **teste de guarda** que lista as costuras permitidas e vai ficando vazio. Só depois que o grafo da gurIA não alcança mais nada do OpenMAIC os módulos sobrando são apagados, em lotes, e o `node_modules` é refeito. Nada de dados é apagado: as tabelas antigas do banco ficam como estão.

**Tech Stack:** TypeScript, Next.js (webpack), `pg`, zod, vitest (`vitest.study.config.ts`), Playwright (Edge) para a verificação visual, `pnpm` para a instalação.

**Spec:** `docs/superpowers/specs/2026-11-17-guria-reestruturacao-design.md` (seção "5. Remoção do OpenMAIC" e "Do código"). Planos anteriores concluídos: fases 1 a 3.

## Mapa de dependências (medido, e não suposto)

Costuras entre o código da gurIA e o resto do projeto:

| Costura | Quem usa | O que é | Destino |
|---|---|---|---|
| `components/classroom/ClassroomSurface` | `StudyApp.tsx` | player de quiz/aula do OpenMAIC | **removida**; a revisão vira Praticar |
| `lib/persistence/server-provider` | `lib/study/store.ts` | pool do PostgreSQL | pool próprio com `pg` |
| `@openmaic/storage` | `lib/study/store.ts` | só o tipo `Queryable` | tipo próprio |
| `lib/server/identity/single-user`, `with-owner` | `startup.ts`, rota `study` | dono único | módulo próprio |
| `lib/server/agent-runtime/*` (`runner`, `event-notify-bus`, `owner-scoped-documents`) | `startup.ts`, rota `study` | Área Pro e documentos de aula | **removidos** |
| `lib/agent/runtime/stream-fn` | `lib/study/pro/codex-stream.ts` | Área Pro | **removida** |
| `lib/server/capped-stream` | `lib/study/mcp.ts` | utilitário pequeno | copiado para `lib/study` |
| `lib/web-fetch/builtin-extraction` | rota `study` (`course-source`) | extração de texto de página | cópia mínima com aviso MIT |

Fora das costuras, o projeto também tem **raiz própria do OpenMAIC** que a gurIA reaproveita sem precisar: `app/layout.tsx` (carrega provedores, i18n e fontes do OpenMAIC), `middleware.ts`, `instrumentation*.ts` e `next.config.ts`. Alcançam, no total, mais de 900 arquivos, mas só por causa desses quatro pontos de entrada e do player de quiz.

**Dados reais (leitura do banco da instalação pessoal):** `study_workspace` (1 linha) e 12 "stages" do OpenMAIC, todas só com cenas `quiz` (várias são de teste sintético); cada pergunta traz `id: "study:<conceptId>"`, então a migração para `escolha` é direta. Há também registros da Área Pro (`runtime_*`) que ficam intocados.

## Global Constraints

- **Nenhum dado de estudo é apagado.** Nunca `DROP`, `DELETE` ou `TRUNCATE` no banco. As tabelas do OpenMAIC (`document_*`, `stage_meta`, `runtime_*`, `openmaic_schema_migrations`…) continuam lá, sem uso, como rede de segurança.
- **Antes de tocar no banco real (porta 5440):** backup verificado (Task 2) e **confirmação do dono no chat**, porque é efeito fora da árvore de trabalho. Tudo que escreve no banco real é *dry-run* por padrão e só grava com `--apply` explícito, de forma idempotente e com a checagem de revisão (`REVISION_CONFLICT`).
- **Rollback:** tag local `pre-fase-4` no começo; cada task é um commit; nunca reescrever histórico; nunca `git push`, `git clean` nem `git reset --hard`; nunca `git add -A`/`git add .` (só caminhos explícitos; `AGENTS.md` e `tsconfig.json` têm alterações do dono — **não tocar**).
- **Pasta `node_modules`:** hoje é uma *junction* para `curso app\OpenMAIC\node_modules` (outro projeto do dono). Ela só se remove com `cmd /c rmdir` **sobre o link**, depois de confirmar com `fsutil reparsepoint query` que é uma junction; nunca com `rm -rf`, `Remove-Item -Recurse` nem `del /s` sobre o caminho. A pasta `curso app\OpenMAIC` **nunca é alterada**.
- **Ordem:** só se apaga um módulo quando o teste de guarda e o grafo mostram que a gurIA não o alcança. Cada lote de remoção termina com `vitest.study.config.ts` e `tsc -p tsconfig.study.json` verdes.
- Variáveis de ambiente continuam valendo: `GURIA_LOCAL` (e `OPENMAIC_STUDY_LOCAL`), `OWNER_SINGLE_USER`, `OWNER_SINGLE_USER_ID`, `DATABASE_URL`, `OPENMAIC_DB_PORT`, `GURIA_NEXT_DIST_DIR`. O dono único continua sendo `study-local`, para os dados atuais continuarem sendo encontrados.
- Licença: o `LICENSE` (MIT, com o crédito ao OpenMAIC) fica. Todo código copiado do OpenMAIC leva um cabeçalho "Adaptado do OpenMAIC (MIT)" e entra em `THIRD_PARTY_NOTICES.md`.
- A verificação visual usa a demo isolada (banco 5441, app 3034, dono `readme-demo`); nunca as portas 5440/3033, e nenhuma chamada de IA real.
- Não rodar `prettier --write` em pastas inteiras, só nos arquivos tocados.
- Ao concluir cada task: `node node_modules/vitest/vitest.mjs run --config vitest.study.config.ts` e `node node_modules/typescript/bin/tsc -p tsconfig.study.json --noEmit` passam.

## Review Focus

- Perda de dados: o workspace e os quizzes antigos continuam acessíveis depois da migração; uma segunda execução da migração não duplica nada; o `study_workspace` real nunca é reescrito sem backup e sem `--apply` (Tasks 2 e 3).
- Arquivo apagado que ainda era usado em tempo de execução: importações dinâmicas, caminhos em `scripts/`, `tsconfig*.json`, `vitest*.config.ts`, `next.config.ts`, `.env.example`, `docker-compose*.yml` (Task 7).
- Banco novo (sem nenhuma tabela do OpenMAIC) e banco antigo (com elas) iniciam do mesmo jeito (Task 3).
- A remoção da *junction* não apaga o conteúdo do `OpenMAIC\node_modules` (Task 8).
- A página `/study` continua igual: mesmo CSS, fontes e tema, sem provedores do OpenMAIC (Task 6).
- `next build` de produção funciona sem os pacotes locais (`packages/*`) e sem o `postinstall` antigo (Task 8).
- Avisos de licença presentes onde há código copiado (Tasks 4 e 9).

---

### Task 1: Rede de segurança — tag, teste de guarda e grafo de importações

**Files:**
- Create: `scripts/import-graph.mjs`, `tests/study/no-openmaic-imports.test.ts`
- Modify: nenhum arquivo existente

**Interfaces:**
- Produces:
  - `scripts/import-graph.mjs <raiz> [entradas...]`: imprime (a) as **costuras** (imports diretos de `components/study`, `lib/study`, `app/study`, `app/api/study` para fora deles) e (b) o **alcance** (arquivos e pacotes externos alcançados pelas entradas), usando a API do TypeScript para ler as importações (estáticas e `import()`), resolvendo `@/` e caminhos relativos. Somente leitura. Uma opção `--json` imprime o resultado em JSON para uso em testes.
  - `tests/study/no-openmaic-imports.test.ts`: lê as importações dos mesmos diretórios (sem executar nada) e falha se aparecer uma costura **fora** da lista `ALLOWED_SEAMS` (as oito linhas do mapa acima, com o arquivo de origem e o destino). Cada task seguinte remove uma entrada dessa lista; na Task 7 a lista fica vazia e o teste passa a proibir também `@openmaic/*`.

- [ ] **Step 1: Criar a tag de segurança**

  Run: `git tag pre-fase-4` (local, sem push). Conferir com `git tag --list pre-fase-4`.

- [ ] **Step 2: Escrever o teste de guarda que falha** (`tests/study/no-openmaic-imports.test.ts`)

  - `as costuras do código de estudo são exatamente as permitidas`: com `ALLOWED_SEAMS` **vazia** o teste falha listando as oito costuras (ver RED); com a lista preenchida passa.
  - `uma costura nova é detectada`: cria, em memória, um arquivo de estudo fictício que importa `@/lib/server/algo` e confirma que a função de varredura (exportada do próprio teste ou de `scripts/import-graph.mjs`) a reporta.

- [ ] **Step 3: Rodar e ver falhar**

  Run: `node node_modules/vitest/vitest.mjs run --config vitest.study.config.ts tests/study/no-openmaic-imports.test.ts`
  Expected: FAIL (lista vazia vs. costuras reais).

- [ ] **Step 4: Implementar** `scripts/import-graph.mjs` (base: os dois scripts de análise já usados para este mapa) e preencher `ALLOWED_SEAMS` com as costuras atuais.

- [ ] **Step 5: Rodar tudo**

  Run: `node node_modules/vitest/vitest.mjs run --config vitest.study.config.ts` e `node node_modules/typescript/bin/tsc -p tsconfig.study.json --noEmit`
  Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/import-graph.mjs tests/study/no-openmaic-imports.test.ts
git commit -m "test: guarda das importações do OpenMAIC e grafo do código de estudo"
```

---

### Task 2: Backup e migração dos quizzes antigos para `escolha`

**Files:**
- Create: `lib/study/legacy/quiz-migration.ts`, `scripts/backup-before-phase4.mjs`, `scripts/quiz-migration.ts`
- Test: `tests/study/quiz-migration.test.ts`

**Interfaces:**
- Consumes: `Workspace`, `Concept`, `exercisesOf`, `escolhaSchema` (2A).
- Produces (`lib/study/legacy/quiz-migration.ts`, funções puras):
  - `type LegacyQuestion = { stageId: string; stageName: string; sceneId: string; id: string; type: 'single'|'multiple'; question: string; options: {value: string; label: string}[]; answer: string[]; analysis?: string }`.
  - `extractLegacyQuestions(stages: { id: string; name: string; scenes: { id: string; data: unknown }[] }[]): LegacyQuestion[]`: lê só cenas `type: 'quiz'`; ignora pergunta sem opções/sem resposta, com mais de 6 opções ou com resposta fora das opções; nunca lança por dado estranho.
  - `isTestStage(name: string): boolean`: verdadeiro para nomes que começam com `TESTE` ou contêm `TESTE SINTÉTICO` (a migração os pula e os lista no relatório).
  - `planQuizMigration(ws: Workspace, questions: LegacyQuestion[]): { matched: Item[]; imported: Item[]; skipped: { question: LegacyQuestion; reason: 'teste'|'invalida'|'duplicada' }[] }`: a pergunta com `id` `study:<conceptId>` e conceito existente é **ligada** a ele; se esse conceito já tem um exercício `escolha` com o mesmo enunciado (comparação sem acentos, caixa e espaços), é `duplicada`; senão vira `matched` (novo exercício no conceito). Perguntas sem conceito correspondente ficam `imported`: vão para um conceito novo por stage, `origin: 'manual'`, rótulo `Importado · <nome da stage>`, sem tentativas. Ids dos exercícios: `legacy:<stageId>:<sceneId>:<n>` (estáveis, para a migração ser idempotente).
  - `applyQuizMigration(ws: Workspace, plan): Workspace`: aplica o plano, preserva `question` dos conceitos, mantém o limite de 30 exercícios por conceito (o excedente vai para o relatório, nunca é descartado em silêncio) e roda `materializeExercises`. Idempotente: aplicar duas vezes dá o mesmo resultado.
- Scripts:
  - `scripts/backup-before-phase4.mjs`: `pg_dump` completo via `docker exec` do banco da instalação pessoal para `Documents\gurIA-backup-fase4-<data>\`, mais a pasta de dados `%LOCALAPPDATA%\gurIA\Estudos`, e um arquivo `SHA256SUMS`; recusa sobrescrever uma pasta existente; **só leitura** no banco.
  - `scripts/quiz-migration.ts <saida.json> [--apply]`: lê o workspace e as stages por SQL somente leitura, imprime o relatório (quantas ligadas, importadas, duplicadas, de teste, inválidas, com os enunciados) e, **somente com `--apply`**, grava o workspace migrado com a checagem de revisão e arquiva todas as perguntas originais em `legacy-quizzes.json` na pasta de dados.

- [ ] **Step 1: Escrever os testes que falham** (`tests/study/quiz-migration.test.ts`; fixtures no formato real das cenas `quiz`)

  - `extractLegacyQuestions` lê perguntas `single` e `multiple`, ignora cena que não é `quiz`, opções vazias, resposta fora das opções e mais de 6 opções, e não lança com `null`/formato estranho.
  - `isTestStage` para `TESTE SINTÉTICO · Revisão espaçada`, `TESTE · Estudos guiados 1793…` e nomes reais (`Lógica do CS50…` → falso).
  - `uma pergunta study:<conceito> vira exercício do conceito`; `a mesma pergunta que o conceito já tem (acentos e caixa diferentes) é duplicada`; `pergunta sem conceito vira conceito Importado por stage`; `stage de teste é pulada`.
  - `applyQuizMigration` é idempotente e `workspaceSchema.parse` do resultado passa; o `question` antigo continua no conceito; passar de 30 exercícios gera item no relatório, não perda.
  - `answerIndexes` sai certo para `single` (`["C"]` → índice 2) e para `multiple`.

- [ ] **Step 2: Rodar e ver falhar**

  Run: `node node_modules/vitest/vitest.mjs run --config vitest.study.config.ts tests/study/quiz-migration.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implementar** o módulo puro e os dois scripts.

- [ ] **Step 4: Rodar tudo** (suíte inteira e `tsc`)

  Run: `node node_modules/vitest/vitest.mjs run --config vitest.study.config.ts` e `node node_modules/typescript/bin/tsc -p tsconfig.study.json --noEmit`
  Expected: PASS.

- [ ] **Step 5: PARAR e pedir confirmação ao dono** antes de qualquer coisa no banco real. Mostrar o que será feito (backup em `Documents`, relatório somente leitura) e perguntar se pode rodar. Com o sim: `node scripts/backup-before-phase4.mjs`, conferir `SHA256SUMS`, e rodar `node node_modules/tsx/dist/cli.mjs scripts/quiz-migration.ts <saida.json>` **sem `--apply`**; mostrar o relatório ao dono. O `--apply` no banco real só com um segundo "pode aplicar" do dono, em mensagem própria.

- [ ] **Step 6: Commit**

```bash
git add lib/study/legacy scripts/backup-before-phase4.mjs scripts/quiz-migration.ts tests/study/quiz-migration.test.ts
git commit -m "feat: backup e migração dos quizzes antigos para o formato escolha"
```

---

### Task 3: Banco, dono e middleware próprios

**Files:**
- Create: `lib/study/db.ts`, `lib/study/owner.ts`
- Modify: `lib/study/store.ts`, `lib/study/startup.ts`, `app/api/study/[...path]/route.ts` (dono), `middleware.ts` (reescrito para a gurIA), `tests/study/no-openmaic-imports.test.ts` (remover as costuras resolvidas), `tests/study/local-middleware.test.ts` e os testes de rota que simulam `with-owner` (passam a simular `lib/study/owner`)
- Test: `tests/study/db.test.ts`, `tests/study/owner.test.ts`, ajustes em `local-middleware.test.ts`

**Interfaces:**
- Produces:
  - `lib/study/db.ts`: `type Queryable = { query<T = any>(text: string, params?: unknown[]): Promise<{ rows: T[] }> }`; `studyPool(): Promise<Pool>` (pool único por processo, a partir de `DATABASE_URL`; cria `study_workspace` se faltar, igual ao de hoje; falha com mensagem em português se `DATABASE_URL` não existir). `store.ts` passa a usar este módulo e a exportar o mesmo que exporta hoje (`readWorkspace`, `saveWorkspace`, `saveWorkspaceInTransaction`, `studyPool`), sem mudar o comportamento (advisory lock, checagem de revisão, `REVISION_CONFLICT`).
  - `lib/study/owner.ts`: `resolveOwnerId(env = process.env): string | null` (com `OWNER_SINGLE_USER=true` devolve `OWNER_SINGLE_USER_ID` ou `study-local`; senão `null`); `withRequestOwner(req, handler)` com a **mesma assinatura** usada hoje na rota (`handler(owner: {ownerId}, headers: Headers) => Promise<Response>`): 401 sem dono, nenhum cookie anônimo, nenhum código de acesso.
  - `middleware.ts`: só a parte local — hostname `localhost`/`127.0.0.1`/`[::1]` (403 caso contrário), `Origin` igual ao `Host` quando presente, `POST/PUT/DELETE` em `/api/study/*` exigem `Origin`, `/` redireciona para `/study`, e só `/api/study/*` fica liberada em `/api/*`; sem referência a `lib/adaptive`, `access-token` ou `identity/navigation`.

- [ ] **Step 1: Escrever os testes que falham**

  - `db.test.ts`: `studyPool` sem `DATABASE_URL` lança a mensagem em português; com uma dupla de `pg` (`vi.mock('pg')`), reaproveita o mesmo pool em chamadas seguidas e cria `study_workspace` uma única vez.
  - `owner.test.ts`: sem `OWNER_SINGLE_USER` → `null`; com ele → `study-local` e com `OWNER_SINGLE_USER_ID` → o id; `withRequestOwner` sem dono devolve 401 sem chamar o handler e com dono repassa `ownerId` e um `Headers` com `Cache-Control` aplicável pela rota.
  - `local-middleware.test.ts` (ajustado): mesmas garantias de hoje (host fora de localhost → 403, `Origin` diferente → 403, escrita sem `Origin` → 403, rotas fora de `/api/study` → 403, `/` → `/study`) contra o `middleware.ts` novo.
  - O teste de guarda perde as costuras `lib/persistence/server-provider`, `@openmaic/storage`, `lib/server/identity/single-user`, `lib/server/identity/with-owner` (falha enquanto a lista não for atualizada junto com o código).

- [ ] **Step 2: Rodar e ver falhar**

  Run: `node node_modules/vitest/vitest.mjs run --config vitest.study.config.ts tests/study/db.test.ts tests/study/owner.test.ts tests/study/local-middleware.test.ts tests/study/no-openmaic-imports.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implementar** os dois módulos, religar `store.ts`, `startup.ts` e a rota, e reescrever o `middleware.ts`. Os arquivos antigos de `lib/server` e `lib/persistence` **ainda não são apagados** (Task 7).

- [ ] **Step 4: Rodar tudo** (suíte inteira e `tsc`)

  Run: `node node_modules/vitest/vitest.mjs run --config vitest.study.config.ts` e `node node_modules/typescript/bin/tsc -p tsconfig.study.json --noEmit`
  Expected: PASS.

- [ ] **Step 5: Verificação com banco isolado**

  Subir a demo isolada em um **banco novo** (volume sem nenhuma tabela do OpenMAIC) e conferir que `/api/study/health` e `GET workspace` funcionam; depois com o banco da demo que já tem as tabelas antigas. Rodar `node scripts/practice-e2e.mjs` e `node scripts/skills-e2e.mjs`. Parar a demo e o container 5441 no fim.
  Expected: tudo aprovado nos dois bancos.

- [ ] **Step 6: Commit**

```bash
git add lib/study/db.ts lib/study/owner.ts lib/study/store.ts lib/study/startup.ts "app/api/study/[...path]/route.ts" middleware.ts tests/study
git commit -m "feat: banco, dono e middleware próprios no lugar dos do OpenMAIC"
```

---

### Task 4: Remover a Área Pro e copiar o que a gurIA usa de utilitários

**Files:**
- Create: `lib/study/capped-stream.ts`, `lib/study/web/extract.ts`, `THIRD_PARTY_NOTICES.md`
- Modify: `lib/study/mcp.ts`, `lib/study/startup.ts`, `components/study/StudyApp.tsx` (remove o link "Área Pro", `proEnabled` e a consulta `/api/agent/runtime`), `app/api/study/[...path]/route.ts` (`course-source` usa `lib/study/web/extract`), `next.config.ts` (remove `OPENMAIC_STUDY_PRO_CODEX`), testes
- Delete: `lib/study/pro/` e os testes `pro-codex-live`, `pro-codex-stream`, `pro-runner-live`, `pro-store-isolation`

**Interfaces:**
- Produces:
  - `lib/study/capped-stream.ts`: a mesma função usada por `mcp.ts` (corpo de resposta com limite de bytes), copiada com o cabeçalho "Adaptado do OpenMAIC (MIT)".
  - `lib/study/web/extract.ts`: `extractPageText(html: string, url: string): { title: string; text: string }` com a **mesma saída** que a rota `course-source` usa hoje de `builtin-extraction` (só o necessário: Readability + conversão para texto), com cabeçalho MIT. Dependências externas da cópia são listadas em `THIRD_PARTY_NOTICES.md` e entram no `package.json` da Task 8.
  - `THIRD_PARTY_NOTICES.md`: lista de cada arquivo copiado do OpenMAIC (origem, licença MIT, texto do aviso).

- [ ] **Step 1: Escrever os testes que falham**

  - `capped-stream.test.ts`: corta o corpo no limite, devolve o que coube, não lança com corpo vazio.
  - `web-extract.test.ts`: com HTML de exemplo (título, parágrafos, menu e script) devolve título e texto limpos, sem script/menu; HTML vazio devolve texto vazio; a saída é igual à da função antiga para o mesmo HTML (usar a função antiga **dentro do teste** como oráculo enquanto ela existir).
  - `o texto do README/guia não cita a Área Pro` (`docs/guia`, `README.md`): sem "Área Pro" nem "OPENMAIC_STUDY_PRO_CODEX".
  - O teste de guarda perde as costuras `lib/server/capped-stream`, `lib/web-fetch/builtin-extraction`, `lib/agent/runtime/stream-fn`, `lib/server/agent-runtime/*`.

- [ ] **Step 2: Rodar e ver falhar**

  Run: `node node_modules/vitest/vitest.mjs run --config vitest.study.config.ts tests/study/capped-stream.test.ts tests/study/web-extract.test.ts tests/study/no-openmaic-imports.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implementar**: copiar os utilitários, religar `mcp.ts` e `course-source`, simplificar `startup.ts` para só validar `DATABASE_URL` e o dono, tirar a Área Pro da interface e apagar `lib/study/pro/` com seus testes.

- [ ] **Step 4: Rodar tudo** (suíte inteira e `tsc`)

  Run: `node node_modules/vitest/vitest.mjs run --config vitest.study.config.ts` e `node node_modules/typescript/bin/tsc -p tsconfig.study.json --noEmit`
  Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/study components/study/StudyApp.tsx "app/api/study/[...path]/route.ts" next.config.ts THIRD_PARTY_NOTICES.md tests/study docs README.md
git commit -m "refactor: sem Área Pro, com utilitários próprios para MCP e extração de página"
```

---

### Task 5: Tirar o player de quiz: Biblioteca e revisão passam para o Praticar

**Files:**
- Modify: `components/study/StudyApp.tsx` (remove `ClassroomSurface`, `startQuiz`, o estado do quiz e `openPractice`), `components/study/CoursesPlan.tsx` (botões que criavam aula/prática), `components/study/useStudyNavigation.ts` (a aba `library` e o campo `practice` saem; entradas antigas salvas continuam válidas), `components/study/practice/PracticeTab.tsx` (aceita `initialConceptIds`), `app/api/study/[...path]/route.ts` (remove as rotas `classroom` e `classroom-result`), `lib/study/locale.ts`, `docs/guia/estudos.md`, `README.md`, testes
- Delete: `components/study/StudyLibrary.tsx`, `components/scene-renderers/quiz-view.tsx` (e sua entrada em `tsconfig.study.json`)

**Interfaces:**
- Produces:
  - O botão "Revisar" do conceito e o botão de revisão do mapa abrem a aba Praticar com o modo **Revisão espaçada** (ou **Rápido**, se o conceito não estiver vencido) e o conceito pré-selecionado (`initialMode` e `initialConceptIds`), sem iniciar sozinho a sessão.
  - `useStudyNavigation`: continua lendo entradas antigas do histórico (com `tab: 'library'` ou `practice: {...}`) e as converte para `praticar` sem erro (teste com um `sessionStorage` antigo).
  - A rota `classroom-result` deixa de existir; o domínio só muda por `session-answer`/`exercise-submit` (modo definido no servidor).
  - O guia e o README passam a dizer que as práticas antigas foram migradas para exercícios (Task 2).

- [ ] **Step 1: Escrever os testes que falham**

  - `navigation`: entradas antigas com `library`/`practice` viram `praticar` e não quebram; as abas válidas hoje continuam válidas.
  - `a rota classroom-result não existe` e `a rota classroom não existe` (404 em `route.ts`).
  - Teste de guarda: some a costura `components/classroom/ClassroomSurface`; `tsconfig.study.json` não lista mais `quiz-view.tsx`.
  - Texto: `docs/guia/estudos.md` não cita "player" nem "Biblioteca"; cita que os quizzes antigos viraram exercícios.

- [ ] **Step 2: Rodar e ver falhar**

  Run: `node node_modules/vitest/vitest.mjs run --config vitest.study.config.ts`
  Expected: FAIL nos testes novos.

- [ ] **Step 3: Implementar** a troca de fluxo, apagar os dois arquivos e remover as rotas.

- [ ] **Step 4: Rodar tudo** (suíte inteira e `tsc`)

  Run: `node node_modules/vitest/vitest.mjs run --config vitest.study.config.ts` e `node node_modules/typescript/bin/tsc -p tsconfig.study.json --noEmit`
  Expected: PASS.

- [ ] **Step 5: Verificação visual**

  Subir a demo isolada, rodar `node scripts/practice-e2e.mjs` e `node scripts/skills-e2e.mjs` (atualizar os roteiros se mencionarem a Biblioteca) e abrir "Revisar" em um conceito para ver a aba Praticar pré-preenchida. Parar a demo.
  Expected: aprovados, sem erros de console.

- [ ] **Step 6: Commit**

```bash
git add components/study "app/api/study/[...path]/route.ts" lib/study/locale.ts tsconfig.study.json docs README.md tests/study scripts
git commit -m "refactor: revisão e prática passam para a aba Praticar, sem o player de quiz do OpenMAIC"
```

---

### Task 6: Layout, configuração e instrumentação próprios

**Files:**
- Create: `app/globals.css` próprio (só o que `/study` usa) e `app/layout.tsx` novo (substitui o do OpenMAIC), `instrumentation.ts` novo
- Modify: `next.config.ts` (sem `transpilePackages`, `serverExternalPackages` e `outputFileTracingIncludes` do OpenMAIC; sem a verificação de `NEXT_PUBLIC_PI_CHAT_ENABLED`; mantém `distDir`, o `env` de `OPENMAIC_STUDY_LOCAL` e a troca de `node:crypto` no cliente), `tests/study` (teste do layout)
- Delete (depois da verificação): `instrumentation-node.ts`

**Interfaces:**
- Produces:
  - `app/layout.tsx`: só `<html lang="pt-BR">`, a fonte (Inter via `@fontsource-variable/inter`, como hoje), o `globals.css` próprio e o script de tema claro/escuro já usado pelo `/study`; **sem** `AdaptiveProvider`, `I18nProvider`, `ThemeProvider` do OpenMAIC, `Toaster`, `AgentRegistryInit`, `ModelSettingsInit`, `StorageHealthNotice`, `AccessCodeGuard` nem `ProSwapWatcher`. Metadados: título `gurIA · Aprenda conectando ideias`.
  - `instrumentation.ts`: só chama `lib/study/startup` no Node.
  - Teste: `no-openmaic-layout.test.ts` lê `app/layout.tsx`, `instrumentation.ts` e `next.config.ts` e falha se citarem `@openmaic`, `lib/server`, `lib/persistence`, `lib/adaptive`, `lib/hooks`, `components/ui` ou `agent`.

- [ ] **Step 1: Escrever o teste que falha** (`tests/study/no-openmaic-layout.test.ts`) e capturar as telas de referência **antes** de mexer: rodar a demo e `node scripts/readme-demo/screenshots.mjs` com `E2E_OUT` apontando para uma pasta temporária (não para `docs/`), guardando as imagens como "antes".

- [ ] **Step 2: Rodar e ver falhar**

  Run: `node node_modules/vitest/vitest.mjs run --config vitest.study.config.ts tests/study/no-openmaic-layout.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implementar** o layout, o CSS global mínimo (copiando só as regras base de que `study.css` depende, e conferindo no navegador), a instrumentação e a configuração.

- [ ] **Step 4: Rodar tudo** (suíte inteira e `tsc`)

  Run: `node node_modules/vitest/vitest.mjs run --config vitest.study.config.ts` e `node node_modules/typescript/bin/tsc -p tsconfig.study.json --noEmit`
  Expected: PASS.

- [ ] **Step 5: Comparação visual**

  Subir a demo e gerar as telas "depois" com o mesmo script; ler as imagens lado a lado (rede 2D/3D, plano, aulas, estudos, praticar, skills, tema escuro e 390 px). Rodar os dois roteiros e2e.
  Expected: sem diferença visível além do esperado; roteiros aprovados; zero erros de console. Parar a demo.

- [ ] **Step 6: Commit**

```bash
git add app/layout.tsx app/globals.css instrumentation.ts next.config.ts tests/study
git rm instrumentation-node.ts
git commit -m "refactor: layout, configuração e instrumentação próprios da gurIA"
```

---

### Task 7: Apagar o código do OpenMAIC que sobrou, em lotes

**Files:**
- Delete (por lotes, **só o que o grafo mostrar como não alcançado**): `app/classroom`, `app/eval`, `app/generation-preview`, `app/workbench`, `app/workspace`, `app/page.tsx` (a rota `/` vira redirecionamento do `middleware.ts`), `app/api/*` exceto `study`, `components/*` exceto `study` (e o que o grafo ainda alcançar), `lib/*` exceto `study` (idem), `packages/`, `render-service/`, `skills/`, `community/`, `eval/`, `e2e/`, `configs/`, `assets/`, `boards/`, `brag-output*`, `types/` não usados, `desktop/` se for do OpenMAIC, `Dockerfile`, `docker-compose.yml`, `openmaic.example.yml`, `comfyui-setup-instructions.md`, `tsconfig.build.json`, `vitest.config.ts` e `vitest.eval.config.ts` da raiz, testes fora de `tests/study`, `public/` que a gurIA não usa (mantém `public/study`), scripts do OpenMAIC em `scripts/` (mantém `guria-*`, `start-study.ps1`, `readme-demo/`, `practice-e2e.mjs`, `skills-e2e.mjs`, `import-graph.mjs`, `backup-before-phase4.mjs`, `quiz-migration.ts`, `mastery-impact.ts` e o que o grafo ainda usar)
- Modify: `tests/study/no-openmaic-imports.test.ts` (lista vazia e proíbe `@openmaic/*`), `tsconfig.json`/`tsconfig.study.json` (sem `paths` e `include` das pastas apagadas)

**Interfaces:**
- Consumes: `scripts/import-graph.mjs` (Task 1).
- Produces: a lista de apagar de cada lote vem da saída do grafo (`alcance` das entradas `app/study`, `app/api/study`, `app/layout.tsx`, `middleware.ts`, `instrumentation.ts`, `next.config.ts`), **nunca** de uma lista escrita à mão; o resultado de cada lote vai para o corpo do commit.

- [ ] **Step 1: Escrever o teste que falha**: o teste de guarda com `ALLOWED_SEAMS = []` e a nova regra `nenhum arquivo do projeto importa @openmaic/*`; `no-dangling-references.test.ts`: `tsconfig*.json`, `vitest*.config.ts`, `next.config.ts`, `package.json` (scripts) e `docs/guia/*.md` não citam caminhos que não existem em disco.

- [ ] **Step 2: Rodar e ver falhar**

  Run: `node node_modules/vitest/vitest.mjs run --config vitest.study.config.ts tests/study/no-openmaic-imports.test.ts tests/study/no-dangling-references.test.ts`
  Expected: FAIL (ainda há `@openmaic` e pastas citadas).

- [ ] **Step 3: Gerar a lista e apagar por lotes.** Lote A: pastas de topo que o grafo marca como não alcançadas e que nenhum arquivo de `scripts/` ou de configuração cita. Lote B: `app/` e `app/api`. Lote C: `components/` e `lib/`. Lote D: raiz (`packages`, `render-service`, `skills`, `community`, `eval`, `e2e`, configurações e arquivos soltos). **Depois de cada lote**, `tsc -p tsconfig.study.json`, a suíte de estudo e `git status` conferido; se algo falhar, restaurar o lote com `git restore --source=HEAD --staged --worktree -- <pasta>` (nunca `git reset --hard`) e reclassificar a pasta como "ainda usada".

- [ ] **Step 4: Rodar tudo** (suíte inteira e `tsc`)

  Run: `node node_modules/vitest/vitest.mjs run --config vitest.study.config.ts` e `node node_modules/typescript/bin/tsc -p tsconfig.study.json --noEmit`
  Expected: PASS.

- [ ] **Step 5: Verificação com o app rodando**

  Subir a demo isolada e rodar `node scripts/practice-e2e.mjs`, `node scripts/skills-e2e.mjs` e `node scripts/readme-demo/screenshots.mjs` (saída temporária) e conferir as imagens; abrir `/` e ver o redirecionamento para `/study`. Parar a demo.
  Expected: aprovados, sem erros de console.

- [ ] **Step 6: Commit** (um commit por lote, com a lista do que saiu no corpo; caminhos explícitos para as modificações; remoções com `git rm -r -- <pasta>`)

```bash
git rm -r -q -- <pastas do lote>
git commit -m "chore: remove código do OpenMAIC não usado (lote <A|B|C|D>)"
```

---

### Task 8: `package.json` mínimo e `node_modules` independente

**Files:**
- Modify: `package.json` (nome `guria`, só as dependências usadas, scripts novos), `pnpm-lock.yaml` (regerado), `pnpm-workspace.yaml` (removido), `.gitignore` se preciso
- Test: `tests/study/package-contract.test.ts`

**Interfaces:**
- Produces:
  - `package.json` com `name: "guria"`, `engines.node >=22.19.0`, `scripts`: `dev` (`next dev --webpack`), `build`, `start`, `test` (`vitest run --config vitest.study.config.ts`), `typecheck` (`tsc -p tsconfig.study.json --noEmit`), `db:up`/`db:down` (projeto Docker `guria-db`), **sem** `postinstall` e sem nenhum script do OpenMAIC.
  - `dependencies`: só o que o grafo (Task 7) e o código copiado (Task 4) realmente importam (esperado: `next`, `react`, `react-dom`, `zod`, `pg`, `@modelcontextprotocol/sdk`, a fonte Inter, as bibliotecas da extração de página e as de mapa/gráfico que o `components/study` usar), cada uma com a versão já usada hoje; `devDependencies`: `typescript`, `vitest`, `tsx`, `@playwright/test`, `prettier`, `@types/*` necessários.
  - Teste: `package-contract.test.ts` lê `package.json` e o grafo e confere que (a) todo pacote externo importado por arquivos do projeto está declarado, (b) não há dependência declarada sem uso, (c) não há `@openmaic/*` nem `workspace:` e (d) os scripts citados existem.

- [ ] **Step 1: Escrever o teste que falha** (`tests/study/package-contract.test.ts`).

- [ ] **Step 2: Rodar e ver falhar**

  Run: `node node_modules/vitest/vitest.mjs run --config vitest.study.config.ts tests/study/package-contract.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Gerar o `package.json` novo** a partir do grafo e **testar a instalação em uma cópia**, antes de mexer na pasta real: copiar o projeto (sem `node_modules`) para `%TEMP%\guria-install-test`, rodar `pnpm install` lá, e nessa cópia rodar a suíte de estudo, o `tsc`, `pnpm build` (produção) e `pnpm dev` com a demo isolada, mais os dois roteiros e2e. Corrigir o `package.json` até tudo passar na cópia.

- [ ] **Step 4: Rodar o contrato** (`package-contract`, suíte inteira e `tsc`) na pasta real ainda com a junction.

  Run: `node node_modules/vitest/vitest.mjs run --config vitest.study.config.ts` e `node node_modules/typescript/bin/tsc -p tsconfig.study.json --noEmit`
  Expected: PASS.

- [ ] **Step 5: PARAR e pedir confirmação ao dono** antes de trocar o `node_modules` real. Explicar: a pasta é um atalho (junction) para o `node_modules` do projeto OpenMAIC; vamos remover **só o atalho** e instalar as dependências da gurIA aqui; o projeto OpenMAIC não é alterado; requer internet. Com o sim: (1) `fsutil reparsepoint query node_modules` para confirmar que é junction; (2) `cmd /c rmdir node_modules` (remove o atalho, não o conteúdo); (3) conferir que `curso app\OpenMAIC\node_modules` continua com o mesmo número de itens de antes; (4) `pnpm install`; (5) suíte, `tsc`, build e e2e na pasta real. Se algo falhar: recriar a junction com `cmd /c mklink /J node_modules <caminho do OpenMAIC\node_modules>` e voltar ao estado anterior.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml tests/study/package-contract.test.ts
git rm -q -- pnpm-workspace.yaml
git commit -m "build: package.json próprio da gurIA e instalação independente do OpenMAIC"
```

---

### Task 9: Documentação, avisos e fechamento

**Files:**
- Modify: `README.md` ("Estado e próximos passos", instalação), `docs/guia/instalacao.md` (sem a junction e sem `pnpm build:packages`; comandos novos), `docs/guia/estudos.md`, `THIRD_PARTY_NOTICES.md`, `.env.example`, `tests/study/example-config.test.ts` e `tests/study/readme-links.test.ts` (ajustes), `lib/legacy-browser-import/README.md` (some com a pasta)
- Create: `docs/superpowers/notes/2026-11-20-fase-4-resultado.md` (o que foi removido, tamanho antes e depois, o que ficou no banco)

**Interfaces:**
- Produces: instalação passo a passo em um computador novo funcionando com `git clone`, `pnpm install` e `pnpm dev --port 3033 --hostname 127.0.0.1` (com `GURIA_LOCAL=true`); README com o crédito curto ao OpenMAIC e o aviso de que as tabelas antigas do banco podem ser apagadas à mão se o dono quiser; nota de resultado com o antes e depois (número de arquivos, tamanho, dependências).

- [ ] **Step 1: Escrever os testes que falham**: `readme-links` e `example-config` cobrindo as instruções novas (comando de instalação, ausência de "junction", "build:packages" e "OpenMAIC" como requisito); o README não cita arquivo removido.

- [ ] **Step 2: Rodar e ver falhar**

  Run: `node node_modules/vitest/vitest.mjs run --config vitest.study.config.ts tests/study/readme-links.test.ts tests/study/example-config.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implementar** os textos e a nota de resultado (números medidos com `git ls-files | wc -l` e o tamanho da pasta antes e depois).

- [ ] **Step 4: Instalação limpa de ponta a ponta**: clonar a branch para `%TEMP%`, `pnpm install`, subir banco e app isolados, rodar suíte, `tsc`, build e os dois roteiros e2e; remover a cópia temporária.
  Expected: tudo aprovado sem nenhum arquivo ou pasta do OpenMAIC.

- [ ] **Step 5: Rodar tudo** (suíte inteira e `tsc`) e conferir `git status` (só as alterações antigas do dono em `AGENTS.md`/`tsconfig.json`, que continuam fora dos commits).

- [ ] **Step 6: Commit**

```bash
git add README.md docs THIRD_PARTY_NOTICES.md .env.example tests/study
git commit -m "docs: fim da dependência do OpenMAIC, instalação e avisos de licença"
```

- [ ] **Step 7 (manual, do dono):** apontar o `origin` para o repositório dele (`git remote set-url origin <url>`, sem push) e publicar quando quiser. A gurIA não faz isso sozinha.

---

## Autoavaliação

- **Cobertura do spec (seção 5):** mapa do grafo de importações (Task 1); substituição de documentos/DSL, identidade, banco e quiz por equivalentes próprios (Tasks 3 a 5; "documentos/DSL" some porque a gurIA só os usava para as aulas de quiz, que a Task 5 remove); migração dos quizzes antigos para `escolha` com backup (Task 2); apagar módulos não usados, `packages`, `render-service`, `skills/openmaic` (Task 7); `node_modules` independente (Task 8); aviso MIT onde há código copiado (Tasks 4 e 9).
- **Fica fora desta fase:** apagar as tabelas antigas do banco (decisão do dono, depois); publicar o repositório; qualquer mudança de comportamento do estudo.
- **Decisões minhas, ajustáveis:** a **Área Pro** (Codex dentro da gurIA) é removida porque só existe com `OPENMAIC_STUDY_PRO_CODEX=true` e depende do runtime inteiro do agente; o **player de quiz** é removido e a revisão vai para a aba Praticar; a **Biblioteca** (lista de práticas antigas) some; perguntas sem conceito viram um conceito "Importado" por stage (nada se perde) e stages de teste (`TESTE …`) são puladas; `GURIA_LOCAL` continua obrigatório; as tabelas antigas ficam no banco sem uso.
- **Consistência de nomes:** `ALLOWED_SEAMS`, `LegacyQuestion`, `extractLegacyQuestions`, `isTestStage`, `planQuizMigration`, `applyQuizMigration`, `studyPool`, `resolveOwnerId`, `withRequestOwner`, `extractPageText` e `pre-fase-4` aparecem com a mesma grafia em todas as tasks.
- **Riscos e como são contidos:** (1) perda de dados: backup verificado, `--apply` explícito, idempotência e nenhuma exclusão no banco; (2) apagar algo ainda usado: lista de remoção gerada pelo grafo, lotes com restauração por `git restore` e teste de referências soltas; (3) a *junction* do `node_modules`: instalação testada primeiro em uma cópia, remoção só do atalho com `cmd /c rmdir` e conferência de que o `OpenMAIC\node_modules` continua intacto; (4) regressão visual: capturas antes e depois do layout novo e os dois roteiros e2e em cada task que mexe na tela.
- **Duas pausas obrigatórias** para o dono: antes do backup e da migração no banco real (Task 2) e antes de trocar o `node_modules` (Task 8).
