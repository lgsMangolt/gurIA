import { CONFIDENCE_LEVELS } from './copy';

export function confidenceValue(id: string): number | undefined {
  return CONFIDENCE_LEVELS.find((level) => level.id === id)?.value;
}
