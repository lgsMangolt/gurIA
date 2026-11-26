// Usado pela tela durante "Processar o resto": cada aula concluída (ou com erro)
// muda a revisão dos estudos no servidor, então a tela precisa recarregá-los.
type Progress = { done: string[]; errors: Array<{ lessonId: string }> } | null | undefined;

export function queueAdvanced(previous: Progress, next: Progress): boolean {
  if (!previous || !next) return false;
  return next.done.length > previous.done.length || next.errors.length > previous.errors.length;
}
