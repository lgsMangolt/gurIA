// Estimativa do que vai ser enviado à IA antes de processar aulas (nada é enviado aqui).
import { PART_CHARS } from './lesson-text';

export function estimateLessons(
  items: Array<{ chars: number; needsTranscription: boolean; durationSeconds?: number }>,
): { envios: number; caracteres: number; transcricaoMinutos: number } {
  return items.reduce(
    (sum, item) => ({
      envios: sum.envios + Math.max(1, Math.ceil(item.chars / PART_CHARS)),
      caracteres: sum.caracteres + item.chars,
      transcricaoMinutos:
        sum.transcricaoMinutos +
        (item.needsTranscription ? Math.ceil((item.durationSeconds ?? 0) / 60) : 0),
    }),
    { envios: 0, caracteres: 0, transcricaoMinutos: 0 },
  );
}
