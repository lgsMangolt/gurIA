# Aviso do Windows para revisões vencidas — plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** aviso diário opcional do Windows com a contagem de revisões vencidas, funcionando com o app fechado.
**Architecture:** resumo em arquivo gravado após cada `saveWorkspace`; script PowerShell lê e notifica; tarefa agendada criada/removida pela rota `reminder` a pedido do dono na tela de Configurações.
**Tech Stack:** Node/Next.js, PowerShell 5.1 (Windows), vitest.
**Spec:** [docs/superpowers/specs/2026-11-24-aviso-revisoes-windows-design.md](../specs/2026-11-24-aviso-revisoes-windows-design.md)

## Global Constraints
- Nenhum nome de conceito no arquivo nem no aviso; só datas e contagem.
- Desligado por padrão; tarefa só criada quando o dono liga na tela.
- Falha no resumo nunca falha o salvamento.
- Hora validada `^([01]\d|2[0-3]):[0-5]\d$` no servidor; o comando é montado no servidor.
- Textos em português; sem push; commits com caminhos explícitos.

## Review Focus
- Conceito nunca praticado (due 0, sem tentativas) não conta (teste do resumo).
- Conceito sem exercício não conta (teste do resumo).
- Hora inválida ("25:00", "7:00; rm") recusada com 400 (teste de rota).
- Arquivo-resumo ausente ou corrompido: o script sai sem aviso e sem erro (teste manual do script).

---

### Task 1: resumo das revisões
**Files:** Create `lib/study/reminder.ts`; Modify `lib/study/store.ts`; Test `tests/study/reminder.test.ts`.
**Produces:** `reviewDueDates(state: Workspace): number[]` (ordenado; conceitos com exercício e ≥ 1 tentativa); `writeReviewSummary(root: string, state: Workspace, now = Date.now()): void` grava `lembrete-revisoes.json` atomicamente; `reminderSummaryPath(root)`. `saveWorkspace` chama `writeReviewSummary(studyRoot(LOCALAPPDATA, owner), data)` dentro de try/catch após o COMMIT.
- [ ] Testes que falham → implementar → passar → commit.

### Task 2: script do aviso e tarefa agendada
**Files:** Create `scripts/lembrete-revisoes.ps1`, `lib/study/reminder-task.ts`; Modify route (`reminder` GET/PUT/POST teste), `components/study/StudyApp.tsx` (seção em Configurações), `lib/study/locale.ts`; Test `tests/study/reminder-task.test.ts`.
**Produces:** `reminderTaskScript(opts: { hora: string; script: string; arquivo: string; abrir: string }): string` (PowerShell de registro); `reminderStatus(run)`, `enableReminder(...)`, `disableReminder(run)`, `testReminder(...)` com `run` injetável.
- [ ] Testes (hora inválida recusada; script de registro com horário e caminhos entre aspas simples escapadas; desligar remove a tarefa; status lê a tarefa) → implementar → passar.
- [ ] Testar o script de verdade com um arquivo-resumo temporário (aviso aparece; arquivo ausente não avisa) e conferir a tela na demo; commit.
