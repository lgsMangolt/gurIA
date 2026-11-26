# gurIA Fase 1 — README, docs e screenshots — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar um README novo com screenshots reais e instalação verificada, docs reorganizados e arquivos herdados do OpenMAIC (README-zh, README.openmaic, CHANGELOG) removidos.

**Architecture:** Um ambiente de demonstração isolado (outro banco, outra porta, dados sintéticos) alimenta um script Playwright que gera os PNGs em `docs/screenshots/`. O README é escrito em cima do que existe hoje e a instalação é validada num clone limpo. Nenhum código de produto muda.

**Tech Stack:** Node 22.19+, pnpm 10+, Next.js, Playwright (Edge), vitest (`vitest.study.config.ts`), Docker/PostgreSQL.

**Spec:** `docs/superpowers/specs/2026-11-17-guria-reestruturacao-design.md` (seções 4 e "Ordem de execução", fase 1)

## Global Constraints

- Português brasileiro, Windows, Node **22.19 ou superior**, pnpm **10 ou superior**, PostgreSQL via Docker.
- Trabalhar numa branch nova `guria/fase-1-readme`, saindo de `codex/openmaic-study-local`. **Nunca** `git push`. **Nunca** `git add -A`/`git add .`: adicionar só caminhos explícitos (a árvore tem alterações e arquivos não rastreados que não são desta fase: `AGENTS.md`, `tsconfig.json`, `scripts/study-*`).
- Screenshots só com dados sintéticos, em banco **isolado**: porta de banco **5441**, app na porta **3034**, projeto Docker `guria-readme-db`. Nunca tocar 5440/3033 (instalação pessoal).
- Screenshots só do que existe hoje (sem exercícios novos nem skills).
- Manter `LICENSE` (MIT) e um crédito curto ao OpenMAIC no README; não apagar código nesta fase.
- Antes de concluir: `node node_modules/vitest/vitest.mjs run --config vitest.study.config.ts` e `node node_modules/typescript/bin/tsc -p tsconfig.study.json --noEmit` passam.

## Review Focus

- Comandos de instalação com caminho que tem espaço e acento (`C:\Users\Lucas gabriel\...`): o README mostra os comandos entre aspas e a validação usa um caminho assim (Task 4).
- Links do README, do `CONTRIBUTING.md` e de `lib/legacy-browser-import/README.md` apontando para arquivos removidos: nenhum link quebrado (Task 4).
- Screenshot com dado pessoal (nome real, caminho de usuário, título de material real): o seed só tem texto sintético e a checagem acusa caminhos `C:\Users` no texto da página (Tasks 2 e 3).
- Clone limpo sem `.env.local`: o README diz exatamente quais variáveis criar e o app falha de forma legível sem elas (Task 4).
- CI ou teste que dependa de `CHANGELOG.md`/`README-zh.md`: o teste de exemplo de configuração e os scripts de versão continuam verdes após a remoção (Task 4).

---

### Task 1: Branch e regras de versionamento da documentação

**Files:**
- Modify: `.gitignore:76-78` (bloco `# docs`)
- Create: nada além da branch

**Interfaces:**
- Produces: caminhos versionáveis `docs/superpowers/**`, `docs/screenshots/**`, `docs/guia/**`.

- [ ] **Step 1: Criar a branch**

Run: `git checkout -b guria/fase-1-readme`
Expected: `Switched to a new branch`. As alterações não commitadas continuam na árvore.

- [ ] **Step 2: Confirmar que os caminhos novos hoje são ignorados**

Run: `git check-ignore -v docs/screenshots/x.png docs/guia/x.md docs/superpowers/specs/2026-11-17-guria-reestruturacao-design.md`
Expected: as três linhas aparecem, todas pela regra `/docs/*`.

- [ ] **Step 3: Adicionar exceções ao `.gitignore`**

Abaixo de `!/docs/study-agent-context.md` acrescentar `!/docs/superpowers/`, `!/docs/screenshots/` e `!/docs/guia/`.

- [ ] **Step 4: Verificar**

Run: `git check-ignore -v docs/screenshots/x.png docs/guia/x.md docs/superpowers/specs/2026-11-17-guria-reestruturacao-design.md`
Expected: nenhuma saída (exit code 1).

- [ ] **Step 5: Commit**

```bash
git add .gitignore docs/superpowers
git commit -m "docs: versiona design e plano da reestruturação"
```

---

### Task 2: Seed sintético e ambiente de demonstração isolado

**Files:**
- Create: `scripts/readme-demo/fixture.ts` (exporta `buildDemoWorkspace(): Workspace`)
- Create: `scripts/readme-demo/seed.ts` (insere o fixture no banco 5441)
- Create: `scripts/readme-demo/up.mjs` (sobe Postgres `guria-readme-db` na 5441 e o app na 3034, com `OWNER_SINGLE_USER=true`)
- Test: `tests/study/readme-fixture.test.ts`

**Interfaces:**
- Consumes: `workspaceSchema` e `validateReferences(data: Workspace)` de `lib/study/domain.ts`; `saveWorkspace(owner: string, revision: number, raw: unknown)` de `lib/study/store.ts`; owner padrão `local` (`lib/server/identity/single-user.ts`, `OWNER_SINGLE_USER_ID`).
- Produces: `buildDemoWorkspace()`; comando `node scripts/readme-demo/up.mjs` que deixa `http://127.0.0.1:3034/study` pronto com os dados sintéticos.

- [ ] **Step 1: Escrever o teste do fixture**

Em `tests/study/readme-fixture.test.ts`, testes: `fixture sintético passa em workspaceSchema e validateReferences`; `tem ao menos 2 cursos, 12 conceitos, 1 plano e revisões` (asserções sobre as contagens); `não contém caminhos de usuário nem e-mails` (`JSON.stringify` não casa com `/C:\\\\Users|@[a-z]+\.[a-z]+/i`).

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/vitest/vitest.mjs run --config vitest.study.config.ts tests/study/readme-fixture.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar `buildDemoWorkspace(): Workspace` em `scripts/readme-demo/fixture.ts`**

Conteúdo inventado e neutro (ex.: cursos "Introdução à Estatística" e "Python para Dados"), com conceitos ligados entre si, estados de aprendizagem variados (para a rede mostrar as cores), um plano com disponibilidade por dia e revisões. Seguir os formatos de `lib/study/domain.ts` (`courseSchema`, `conceptSchema`).

- [ ] **Step 4: Rodar e ver passar**

Run: o mesmo comando do Step 2.
Expected: PASS.

- [ ] **Step 5: Implementar `seed.ts` e `up.mjs`**

`up.mjs` replica o padrão de `scripts/guria-desktop.mjs` (docker compose `-p guria-readme-db`, `OPENMAIC_DB_PORT=5441`, `next dev --webpack --hostname 127.0.0.1 --port 3034`) com `DATABASE_URL` apontando para a 5441 e `OWNER_SINGLE_USER=true`. Recusa subir se 3034 ou 5441 estiver ocupada, e **recusa qualquer porta 3033/5440**. `seed.ts` chama `saveWorkspace('local', 0, buildDemoWorkspace())`.

- [ ] **Step 6: Subir e conferir**

Run: `node scripts/readme-demo/up.mjs` e depois `curl -s http://127.0.0.1:3034/api/study/health`
Expected: JSON com `app` igual a `OpenMAIC Estudos`.

- [ ] **Step 7: Commit**

```bash
git add scripts/readme-demo tests/study/readme-fixture.test.ts
git commit -m "docs: ambiente de demonstração isolado com dados sintéticos"
```

---

### Task 3: Script de screenshots

**Files:**
- Create: `scripts/readme-demo/screenshots.mjs`
- Create (gerados): `docs/screenshots/rede-2d.png`, `rede-3d.png`, `plano.png`, `aulas.png`, `ia.png`

**Interfaces:**
- Consumes: app em `http://127.0.0.1:3034/study` (Task 2); botões/títulos `Rede de conhecimento`, `Plano de estudos`, `Aulas e materiais`, `IA e transcrição`; Playwright via `process.env.STUDY_PLAYWRIGHT` e Edge, como em `scripts/study-visual-smoke.mjs`.
- Produces: cinco PNGs, largura 1440, em `docs/screenshots/`.

- [ ] **Step 1: Implementar `screenshots.mjs`**

Segue o padrão de `study-visual-smoke.mjs`. Aborta se a URL não for `127.0.0.1:3034`. Para cada seção: clica no botão, espera o título, captura a viewport. Para a rede 3D, alternar para a projeção 3D antes de capturar. Antes de cada captura, lê `document.body.innerText` e **falha** se casar `/C:\\Users|AppData|@[a-z0-9.-]+\.[a-z]+/i`.

- [ ] **Step 2: Rodar**

Run: `node scripts/readme-demo/screenshots.mjs`
Expected: imprime os 5 caminhos e sai com código 0.

- [ ] **Step 3: Verificar os arquivos**

Run: `node -e "for (const f of ['rede-2d','rede-3d','plano','aulas','ia']) { const s=require('fs').statSync('docs/screenshots/'+f+'.png').size; if (s<20000) throw new Error(f+' muito pequeno'); console.log(f,s) }"`
Expected: cinco linhas, nenhum erro. Abrir os PNGs e conferir visualmente que não há dado pessoal.

- [ ] **Step 4: Commit**

```bash
git add scripts/readme-demo/screenshots.mjs docs/screenshots
git commit -m "docs: screenshots da gurIA com dados sintéticos"
```

---

### Task 4: README novo, docs reorganizados e remoção dos arquivos herdados

**Files:**
- Modify: `README.md` (reescrita completa)
- Create: `docs/guia/estudos.md` (conteúdo útil de `ESTUDOS.md`, sem caminhos pessoais), `docs/guia/instalacao.md`
- Delete: `README-zh.md`, `README.openmaic.md`, `CHANGELOG.md`, `ESTUDOS.md`
- Modify: `CONTRIBUTING.md`, `lib/legacy-browser-import/README.md`, `tests/server/model-config/example-config.test.ts` (só onde apontarem para arquivo removido)
- Test: `tests/study/readme-links.test.ts`

**Interfaces:**
- Consumes: PNGs de `docs/screenshots/` (Task 3).
- Produces: `README.md` com seções: o que é, screenshots, modos de uso atual, instalação, testes, estado do projeto, crédito ao OpenMAIC.

- [ ] **Step 1: Escrever o teste de links**

`tests/study/readme-links.test.ts`: `todo link relativo e imagem do README existem`; `README não referencia README.openmaic.md, README-zh.md, CHANGELOG.md nem ESTUDOS.md`; `README cita LICENSE e OpenMAIC`; `README não contém C:\Users nem o nome do dono`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/vitest/vitest.mjs run --config vitest.study.config.ts tests/study/readme-links.test.ts`
Expected: FAIL (README antigo cita os arquivos).

- [ ] **Step 3: Achar referências aos arquivos a remover**

Run: `git grep -nE "README\.openmaic|README-zh|CHANGELOG|ESTUDOS\.md" -- . ":!node_modules" ":!docs/superpowers"`
Expected: lista de arquivos a ajustar (já vistos: `CONTRIBUTING.md`, `lib/legacy-browser-import/README.md`, `tests/server/model-config/example-config.test.ts`, `brag-output/`). Corrigir cada um para apontar para `docs/guia/` ou remover a menção; `brag-output/` fica fora do escopo.

- [ ] **Step 4: Escrever `docs/guia/instalacao.md` e o README**

Instalação em Windows com comandos entre aspas para caminhos com espaço: `pnpm install`, `Copy-Item .env.example .env.local`, as variáveis mínimas necessárias (`DATABASE_URL`, `OWNER_SINGLE_USER=true`; listar as que o app exigir, descobertas no Step 6), `pnpm db:up`, `pnpm dev` e o endereço real. Sem mencionar `node_modules` como junction. Estado do projeto honesto (beta, Windows, depende de Codex ou Claude logado). Crédito curto: "Construída sobre o OpenMAIC (THU-MAIC, MIT)".

- [ ] **Step 5: Remover os arquivos herdados**

Run: `git rm README-zh.md README.openmaic.md CHANGELOG.md ESTUDOS.md`
Expected: quatro arquivos removidos.

- [ ] **Step 6: Validar a instalação num clone limpo**

Run: clone local do commit atual para `"%TEMP%\guria limpa"` (nome com espaço) e, lá dentro, executar cada comando do README em ordem: `pnpm install --frozen-lockfile`, `pnpm db:up` (com porta livre) e `pnpm dev`.
Expected: `/study` responde. Corrigir o README com qualquer variável ou porta diferente da prevista. Se o app falhar sem `.env.local`, anotar a mensagem de erro no README.

- [ ] **Step 7: Rodar testes e tipos**

Run: `node node_modules/vitest/vitest.mjs run --config vitest.study.config.ts` e `node node_modules/typescript/bin/tsc -p tsconfig.study.json --noEmit`
Expected: tudo PASS; `tsc` sem erros. Rodar também `node node_modules/vitest/vitest.mjs run tests/server/model-config/example-config.test.ts`. Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add README.md docs/guia CONTRIBUTING.md lib/legacy-browser-import/README.md tests/server/model-config/example-config.test.ts tests/study/readme-links.test.ts
git commit -m "docs: novo README, guia e remoção de documentação herdada do OpenMAIC"
```

---

## Autoavaliação

- **Cobertura do spec (fase 1):** README com screenshots e instalação (Tasks 3–4), remoção de `README-zh`, `README.openmaic`, `CHANGELOG` (Task 4), `ESTUDOS.md` → `docs/` (Task 4), screenshots com dados sintéticos em `docs/screenshots/` (Tasks 2–3), crédito curto e `LICENSE` mantidos (Task 4). Atualização do README após fases 2 e 3 pertence aos planos dessas fases.
- **Fora do escopo desta fase:** exercícios, modos, skills, remoção de código.
- **Consistência:** `buildDemoWorkspace` (Task 2) e as cinco imagens (Task 3) são usados com os mesmos nomes na Task 4.
