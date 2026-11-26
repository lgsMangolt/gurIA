import type { Manifest } from './content';
import type { SkillConceptSnapshot } from './content';
import { conceptHash } from './content';

export type DiffRow = { type: 'same' | 'add' | 'del'; text: string };

export function diffLines(a: string, b: string): DiffRow[] {
  const x = a === '' ? [] : a.split('\n');
  const y = b === '' ? [] : b.split('\n');
  if (x.length * y.length > 4_000_000)
    return [
      ...x.map((text) => ({ type: 'del' as const, text })),
      ...y.map((text) => ({ type: 'add' as const, text })),
    ];
  const lcs: number[][] = Array.from({ length: x.length + 1 }, () =>
    new Array(y.length + 1).fill(0),
  );
  for (let i = x.length - 1; i >= 0; i--)
    for (let j = y.length - 1; j >= 0; j--)
      lcs[i][j] = x[i] === y[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) {
      rows.push({ type: 'same', text: x[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) rows.push({ type: 'del', text: x[i++] });
    else rows.push({ type: 'add', text: y[j++] });
  }
  while (i < x.length) rows.push({ type: 'del', text: x[i++] });
  while (j < y.length) rows.push({ type: 'add', text: y[j++] });
  return rows;
}

export function summarizeDiff(rows: DiffRow[]): { added: number; removed: number } {
  return {
    added: rows.filter((r) => r.type === 'add').length,
    removed: rows.filter((r) => r.type === 'del').length,
  };
}

export function diffConcepts(previous: Manifest['concepts'], snaps: SkillConceptSnapshot[]) {
  const before = new Map(previous.map((c) => [c.id, c.hash]));
  const now = new Map(snaps.map((s) => [s.id, conceptHash(s)]));
  return {
    added: [...now.keys()].filter((id) => !before.has(id)),
    removed: [...before.keys()].filter((id) => !now.has(id)),
    changed: [...now.keys()].filter((id) => before.has(id) && before.get(id) !== now.get(id)),
  };
}
