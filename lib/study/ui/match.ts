export type MatchState = {
  rights: string[];
  selectedLeft?: string;
  matches: Record<string, string>;
};
export type MatchAction =
  | { type: 'left'; left: string }
  | { type: 'right'; right: string }
  | { type: 'clear' };

function seeded(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Embaralha os lados direitos de forma estável (mesmo item, mesma ordem depois de recarregar). */
export function initMatch(
  exercise: { id: string; pairs: { left: string; right: string }[] },
  sessionId: string,
): MatchState {
  const original = exercise.pairs.map((p) => p.right);
  const rights = [...original];
  const random = seeded(exercise.id + '|' + sessionId);
  for (let i = rights.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [rights[i], rights[j]] = [rights[j], rights[i]];
  }
  // Nunca devolve a ordem original: o par certo não pode ficar alinhado de graça.
  if (rights.length > 1 && rights.every((r, i) => r === original[i])) rights.push(rights.shift()!);
  return { rights, matches: {} };
}

export function matchReduce(state: MatchState, action: MatchAction): MatchState {
  if (action.type === 'clear') return { ...state, selectedLeft: undefined, matches: {} };
  if (action.type === 'left') {
    if (state.matches[action.left] !== undefined) {
      const { [action.left]: _removed, ...rest } = state.matches;
      return { ...state, selectedLeft: undefined, matches: rest };
    }
    return { ...state, selectedLeft: action.left };
  }
  if (state.selectedLeft === undefined) return state;
  const matches: Record<string, string> = {};
  for (const [left, right] of Object.entries(state.matches))
    if (right !== action.right) matches[left] = right;
  matches[state.selectedLeft] = action.right;
  return { ...state, selectedLeft: undefined, matches };
}

export const matchComplete = (state: MatchState, total: number): boolean =>
  Object.keys(state.matches).length === total;
