// Resumo para o aviso do Windows de revisões vencidas (scripts/lembrete-revisoes.ps1).
// Só datas de vencimento: nada de nomes ou textos de estudo (o aviso aparece na tela de bloqueio).
import fs from 'node:fs';
import path from 'node:path';
import type { Workspace } from './domain';
import { exercisesOf } from './exercises/migrate';

export const REMINDER_FILE = 'lembrete-revisoes.json';

export function reminderSummaryPath(root: string): string {
  return path.join(root, REMINDER_FILE);
}

/** Um vencimento por conceito com exercício e já praticado (os nunca praticados têm due 0). */
export function reviewDueDates(state: Workspace): number[] {
  return state.concepts
    .filter((c) => c.attempts.length > 0 && c.due > 0 && exercisesOf(c).length > 0)
    .map((c) => c.due)
    .sort((a, b) => a - b);
}

/** Grava o resumo de forma atômica (arquivo temporário + rename). */
export function writeReviewSummary(root: string, state: Workspace, now = Date.now()): void {
  const target = reminderSummaryPath(root);
  const tmp = `${target}.${process.pid}.tmp`;
  const body = JSON.stringify({ versao: 1, atualizado: now, vencimentos: reviewDueDates(state) });
  try {
    fs.writeFileSync(tmp, body);
    fs.renameSync(tmp, target);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}
