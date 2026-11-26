'use client';
import { useCallback, useEffect, useState } from 'react';
import type { Workspace } from '@/lib/study/domain';
import { exercisesOf } from '@/lib/study/exercises/migrate';
import { practiceCopy } from '@/lib/study/ui/copy';
import { friendlyError } from '@/lib/study/ui/errors';
import { describePending, pendingActions } from '@/lib/study/ui/pending';
import {
  discardItem,
  gradeBatch,
  pendingList,
  regradeItem,
  type BatchResult,
  type PendingResponse,
} from './practice-api';

const errorOf = (e: unknown) => {
  const err = e as Error & { code?: string };
  return friendlyError(err.code, err.message);
};

export function PendingList({
  state,
  ready,
  refresh,
  reloadKey,
}: {
  state: Workspace;
  ready: boolean;
  refresh: () => void;
  reloadKey: string;
}) {
  const [data, setData] = useState<PendingResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [confirmBatch, setConfirmBatch] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await pendingList());
    } catch (e) {
      setError(errorOf(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const run = async (action: () => Promise<unknown>, done?: (r: any) => string) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await action();
      if (done) setMessage(done(result));
      refresh();
      await load();
    } catch (e) {
      setError(errorOf(e));
    } finally {
      setBusy(false);
      setConfirmBatch(false);
      setConfirmDiscard('');
    }
  };

  if (!data)
    return error ? (
      <p role="alert" className="guria-practice-error">
        {error}
      </p>
    ) : null;
  const view = describePending(data.items, data.estimate);
  const label = (id: string) => {
    const item = data.items.find((i) => i.id === id)!;
    const concept = state.concepts.find((c) => c.id === item.conceptId);
    const exercise = concept && exercisesOf(concept).find((e) => e.id === item.exerciseId);
    return `${concept?.label ?? 'Conceito removido'}${exercise ? ' · ' + exercise.prompt : ''}`;
  };
  return (
    <section className="study-card guria-practice-pending" aria-label={practiceCopy.pendingTitle}>
      <h2>{practiceCopy.pendingTitle}</h2>
      <p>{view.title}</p>
      {view.rows.length > 0 && (
        <ul className="guria-practice-pending-list">
          {view.rows.map((row, i) => {
            const item = data.items[i];
            const actions = pendingActions(item);
            return (
              <li key={row.id}>
                <div>
                  <strong>{label(row.id)}</strong>
                  <div className="study-muted">
                    {row.stateLabel}
                    {row.detail ? ` · ${row.detail}` : ''}
                  </div>
                </div>
                <div className="study-row">
                  {actions.includes('regrade') && (
                    <button
                      className="study-btn"
                      disabled={busy || !ready}
                      onClick={() =>
                        void run(
                          () => regradeItem(row.id),
                          (r) =>
                            r.state === 'corrigida'
                              ? 'Resposta corrigida.'
                              : `Ainda pendente. ${friendlyError(r.error?.code, '')}`.trim(),
                        )
                      }
                    >
                      {practiceCopy.regrade}
                    </button>
                  )}
                  {actions.includes('discard') &&
                    (confirmDiscard === row.id ? (
                      <>
                        <button
                          className="study-btn primary"
                          disabled={busy}
                          onClick={() =>
                            void run(
                              () => discardItem(row.id),
                              () => 'Resposta descartada.',
                            )
                          }
                        >
                          Confirmar descarte
                        </button>
                        <button className="study-btn" onClick={() => setConfirmDiscard('')}>
                          {practiceCopy.cancel}
                        </button>
                      </>
                    ) : (
                      <button
                        className="study-btn"
                        disabled={busy}
                        onClick={() => setConfirmDiscard(row.id)}
                      >
                        {practiceCopy.discard}
                      </button>
                    ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {data.estimate.total > 0 && (
        <div>
          <p>{view.notice}</p>
          {!confirmBatch ? (
            <button
              className="study-btn primary"
              disabled={busy || !ready}
              onClick={() => setConfirmBatch(true)}
            >
              {practiceCopy.gradePending}
            </button>
          ) : (
            <div className="study-row">
              <button
                className="study-btn primary"
                disabled={busy}
                onClick={() =>
                  void run(
                    // Só os itens que o aviso de custo mostrou: nada além deles é enviado.
                    () =>
                      gradeBatch(
                        data.items
                          .filter((i) => pendingActions(i).includes('regrade'))
                          .map((i) => i.id),
                      ),
                    (r: BatchResult) =>
                      `${r.graded} corrigidas, ${r.pending} ainda pendentes${
                        r.stoppedBy ? `. ${friendlyError(r.stoppedBy, 'A correção parou.')}` : '.'
                      }`,
                  )
                }
              >
                {practiceCopy.confirmSend}
              </button>
              <button className="study-btn" onClick={() => setConfirmBatch(false)}>
                {practiceCopy.cancel}
              </button>
            </div>
          )}
        </div>
      )}
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="guria-practice-error">
          {error}
        </p>
      )}
    </section>
  );
}
