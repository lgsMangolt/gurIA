'use client';
import { useMemo } from 'react';
import type { DiffRow } from '@/lib/study/skills/diff';
import { diffRows } from '@/lib/study/ui/skills-view';

export function DiffView({ path, rows, open }: { path: string; rows: DiffRow[]; open?: boolean }) {
  const view = useMemo(() => diffRows(rows), [rows]);
  const added = rows.filter((r) => r.type === 'add').length;
  const removed = rows.filter((r) => r.type === 'del').length;
  return (
    <details className="guria-skills-diff" open={open}>
      <summary>
        <code>{path}</code> · +{added} −{removed}
      </summary>
      <pre aria-label={`Diferenças em ${path}`}>
        {view.map((row, i) =>
          row.kind === 'gap' ? (
            <div key={i} className="gap">
              … {row.hidden} linhas iguais
            </div>
          ) : (
            <div key={i} className={row.type}>
              {row.type === 'add' ? '+ ' : row.type === 'del' ? '− ' : '  '}
              {row.text}
            </div>
          ),
        )}
      </pre>
    </details>
  );
}
