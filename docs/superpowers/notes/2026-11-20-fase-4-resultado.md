# Fase 4 — resultado: a gurIA sem o OpenMAIC

Plano: [2026-11-20-fase-4-remover-openmaic.md](../plans/2026-11-20-fase-4-remover-openmaic.md). Concluída em 2026-11-22, na branch `guria`, a partir da tag local `pre-fase-4`.

## Antes e depois (medido com git)

| | Antes (`pre-fase-4`) | Depois |
|---|---|---|
| Arquivos versionados | 4.057 | 257 |
| Tamanho dos arquivos versionados | ~131 MB | ~4,5 MB |
| Dependências no `package.json` | 138 + 33 de desenvolvimento | 12 + 12 de desenvolvimento |
| Pacotes instalados | `node_modules` era uma *junction* para o do OpenMAIC (pnpm, 2.536 entradas em `.pnpm`) | `node_modules` próprio, `npm ci` com 495 pacotes |
| Gerenciador | pnpm, com workspace e `postinstall` | npm, `package-lock.json`, sem `postinstall` |
| Importações do OpenMAIC no código da gurIA | dezenas (documentos, DSL, identidade, banco, quiz, Área Pro) | nenhuma (`tests/study/no-openmaic-imports.test.ts`) |

## O que saiu

- A **Área Pro** (Codex dentro da gurIA, que dependia do runtime inteiro do agente).
- O **player de quiz** e a **Biblioteca**: Revisar agora abre a aba Praticar com os conceitos marcados.
- Todo o código do OpenMAIC que a gurIA não alcançava, em quatro lotes: `assets`, `community`, `configs`, `e2e`, `eval`, `render-service`, `skills`, `.github`; o resto de `app/`, `components/` e `lib/`; `packages/`, os outros testes e scripts, o `public/` fora de `public/study`, `Dockerfile`, `docker-compose.yml` e configurações de raiz.
- `.dockerignore`, o `.env.example` de 819 linhas com chaves de provedores, e o `CONTRIBUTING`/`SECURITY` do OpenMAIC (reescritos para a gurIA).

## O que ficou próprio

- Banco (`lib/study/db.ts`), dono único (`lib/study/owner.ts`) e o portão de acesso local (`proxy.ts`, antes `middleware.ts`).
- Layout, CSS base, instrumentação e `next.config.ts` próprios; telas idênticas pixel a pixel às de antes.
- Quatro arquivos copiados com o aviso MIT (`capped-stream`, `ssrf-guard`, `pinned-dispatcher`, `fetch-page`) e o teste do `ssrf-guard`, listados em `THIRD_PARTY_NOTICES.md`.
- `docker-compose.db.yml` autossuficiente: projeto `guria-db`, porta 5440 por padrão (`npm run db:up`).

## O que ficou no banco

Nada foi apagado do banco. O `study_workspace` real (dono `study-local`) foi copiado antes da fase em `Documents\gurIA-backup-fase4-2026-11-21` (dump restaurável, JSON e somas SHA-256). A migração dos quizzes antigos foi conferida em modo leitura: as 14 perguntas válidas já existiam no workspace, então nada precisou ser gravado.

As tabelas do OpenMAIC (`document_*`, `stage_meta`, `runtime_*`, `openmaic_schema_migrations` e outras) continuam no banco, sem uso, como rede de segurança. Apagá-las é decisão do dono, à mão e depois de um backup.

Os nomes `openmaic` do banco, do usuário e da chave do volume (`<projeto>_openmaic-postgres`) também ficaram: trocar criaria um banco novo e vazio.

## Verificação

Testes (vitest), checagem de tipos, build de produção, os roteiros e2e de Skills e Praticar na demo isolada (banco 5441, app 3034) e uma instalação limpa a partir de um clone em pasta temporária.

## Pendente, do dono

- Apontar o `origin` para o repositório próprio (`git remote set-url origin <url>`) antes de qualquer envio. Nenhum push foi feito.
