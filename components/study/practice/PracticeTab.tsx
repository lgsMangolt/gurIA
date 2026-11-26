'use client';
import { useEffect, useState } from 'react';
import type { StudyMode, Workspace } from '@/lib/study/domain';
import type { StudySession } from '@/lib/study/sessions/session-schema';
import { friendlyError } from '@/lib/study/ui/errors';
import { clockSkew } from '@/lib/study/ui/timer';
import { ModePicker } from './ModePicker';
import { PendingList } from './PendingList';
import { SessionRunner } from './SessionRunner';
import { activeSession, startSession } from './practice-api';

type Active = { session: StudySession; skew: number };

export function PracticeTab({
  state,
  refresh,
  initialMode,
  initialConceptIds,
  ready,
}: {
  state: Workspace;
  refresh: () => void;
  initialMode?: StudyMode;
  /** Conceitos já marcados no seletor (vindos do botão Revisar). Não inicia a sessão. */
  initialConceptIds?: string[];
  ready: boolean;
}) {
  const [active, setActive] = useState<Active | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    activeSession()
      .then(({ session, now }) => {
        if (cancelled) return;
        if (session) setActive({ session, skew: clockSkew(now, Date.now()) });
        setLoaded(true);
      })
      .catch((e: Error & { code?: string }) => {
        if (cancelled) return;
        setError(friendlyError(e.code, e.message));
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const start = async (mode: StudyMode, conceptIds: string[]) => {
    setBusy(true);
    setError('');
    try {
      const { session, now } = await startSession({
        id: crypto.randomUUID(),
        mode,
        ...(conceptIds.length ? { conceptIds } : {}),
      });
      setActive({ session, skew: clockSkew(now, Date.now()) });
      refresh();
    } catch (e) {
      const err = e as Error & { code?: string };
      setError(friendlyError(err.code, err.message));
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return <p className="study-muted">Carregando…</p>;
  return (
    <div className="guria-practice">
      {active ? (
        <SessionRunner
          key={active.session.id}
          session={active.session}
          skew={active.skew}
          state={state}
          ready={ready}
          refresh={refresh}
          onClose={() => setActive(null)}
        />
      ) : (
        <ModePicker
          state={state}
          initialMode={initialMode}
          initialConceptIds={initialConceptIds}
          busy={busy}
          error={error}
          onStart={(mode, ids) => void start(mode, ids)}
        />
      )}
      <PendingList
        state={state}
        ready={ready}
        refresh={refresh}
        reloadKey={[
          active ? 'running' : 'idle',
          ...state.submissions.map((s) => s.id + s.state + s.tries),
          ...state.studySessions.map((s) => s.id + s.state),
        ].join('|')}
      />
    </div>
  );
}
