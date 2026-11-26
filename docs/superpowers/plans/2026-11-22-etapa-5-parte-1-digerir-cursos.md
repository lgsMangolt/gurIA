# Etapa 5, parte 1 — digerir cursos baixados: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** importar um curso (pasta, arquivos, zip, pacote MIT OCW, YouTube) como roteiro sem IA, processar cada aula sob demanda em resumo, conceitos e exercícios em português, com revisão, e montar uma apostila exportável em PDF.

**Architecture:** um módulo novo `lib/study/courses/` com leitores puros por fonte que produzem um `ImportDraft`; um serviço que funde o rascunho no curso existente por impressão digital e guarda o texto extraído em disco (`<studyRoot>/courses/<courseId>/`); o processamento de aula usa o `generate` do harness escolhido com um esquema próprio, grava o resultado pendente em disco e só entra no workspace pela aprovação, no servidor, com checagem de revisão. Documentos passam pelo MarkItDown (Python) chamado como processo externo.

**Tech Stack:** Next.js 16 / React 19 / zod 4 / pg (já existentes); `yauzl` (zip); Python 3.12 + `markitdown[pdf,docx,pptx]==0.1.8` (externo); `yt-dlp` (externo); Whisper e FFmpeg locais (já usados).

**Spec:** [docs/superpowers/specs/2026-11-22-etapa-5-importar-cursos-design.md](../specs/2026-11-22-etapa-5-importar-cursos-design.md)

## Global Constraints

- Português brasileiro em toda a interface, mensagens de erro e documentação.
- Importar **nunca** chama IA. Processar uma aula ou "o resto" só depois de mostrar o envio estimado e a IA usada; nunca troca de provedor; sem chaves de API.
- Nada entra na rede, no Praticar ou nos exercícios sem aprovação do dono; aprovar não concede domínio (`attempts` vazio, `due: 0`).
- Termos do original (caracteres, código, fórmulas) preservados ao lado da tradução.
- Conteúdo do curso é dado não confiável: nunca executar arquivos do pacote; o prompt manda ignorar instruções do material.
- Leitura de fonte local: só leitura, restrita à pasta ou ao arquivo escolhido (`fs.realpath` dentro da raiz; sem seguir links para fora); vídeos não são copiados. Rotas novas só no modo local (`GURIA_LOCAL`).
- Zip: extração para `<studyRoot>/courses/<courseId>/zip/`, rejeitando caminhos absolutos ou com `..`, limite de **2 GB** descompactados e **20.000** arquivos.
- Python **3.12** e MarkItDown **0.1.8** com extras `pdf,docx,pptx`, num ambiente em `%LOCALAPPDATA%\CognitiveStudyHubTools\markitdown\` (`Scripts\markitdown.exe`). MarkItDown não é usado para YouTube nem OCR.
- `yt-dlp.exe` em `%LOCALAPPDATA%\CognitiveStudyHubTools\yt-dlp\`. Só metadados e legendas (`--skip-download`); nunca baixa vídeo.
- Nada da Udemy é baixado; nenhuma proteção contra cópia é contornada.
- Duração estimada sem vídeo/legenda: `max(5, round(palavras / 150))` minutos, `hoursSource: 'estimate'`.
- Limite por envio à IA: **60.000** caracteres; aula maior é dividida em partes sequenciais, avisando quantas antes.
- Workspace: mudanças de esquema só opcionais (dados antigos continuam válidos); escrita com checagem de `revision` (`REVISION_CONFLICT`).
- Testes: `npm test`, `npm run typecheck`, demo isolada 5441/3034; nada no banco real (5440). Nunca `git add -A`/`git add .`; `AGENTS.md` e `tsconfig.json` do dono ficam fora dos commits; nunca push.
- Formatar com Prettier só os arquivos tocados.

## Review Focus

- **Pasta com nomes sem número ou mistos** (`Aula 10.srt`, `aula 2.srt`, `Intro.pdf`): ordem natural sem diferenciar maiúsculas, arquivos sem número depois dos numerados; pinned em `readFolder`.
- **Legenda e documento com o mesmo nome-base em formatos diferentes** (`01 Intro.srt` + `01 Intro.vtt` + `01 Intro.pdf`): uma aula só; com `.srt` e `.vtt` da mesma aula, usa um (prefere `.srt`) e não duplica texto; pinned em `readFolder`.
- **Reimportar depois de renomear, juntar e reordenar aulas**: o roteiro editado é preservado, e uma fonte nova vai para o fim; pinned em `mergeImport`.
- **Zip com caminho malicioso ou gigante** (`../../x`, 30.000 arquivos): recusado com mensagem em português, nada escrito fora da pasta; pinned em `extractZip`.
- **Cota esgotada no meio de "Processar o resto"**: para na aula que falhou, as já processadas continuam aguardando revisão e as demais continuam pendentes; pinned em `processQueue`.

---

### Task 1: Formato do curso importado e fusão por impressão digital

**Files:**
- Modify: `lib/study/domain.ts` (`courseSchema`: campos opcionais)
- Create: `lib/study/courses/types.ts`, `lib/study/courses/merge.ts`, `lib/study/courses/fingerprint.ts`, `lib/study/courses/store.ts`
- Test: `tests/study/courses-merge.test.ts`, `tests/study/courses-store.test.ts`, `tests/study/domain.test.ts` (caso novo)

**Interfaces:**
- Produces:
  - Em `courseSchema`: `origin?: 'pasta' | 'arquivos' | 'zip' | 'ocw' | 'youtube'`, `license?: string` (≤ 300), `importSource?: string` (≤ 2000, caminho ou URL). Em cada item de `lessons`: `status?: LessonStatus`, `summary?: string` (≤ 20000), `sourceIds?: string[]` (≤ 50), `minutesEstimated?: boolean`.
  - `type LessonStatus = 'importada' | 'precisa-transcrever' | 'sem-texto' | 'escaneado' | 'processando' | 'aguardando-revisao' | 'processada' | 'falhou' | 'fonte-ausente' | 'texto-ausente'`.
  - `type ImportSource = { id: string; kind: 'legenda' | 'documento' | 'video' | 'audio' | 'youtube'; path?: string; url?: string; title: string; fingerprint: string; durationSeconds?: number; caption?: 'manual' | 'automatica' }`.
  - `type DraftLesson = { title: string; sources: ImportSource[]; minutes: number | null }`; `type ImportDraft = { title: string; origin: Course['origin']; license?: string; importSource: string; lessons: DraftLesson[]; ignored: string[] }`.
  - `fingerprintFile(root: string, file: string): Promise<string>` → `sha256(relPath + '\0' + size + '\0' + sha256(conteúdo))`; `fingerprintYoutube(videoId: string): string` → `'yt:' + videoId`.
  - `mergeImport(course: Course | null, draft: ImportDraft, sourcesById: Record<string, ImportSource>): { course: Course; sources: Record<string, ImportSource>; added: number; missing: number }` (pura).
  - `courseFiles(root: string, courseId: string)` → `{ dir, manifest, text(lessonId), result(lessonId), zipDir }`; `readManifest(root, courseId): Manifest`, `writeManifest(root, courseId, m: Manifest)` (escrita atômica `.tmp` + rename). `type Manifest = { sources: Record<string, ImportSource>; queue?: QueueState }`.

- [ ] **Step 1: Testes que falham** em `tests/study/courses-merge.test.ts`:
  - `cria curso novo com aulas na ordem do rascunho, status 'importada' e sourceIds`.
  - `reimportar a mesma fonte não duplica aulas e mantém título editado, ordem e status` (curso com aula renomeada para "Minha aula 2", ordem trocada e `status: 'processada'` → depois do merge, iguais).
  - `aula juntada (sourceIds de duas fontes) continua uma aula só`.
  - `fonte nova vai para o fim com status 'importada'; fonte sumida marca 'fonte-ausente' sem apagar resumo` (`added: 1`, `missing: 1`).
  - `duração nula vira estimativa: minutes = max(5, round(palavras/150)) e minutesEstimated = true` (o merge recebe `minutes` já calculado pelo leitor; assertar que `minutes: null` no rascunho vira 5 e `minutesEstimated: true`).
  - Em `domain.test.ts`: `workspace antigo sem os campos novos continua válido`.
  - Em `courses-store.test.ts`: `manifest grava e lê com escrita atômica` e `courseFiles não aceita courseId com '..' ou '/'`.

- [ ] **Step 2: Rodar e ver falhar**: `node node_modules/vitest/vitest.mjs run --config vitest.study.config.ts tests/study/courses-merge.test.ts tests/study/courses-store.test.ts tests/study/domain.test.ts` → FAIL (módulos inexistentes).

- [ ] **Step 3: Implementar** os tipos, `fingerprint.ts`, `merge.ts` e `store.ts`. A correspondência de aula no merge é: aula existente cujo `sourceIds` contém o id de uma fonte do rascunho com a mesma `fingerprint`; `lesson.id` novo é `randomUUID()`.

- [ ] **Step 4: Rodar e passar** (mesmo comando) e `npm run typecheck`.

- [ ] **Step 5: Commit** — `git add lib/study/domain.ts lib/study/courses tests/study/courses-merge.test.ts tests/study/courses-store.test.ts tests/study/domain.test.ts` · `feat: formato do curso importado e fusão por impressão digital`.

---

### Task 2: Leitores de pasta, arquivos soltos, legendas e zip

**Files:**
- Create: `lib/study/courses/read-folder.ts`, `lib/study/courses/read-zip.ts`, `lib/study/courses/safe-path.ts`
- Modify: `package.json` (`yauzl` exato, `@types/yauzl` em dev), `package-lock.json`
- Test: `tests/study/courses-read-folder.test.ts`, `tests/study/courses-read-zip.test.ts`

**Interfaces:**
- Consumes: `ImportDraft`, `ImportSource`, `fingerprintFile` (Task 1); `parseCaptions(text)` de `lib/study/runtime/media.ts`.
- Produces:
  - `insideRoot(root: string, candidate: string): Promise<string>` → caminho real dentro da raiz, ou `AppError(400, 'FORA_DA_PASTA', ...)`.
  - `readFolder(root: string, opts?: { files?: string[] }): Promise<ImportDraft>` (com `files`, só esses arquivos: origem `'arquivos'`; sem, a pasta inteira, recursiva: origem `'pasta'`).
  - Extensões: legenda `.srt .vtt`; documento `.pdf .docx .pptx`; vídeo `.mp4 .mkv .webm .mov`; áudio `.mp3 .m4a .wav`. O resto vai para `ignored`.
  - `extractZip(zipFile: string, dest: string, limits?: { maxBytes: number; maxFiles: number }): Promise<{ files: number; bytes: number }>` (padrão 2 GB / 20.000).
  - Duração: legenda → `ceil(último endSeconds / 60)`; vídeo/áudio → `null` aqui (Task 6 mede com ffprobe); documento → `null` (estimado no merge depois de convertido; ver Task 4).

- [ ] **Step 1: Testes que falham** (fixtures criadas em pasta temporária no próprio teste):
  - `ordena por número natural, sem diferenciar maiúsculas, sem número no fim` (`aula 2.srt`, `Aula 10.srt`, `Intro.srt` → `aula 2`, `Aula 10`, `Intro`).
  - `agrupa legenda, documento e vídeo do mesmo nome-base numa aula`.
  - `com .srt e .vtt da mesma aula usa só o .srt`.
  - `ignora .html, .js, .css e imagens e lista em ignored`.
  - `legenda inválida vira aula 'sem-texto' em vez de derrubar a importação`.
  - `arquivo fora da raiz é recusado com FORA_DA_PASTA`.
  - zip: `extrai zip válido`; `recusa entrada '../../x' com ZIP_INSEGURO e não escreve nada fora`; `recusa zip com mais arquivos que o limite com ZIP_GRANDE` (limite baixo no teste).

- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar.** `npm install --save-exact yauzl` e `npm install --save-dev --save-exact @types/yauzl`; extração em fluxo com `yauzl.open(..., { lazyEntries: true })`, contando bytes reais descompactados.
- [ ] **Step 4: Rodar e passar**, mais `tests/study/package-contract.test.ts`.
- [ ] **Step 5: Commit** — `feat: leitores de pasta, arquivos, legendas e zip para importar cursos`.

---

### Task 3: Leitor do pacote MIT OpenCourseWare

**Files:**
- Create: `lib/study/courses/read-ocw.ts`
- Test: `tests/study/courses-read-ocw.test.ts`

**Interfaces:**
- Consumes: `readFolder` não é usado; `ImportDraft` (Task 1).
- Produces: `isOcwPackage(dir: string): boolean` (existem `data.json`, `content_map.json` e a pasta `resources/`); `readOcw(dir: string): Promise<ImportDraft>`.
- Regras do pacote (medidas no zip real): título em `data.json.course_title`, licença em `data.json.license`; cada `resources/*/data.json` com `resourcetype: 'Video'` vira uma aula (título do recurso; legendas por `video_files.video_captions_resources[].file`, cujo nome-base está em `static_resources/`; o vídeo não é copiado nem baixado, e `video_files.archive_url` fica só como `url` da fonte `video`); cada `resourcetype: 'Document'` com PDF vira uma aula, **exceto** os de título `3play pdf file` (transcrições de vídeo), que são ignorados porque a legenda já cobre; imagens e arquivos do site vão para `ignored`. Ordem: vídeos e documentos por título em ordem natural, documentos depois dos vídeos. O caminho do arquivo no recurso é `/courses/<slug>/<nome>`; o arquivo real é `static_resources/<nome>`.

- [ ] **Step 1: Testes que falham:**
  - Fixture mínima montada no teste (`data.json`, `content_map.json`, 2 recursos de vídeo com legenda, 1 PDF de exercício, 1 `3play pdf file`): `lê título e licença`, `um vídeo vira aula com a legenda ligada`, `3play pdf file não vira aula`, `ordem: vídeos e depois documentos em ordem natural`.
  - Teste com o zip real, **só se** `process.env.GURIA_OCW_ZIP` apontar para um arquivo (senão `it.skip`): extrai numa pasta temporária, `readOcw` → `title === 'Chinese I (Streamlined)'`, `license` contém `by-nc-sa/4.0`, **11** aulas de vídeo e todas com ao menos uma legenda, nenhuma aula com título `3play pdf file`, todos os PDFs restantes viram aula ou estão em `ignored`.

- [ ] **Step 2: Rodar e ver falhar** (com `GURIA_OCW_ZIP` apontando para `Downloads\21g.107-fall-2014.zip` numa rodada local; o zip nunca é alterado).
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar e passar** com e sem `GURIA_OCW_ZIP`.
- [ ] **Step 5: Commit** — `feat: leitor do pacote MIT OpenCourseWare`.

---

### Task 4: Conversão de documentos com MarkItDown

**Files:**
- Create: `lib/study/courses/markitdown.ts`, `scripts/install-markitdown.ps1`
- Modify: `docs/guia/instalacao.md` (seção "Importar cursos: Python e MarkItDown"), `README.md` (requisito opcional)
- Test: `tests/study/courses-markitdown.test.ts`, `tests/study/readme-links.test.ts` (termos novos)

**Interfaces:**
- Consumes: `runLocal(executable, args, timeout)` de `lib/study/runtime/media.ts`.
- Produces:
  - `markitdownPath(): string` (`''` se ausente); `markitdownReady(): boolean`.
  - `convertDocument(file: string, run?: typeof runLocal): Promise<{ markdown: string; scanned: boolean; words: number }>` — roda `markitdown.exe <file>` com tempo-limite de 120 s; `scanned` é `true` quando o PDF tem menos de **20** palavras por página em média (páginas obtidas pela contagem de quebras `\f` ou, sem elas, por `words < 50`); sem MarkItDown → `AppError(503, 'SEM_MARKITDOWN', 'Para importar PDF, DOCX ou PPTX instale o conversor: veja docs/guia/instalacao.md.')`.
  - `scripts/install-markitdown.ps1`: cria o ambiente com `py -3.12 -m venv`, instala `markitdown[pdf,docx,pptx]==0.1.8` e confere `markitdown --version`; mensagens em português; idempotente.

- [ ] **Step 1: Testes que falham** (com `run` falso, sem Python real): `devolve o markdown e a contagem de palavras`; `PDF quase sem texto vira scanned`; `sem o executável lança SEM_MARKITDOWN`; `tempo esgotado vira AppError em português`; `o guia de instalação cita install-markitdown.ps1, Python 3.12 e MarkItDown 0.1.8`.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** e rodar uma vez o script de verdade na máquina (instala no `%LOCALAPPDATA%`, fora do repositório) para converter um PDF do curso de teste numa pasta temporária; anotar o resultado no commit.
- [ ] **Step 4: Rodar e passar.**
- [ ] **Step 5: Commit** — `feat: conversão de PDF, DOCX e PPTX com MarkItDown`.

---

### Task 5: Rota de importação e roteiro na tela

**Files:**
- Create: `lib/study/courses/import-service.ts`, `components/study/courses/ImportCourse.tsx`, `components/study/courses/CourseRoadmap.tsx`
- Modify: `app/api/study/[...path]/route.ts`, `components/study/Materials.tsx` (botão **Importar curso**), `lib/study/locale.ts` (textos)
- Test: `tests/study/courses-import-service.test.ts`, `tests/study/courses-routes.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces:
  - `importCourse(input: { root: string; owner: string; path?: string; files?: string[]; courseId?: string }, deps: { readWorkspace, saveWorkspace, convertDocument }): Promise<{ revision: number; courseId: string; report: { lessons: number; added: number; missing: number; ignored: string[]; scanned: number } }>` — decide a fonte: `.zip` → `extractZip` + `isOcwPackage ? readOcw : readFolder` sobre a pasta extraída; pasta → `isOcwPackage ? readOcw : readFolder`; arquivos → `readFolder(root, { files })`. Converte documentos (texto em `courseFiles.text(lessonId)`), marca `escaneado`, calcula a estimativa de minutos, funde com `mergeImport`, salva manifest e workspace com checagem de revisão.
  - Rotas (só com `GURIA_LOCAL=true`, senão 403 `SO_MODO_LOCAL`):
    - `POST /api/study/course-import` `{ revision, path?: string, files?: string[], url?: string, courseId?: string }` → `{ revision, data, report }` (`url` é tratado na Task 10).
    - `GET /api/study/course-tools` → `{ markitdown: boolean, ytDlp: boolean, whisper: boolean }`.
    - `PATCH /api/study/course-roadmap` `{ revision, courseId, lessons: Array<{ id: string; title: string; sourceIds: string[] }> }` → reordena, renomeia, junta (sourceIds unidos) e remove (aula fora da lista); recusa fonte inexistente ou repetida em duas aulas.
  - Tela: em Materiais, **Importar curso** abre `ImportCourse` (campo de caminho para pasta, zip ou arquivos, link do YouTube, a caixa de consentimento já existente "conteúdo próprio ou autorizado"); depois mostra o relatório ("38 aulas · 120 arquivos ignorados · 2 PDFs escaneados"). `CourseRoadmap` lista as aulas com estado, licença no topo, e permite renomear, mover para cima ou para baixo, juntar com a próxima e remover.

- [ ] **Step 1: Testes que falham:**
  - serviço: `importa pasta e grava texto dos documentos em disco, não no workspace`; `zip OCW detectado vira origem 'ocw'`; `reimportar a mesma pasta não cria curso novo`; `PDF escaneado vira aula 'escaneado' e entra em report.scanned`; `REVISION_CONFLICT quando a revisão está velha`.
  - rotas: `course-import responde 403 sem GURIA_LOCAL`; `course-roadmap junta duas aulas`; `course-roadmap recusa a mesma fonte em duas aulas`; `aulas importadas entram no plano (planner) com a duração estimada`.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar e passar**; `npm run typecheck`; abrir a demo (`npm run demo`), importar uma pasta sintética e conferir o roteiro na tela e no plano; captura de tela anexada ao relatório da task.
- [ ] **Step 5: Commit** — `feat: importar curso como roteiro, sem IA`.

---

### Task 6: Texto da aula, transcrição local e estimativa

**Files:**
- Create: `lib/study/courses/lesson-text.ts`, `lib/study/courses/estimate.ts`
- Modify: `lib/study/runtime/media.ts` (extrair `transcribeFile`)
- Test: `tests/study/courses-lesson-text.test.ts`, `tests/study/courses-estimate.test.ts`, testes existentes de mídia continuam verdes

**Interfaces:**
- Consumes: `courseFiles`, `readManifest` (Task 1); `parseCaptions`; `toolPaths`, `runLocal`.
- Produces:
  - `transcribeFile(source: string, workdir: string): Promise<Segment[]>` em `media.ts` (o mesmo FFmpeg → WAV 16 kHz → `whisper-cli -oj` de hoje, sem os quadros de vídeo); `MediaPipeline` passa a usá-lo, sem mudar o comportamento.
  - `type Segment = { startSeconds: number; endSeconds: number; text: string }`.
  - `type LessonText = { segments: Segment[]; markdown: string; chars: number; parts: number }`.
  - `loadLessonText(root: string, courseId: string, lesson: Lesson, sources: Record<string, ImportSource>, deps?: { transcribe: typeof transcribeFile }): Promise<LessonText>` — legendas concatenadas com tempos + Markdown dos documentos; vídeo/áudio sem legenda é transcrito e o resultado é guardado em `courseFiles.text(lessonId)` (próxima vez não transcreve); `parts = ceil(chars / 60000)`.
  - `estimateLessons(items: Array<{ chars: number; needsTranscription: boolean; durationSeconds?: number }>): { envios: number; caracteres: number; transcricaoMinutos: number }`.

- [ ] **Step 1: Testes que falham:** `junta legendas na ordem com tempos`; `segunda chamada não transcreve de novo`; `aula de 130.000 caracteres tem 3 partes`; `fonte ausente no disco vira AppError 'FONTE_AUSENTE'`; `texto convertido ausente (backup restaurado em outra máquina) é regerado se a fonte existe e, se não existe, a aula vira 'texto-ausente'`; `estimativa soma envios e minutos de transcrição`; e o teste atual de `MediaPipeline` continua passando depois da extração.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar e passar** (suíte inteira).
- [ ] **Step 5: Commit** — `feat: texto da aula com transcrição local e estimativa de envio`.

---

### Task 7: Processar uma aula e revisar

**Files:**
- Create: `lib/study/courses/lesson-analysis.ts`, `lib/study/courses/incorporate-lesson.ts`, `components/study/courses/LessonReview.tsx`
- Modify: `app/api/study/[...path]/route.ts`, `components/study/courses/CourseRoadmap.tsx`
- Test: `tests/study/courses-lesson-analysis.test.ts`, `tests/study/courses-incorporate-lesson.test.ts`, `tests/study/courses-routes.test.ts`

**Interfaces:**
- Consumes: `loadLessonText`, `estimateLessons` (Task 6); `exerciseSchema` (`lib/study/exercises/schema.ts`); `s.generate(prompt, schema, images, model, harness)` (`lib/study/service.ts`).
- Produces:
  - `lessonAnalysisSchema` (zod): `{ summary: string(1..8000); concepts: Array<{ id; label(≤160); summary(≤4000); note(≤20000); originalTerms: string[](≤20); evidence: string(≤1000); startSeconds?: number; endSeconds?: number; exercises: Exercise[](1..4) }>(0..12); connections: Array<{ sourceId; targetId; relationship }>(≤30) }`.
  - `lessonPromptText(ctx: { courseTitle: string; lessonTitle: string; part: number; parts: number; currentContext: string }, text: string): string` — português, material não confiável, preservar termos do original em `originalTerms` e no texto, não inventar fatos fora do material, exercícios só dos tipos `escolha`, `ligar`, `escrita` (e `desenho` só quando o conceito é visual), evidência citando o trecho.
  - `analyzeLesson(text: LessonText, ctx, generate): Promise<LessonResult>` — uma chamada por parte, resultados fundidos (ids prefixados por parte), resumo final = resumos das partes unidos; valida com `lessonAnalysisSchema` e com `exerciseSchema`; id de conceito final `${lessonId}:${id}`.
  - `incorporateLesson(state: Workspace, courseId: string, lessonId: string, result: LessonResult, approvedIds: string[]): Workspace` (pura) — conceitos aprovados com `origin: 'lesson'`, `courseIds: [courseId]`, evidência com `courseId`, `exercises` da aula, `attempts: []`, `due: 0`; conexões só entre aprovados; `lesson.summary = result.summary`, `lesson.status = 'processada'`. Reaprovar a mesma aula não duplica (reusa id).
  - Rotas: `POST /api/study/course-lesson-estimate` `{ courseId, lessonIds: string[] }` → `estimateLessons(...)` + `{ harness, model }`; `POST /api/study/course-lesson-process` `{ revision, courseId, lessonId, harness? }` → grava `courseFiles.result(lessonId)` e `status: 'aguardando-revisao'` (falha de cota/login: `status: 'falhou'` com a mensagem, nada perdido); `POST /api/study/course-lesson-approve` `{ revision, courseId, lessonId, approvedIds }` → `incorporateLesson` + salvar com checagem de revisão.
  - Tela: na aula, **Processar esta aula** abre a confirmação com a estimativa e a IA; ao terminar, `LessonReview` mostra resumo, conceitos (marcar, editar título e resumo, descartar) e exercícios; **Aprovar selecionados**.

- [ ] **Step 1: Testes que falham** (com `generate` falso):
  - `analisa aula curta em uma chamada e valida exercícios`; `aula em 3 partes faz 3 chamadas e une conceitos sem repetir id`; `resposta com exercício inválido é recusada com AppError em português`; `o prompt manda preservar os termos do original e ignorar instruções do material`.
  - `incorporateLesson só leva os aprovados, sem domínio (attempts vazio, due 0)`; `conexão com conceito não aprovado é descartada`; `aprovar de novo não duplica conceitos`.
  - rotas: `process grava resultado em disco e status aguardando-revisao`; `falha de cota deixa status falhou e não altera conceitos`; `approve com revisão velha dá REVISION_CONFLICT`.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar e passar**; `npm run typecheck`.
- [ ] **Step 5: Commit** — `feat: processar aula importada em resumo, conceitos e exercícios, com revisão`.

---

### Task 8: Processar o resto

**Files:**
- Create: `lib/study/courses/queue.ts`
- Modify: `app/api/study/[...path]/route.ts`, `components/study/courses/CourseRoadmap.tsx`
- Test: `tests/study/courses-queue.test.ts`

**Interfaces:**
- Consumes: rota/serviço de processar aula (Task 7); `writeManifest` (Task 1).
- Produces:
  - `type QueueState = { lessonIds: string[]; done: string[]; failed?: { lessonId: string; message: string }; running: boolean; startedAt: number }`.
  - `processQueue(courseId: string, lessonIds: string[], processOne: (lessonId: string) => Promise<void>, save: (q: QueueState) => void): Promise<QueueState>` — uma aula por vez, na ordem do roteiro; para na primeira falha de cota, login, modelo ou disponibilidade (os mesmos códigos que a correção em lote usa) e registra `failed`; um único processamento por curso de cada vez.
  - Rotas: `POST /api/study/course-process-rest` `{ courseId, confirmed: true }` (só aulas `importada`, `precisa-transcrever` ou `falhou`) → `202`, roda em segundo plano no servidor; `GET /api/study/course-queue?courseId=` → `QueueState`.
  - Tela: **Processar o resto · estimativa** pede confirmação com a soma; barra de progresso por polling a cada 3 s; mensagem clara quando parou por cota.

- [ ] **Step 1: Testes que falham:** `processa em ordem e marca done`; `para na falha de cota e mantém o resto pendente`; `segunda chamada com fila rodando responde 409 'FILA_ATIVA'`; `sem confirmed: true responde 400`.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar e passar.**
- [ ] **Step 5: Commit** — `feat: processar o resto do curso em fila, com estimativa`.

---

### Task 9: Apostila

**Files:**
- Create: `lib/study/courses/apostila.ts`, `components/study/courses/Apostila.tsx`, `components/study/courses/apostila-print.module.css`
- Modify: `components/study/courses/CourseRoadmap.tsx`
- Test: `tests/study/courses-apostila.test.ts`

**Interfaces:**
- Consumes: workspace (curso, aulas com `summary`, conceitos com `courseIds` e `exercises`).
- Produces:
  - `buildApostila(state: Workspace, courseId: string): { title: string; origin?: string; license?: string; lessons: Array<{ id: string; title: string; pending: boolean; summary?: string; concepts: Array<{ label: string; summary: string; note: string }>; exercises: Exercise[] }>; answers: Array<{ lessonTitle: string; items: string[] }> }` (pura; não chama IA).
  - `Apostila.tsx`: capa (título, origem, licença), sumário com "pendente", seções por aula, gabarito no fim; **Exportar PDF** chama `window.print()`; a folha `@media print` esconde a interface da gurIA e quebra página por aula.

- [ ] **Step 1: Testes que falham:** `aula não processada aparece como pendente no sumário`; `só conceitos do curso entram`; `gabarito de escolha mostra a alternativa certa e de ligar mostra os pares`; `licença aparece na capa quando existe`.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar e passar**; na demo, abrir a apostila de um curso com uma aula processada (semeada) e conferir a pré-visualização de impressão do navegador; captura no relatório.
- [ ] **Step 5: Commit** — `feat: apostila do curso com exportação em PDF`.

---

### Task 10: YouTube (yt-dlp)

**Files:**
- Create: `lib/study/courses/read-youtube.ts`
- Modify: `lib/study/courses/import-service.ts`, `docs/guia/instalacao.md` (yt-dlp)
- Test: `tests/study/courses-read-youtube.test.ts`

**Interfaces:**
- Consumes: `runLocal`; `ImportDraft`, `fingerprintYoutube` (Task 1); `parseCaptions`.
- Produces:
  - `ytDlpPath(): string`; `isYoutubeUrl(url: string): boolean` (só `https://www.youtube.com/watch?v=`, `https://youtu.be/`, `https://www.youtube.com/playlist?list=`).
  - `readYoutube(url: string, workdir: string, run?: typeof runLocal): Promise<ImportDraft>` — `yt-dlp --flat-playlist -J <url>` para lista, títulos, ordem e duração; depois, por vídeo, `yt-dlp --skip-download --write-subs --write-auto-subs --sub-langs "pt.*,en.*,orig" --sub-format vtt -o <workdir>/%(id)s.%(ext)s <video>`; legenda manual tem prioridade, automática marcada `caption: 'automatica'`; sem legenda → aula `sem-texto`.

- [ ] **Step 1: Testes que falham** (com `run` falso devolvendo JSON gravado em fixture): `playlist vira aulas na ordem com duração`; `prefere legenda manual à automática`; `vídeo sem legenda vira sem-texto`; `URL que não é do YouTube é recusada`; `sem yt-dlp lança SEM_YTDLP com mensagem em português`; `nunca passa argumento que baixe o vídeo` (asserta `--skip-download` em toda chamada por vídeo).
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** e ligar `url` em `course-import`.
- [ ] **Step 4: Rodar e passar.**
- [ ] **Step 5: Commit** — `feat: importar curso do YouTube pelas legendas`.

---

### Task 11: Roteiro de ponta a ponta, documentação e fechamento

**Files:**
- Create: `scripts/courses-e2e.mjs`, `tests/fixtures/curso-exemplo/` (3 legendas `.srt` sintéticas e um `.txt` ignorado)
- Modify: `package.json` (`"e2e:cursos": "node scripts/courses-e2e.mjs"`), `README.md`, `docs/guia/estudos.md` (seção "Importar um curso"), `docs/superpowers/specs/2026-11-17-guria-reestruturacao-design.md` (etapa 5, parte 1 concluída)
- Test: `tests/study/readme-links.test.ts`

**Interfaces:**
- Consumes: tudo acima; demo isolada (`npm run demo`).

- [ ] **Step 1: Testes que falham** em `readme-links`: o README cita "Importar curso" e linka `docs/guia/estudos.md#importar-um-curso`; o guia cita YouTube, Udemy (só arquivos que você já tem), PDF, zip, a licença e "aulas sob demanda".
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Escrever o roteiro e2e** (Playwright com Edge, como `skills-e2e.mjs`), sem IA real: importar `tests/fixtures/curso-exemplo` pela tela → roteiro com 3 aulas e 1 ignorado → renomear e juntar duas aulas → reimportar e conferir que a edição ficou → aula semeada como processada aparece na apostila → tela estreita de 390 px sem rolagem horizontal → nenhum pedido a rotas de processamento e nenhum erro de console.
- [ ] **Step 4: Rodar tudo:** `npm test`, `npm run typecheck`, `npm run build`, `npm run e2e:skills`, `npm run e2e:praticar` (ressemear entre eles), `npm run e2e:cursos`; e uma importação manual do zip real do MIT na demo (só leitura do zip), processando **uma** aula com a IA de verdade só se o dono confirmar no chat.
- [ ] **Step 5: Commit** — `docs: importar cursos (etapa 5, parte 1)`.
