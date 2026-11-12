'use client';
import { useEffect, useRef } from 'react';
import { pt } from '@/lib/study/locale';
import { StudySkeleton } from './StudySkeleton';
export async function api<T = any>(
  route: string,
  body?: unknown,
  method = body === undefined ? 'GET' : 'POST',
): Promise<T> {
  const response = await fetch('/api/study/' + route, {
    method,
    headers:
      body instanceof FormData
        ? undefined
        : body === undefined
          ? undefined
          : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || pt.error);
  return data;
}
export function Dialog({
  title,
  close,
  children,
  busy = false,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null),
    actions = useRef({ busy, close });
  actions.current = { busy, close };
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !actions.current.busy) actions.current.close();
      if (e.key === 'Tab') {
        const nodes = ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href]',
        );
        if (!nodes?.length) {
          e.preventDefault();
          return;
        }
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first || document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (
          !e.shiftKey &&
          (document.activeElement === last || document.activeElement === ref.current)
        ) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      before?.focus();
    };
  }, []);
  return (
    <div className="study-overlay">
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-busy={busy}
        className="study-dialog"
      >
        <header>
          <h2>{title}</h2>
          <button className="study-btn" aria-label={pt.close} disabled={busy} onClick={close}>
            ×
          </button>
        </header>
        {children}
        {busy && <StudySkeleton compact label="Processando, aguarde…" />}
      </div>
    </div>
  );
}
export function Field({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <label className="study-label">
      {title}
      {children}
    </label>
  );
}
