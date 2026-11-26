# Praticar logo após processar uma aula — plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** depois de aprovar os conceitos de uma aula importada, oferecer "Praticar agora" e, no roteiro, "Praticar esta aula", abrindo o Praticar no modo Rápido com os conceitos da aula marcados.

**Architecture:** função pura em `lib/study/ui/navigation.ts` escolhe modo e conceitos; o `StudyApp` ganha `openPractice(target)` (o mesmo caminho do `openReview`) e o passa até `LessonActions`; a revisão mostra o aviso depois de aprovar.

**Tech Stack:** Next.js 16, React 19, vitest.

**Spec:** [docs/superpowers/specs/2026-11-24-praticar-apos-aula-design.md](../specs/2026-11-24-praticar-apos-aula-design.md)

## Global Constraints
- Textos em português do Brasil; a sessão nunca começa sozinha.
- Modo sempre `'rapido'` para os conceitos da aula (nunca `'revisao'`).
- Minutos exibidos: `max(3, nº de conceitos)`, como "cerca de N min".
- Commits só com caminhos explícitos; `AGENTS.md` e `tsconfig.json` fora; sem push.

## Review Focus
- Aula cujos conceitos aprovados não têm exercício: nenhum aviso e nenhum botão (teste em `lessonPracticeTarget`).
- Aula processada sem nenhum conceito aprovado (todos descartados): sem botão (mesmo teste).
- Conceito de outra aula com prefixo parecido (`L1:` vs `L10:`): não entra (teste).

---

### Task 1: `lessonPracticeTarget`

**Files:** Modify `lib/study/ui/navigation.ts`; Test `tests/study/navigation.test.ts` (ou o teste de navegação existente).

**Interfaces — Produces:** `lessonPracticeTarget(concepts: Concept[], lessonId: string): { mode: 'rapido'; conceptIds: string[]; minutes: number } | null` — conceitos com id começando por `${lessonId}:` e com exercício (`exercisesOf(c).length > 0`); `null` se nenhum.

- [ ] Testes: retorna rápido com os ids da aula; ignora conceitos sem exercício; `null` sem conceitos praticáveis; `L1` não pega `L10:x`; `minutes` = 3 para 1 conceito e 5 para 5 conceitos. Rodar e ver falhar.
- [ ] Implementar; rodar e passar; commit `feat: alvo do Praticar para uma aula importada`.

### Task 2: aviso na revisão e botão no roteiro

**Files:** Modify `components/study/StudyApp.tsx` (`openPractice`), `components/study/Materials.tsx` (repassa a prop), `components/study/courses/LessonReview.tsx` (aviso após aprovar; botão "Praticar esta aula" em `LessonActions` para status `processada`), `lib/study/locale.ts` (`ptLesson.practiceNow`, `practiceLater`, `practiceThisLesson`, `practiceOffer(n, min)`).

**Interfaces — Consumes:** `lessonPracticeTarget` (Task 1); `setPracticeStart` + `navigate({ tab: 'praticar' })` como no `openReview`.

- [ ] Implementar; `npm run typecheck`; conferir na demo: aprovar uma aula semeada mostra o aviso, "Praticar agora" abre o Praticar em Rápido com os conceitos marcados e sem sessão iniciada; o botão aparece na aula processada.
- [ ] Rodar `npm test` e `npm run e2e:cursos`; commit `feat: praticar logo após aprovar uma aula importada`.
