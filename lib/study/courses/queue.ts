// "Processar o resto": uma aula por vez, na ordem do roteiro. Para na primeira falha
// de cota, login, modelo ou disponibilidade (os mesmos códigos da correção em lote);
// erro de uma aula só (sem texto, resposta ruim) fica registrado e a fila segue.
import { STOP_CODES } from '../exercises/submission-service';
import { AppError } from '../runtime/analysis';

export type QueueState = {
  lessonIds: string[];
  done: string[];
  errors: Array<{ lessonId: string; message: string }>;
  failed?: { lessonId: string; message: string };
  running: boolean;
  startedAt: number;
};

export async function processQueue(
  courseId: string,
  lessonIds: string[],
  processOne: (lessonId: string) => Promise<void>,
  save: (q: QueueState) => void,
): Promise<QueueState> {
  const q: QueueState = { lessonIds, done: [], errors: [], running: true, startedAt: Date.now() };
  save(q);
  for (const lessonId of lessonIds) {
    try {
      await processOne(lessonId);
      q.done.push(lessonId);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Falha ao processar a aula.';
      if (e instanceof AppError && STOP_CODES.includes(e.code)) {
        q.failed = { lessonId, message };
        break;
      }
      q.errors.push({ lessonId, message });
    }
    save(q);
  }
  q.running = false;
  save(q);
  return q;
}

/** Filas em andamento neste processo do servidor (uma por curso). */
const running: Set<string> = ((globalThis as any)[Symbol.for('guria.courses.queues')] ??=
  new Set());
export function queueRunning(courseId: string): boolean {
  return running.has(courseId);
}
export function markQueue(courseId: string, on: boolean) {
  if (on) running.add(courseId);
  else running.delete(courseId);
}
