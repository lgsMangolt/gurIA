'use client';
// Ações de uma aula importada: processar (com estimativa antes) e revisar o resultado.
import { useEffect, useRef, useState } from 'react';
import { queueAdvanced } from '@/lib/study/courses/queue-progress';
import { lessonPracticeTarget } from '@/lib/study/ui/navigation';
import { ptLesson as t } from '@/lib/study/locale';
import type { Course, Workspace } from '@/lib/study/domain';
import { api, Dialog } from '../shared';

type Snapshot = { data: Workspace; revision: number };
type Lesson = NonNullable<Course['lessons']>[number];
type Estimate = {
  envios: number;
  caracteres: number;
  transcricaoMinutos: number;
  harness: string;
  model: string;
};

const PROCESSABLE = [
  'importada',
  'precisa-transcrever',
  'falhou',
  'aguardando-revisao',
  'processada',
];

export function LessonActions({
  openLessonPractice,
  course,
  lesson,
  revision,
  setSnapshot,
  notify,
}: {
  openLessonPractice: (lessonId: string) => void;
  course: Course;
  lesson: Lesson;
  revision: number;
  setSnapshot: (s: Snapshot) => void;
  notify: (text: string) => void;
}) {
  const [estimate, setEstimate] = useState<Estimate | null>(null),
    [busy, setBusy] = useState(false),
    [reviewing, setReviewing] = useState(false);
  const status = lesson.status ?? 'importada';
  const reload = async () => setSnapshot(await api('workspace'));
  const ask = async () => {
    try {
      setEstimate(
        await api('course-lesson-estimate', { courseId: course.id, lessonIds: [lesson.id] }),
      );
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const run = async () => {
    setBusy(true);
    try {
      const out = await api('course-lesson-process', {
        courseId: course.id,
        lessonId: lesson.id,
        harness: estimate?.harness,
      });
      setSnapshot(out);
      setEstimate(null);
      setReviewing(true);
    } catch (e) {
      notify((e as Error).message);
      setEstimate(null);
      await reload().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {PROCESSABLE.includes(status) && status !== 'aguardando-revisao' && (
        <button className="study-btn primary" disabled={busy} onClick={() => void ask()}>
          {status === 'processada' ? t.reprocess : t.process}
        </button>
      )}
      {status === 'processada' && (
        <button className="study-btn" onClick={() => openLessonPractice(lesson.id)}>
          {t.practiceThisLesson}
        </button>
      )}
      {status === 'aguardando-revisao' && (
        <button className="study-btn primary" onClick={() => setReviewing(true)}>
          {t.review}
        </button>
      )}
      {estimate && (
        <Dialog title={t.confirmTitle} close={() => setEstimate(null)} busy={busy}>
          <p>{t.estimate(estimate)}</p>
          <p className="study-muted">{t.estimateHelp}</p>
          <div className="study-row" style={{ marginTop: 16 }}>
            <button className="study-btn primary" disabled={busy} onClick={() => void run()}>
              {busy ? t.processing : t.confirm}
            </button>
            <button className="study-btn" disabled={busy} onClick={() => setEstimate(null)}>
              {t.cancel}
            </button>
          </div>
        </Dialog>
      )}
      {reviewing && (
        <LessonReview
          openLessonPractice={openLessonPractice}
          course={course}
          lesson={lesson}
          revision={revision}
          close={() => setReviewing(false)}
          setSnapshot={setSnapshot}
          notify={notify}
        />
      )}
    </>
  );
}

type Result = {
  summary: string;
  concepts: Array<{
    id: string;
    label: string;
    summary: string;
    originalTerms: string[];
    evidence: string;
    exercises: Array<{ type: string; prompt: string }>;
  }>;
};

export function LessonReview({
  openLessonPractice,
  course,
  lesson,
  revision,
  close,
  setSnapshot,
  notify,
}: {
  openLessonPractice: (lessonId: string) => void;
  course: Course;
  lesson: Lesson;
  revision: number;
  close: () => void;
  setSnapshot: (s: Snapshot) => void;
  notify: (text: string) => void;
}) {
  const [offer, setOffer] = useState<{ count: number; minutes: number } | null>(null);
  const [result, setResult] = useState<Result | null>(null),
    [chosen, setChosen] = useState<Record<string, { on: boolean; label: string; summary: string }>>(
      {},
    ),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api(
      `course-lesson-result?courseId=${encodeURIComponent(course.id)}&lessonId=${encodeURIComponent(lesson.id)}`,
    )
      .then((r: Result) => {
        setResult(r);
        setChosen(
          Object.fromEntries(
            r.concepts.map((c) => [c.id, { on: true, label: c.label, summary: c.summary }]),
          ),
        );
      })
      .catch((e) => notify((e as Error).message));
    // notify fica de fora: recarregar o resultado apagaria as edições do dono.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course.id, lesson.id]);
  const approve = async () => {
    setBusy(true);
    try {
      const ids = Object.entries(chosen)
        .filter(([, v]) => v.on)
        .map(([id]) => id);
      const out = await api('course-lesson-approve', {
        revision,
        courseId: course.id,
        lessonId: lesson.id,
        approvedIds: ids,
        edits: ids.map((id) => ({ id, label: chosen[id].label, summary: chosen[id].summary })),
      });
      setSnapshot(out);
      notify(t.approved(ids.length));
      // Momento de maior interesse: oferece praticar já, se a aula tem exercícios.
      const target = lessonPracticeTarget(out.data.concepts, lesson.id);
      if (target) setOffer({ count: target.conceptIds.length, minutes: target.minutes });
      else close();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (offer)
    return (
      <Dialog title={t.practiceTitle} close={close}>
        <p>{t.practiceOffer(offer.count, offer.minutes)}</p>
        <p className="study-muted">{t.practiceOfferHelp}</p>
        <div className="study-row" style={{ marginTop: 16 }}>
          <button
            className="study-btn primary"
            onClick={() => {
              close();
              openLessonPractice(lesson.id);
            }}
          >
            {t.practiceNow}
          </button>
          <button className="study-btn" onClick={close}>
            {t.practiceLater}
          </button>
        </div>
      </Dialog>
    );
  return (
    <Dialog title={t.reviewTitle(lesson.title)} close={close} busy={busy}>
      {!result ? (
        <p className="study-muted">{t.loading}</p>
      ) : (
        <>
          <h3>{t.summary}</h3>
          <p style={{ whiteSpace: 'pre-wrap' }}>{result.summary}</p>
          <h3 style={{ marginTop: 16 }}>{t.concepts}</h3>
          {!result.concepts.length && <p className="study-muted">{t.noConcepts}</p>}
          <div className="study-list">
            {result.concepts.map((c) => (
              <div key={c.id} className="study-card" style={{ padding: 12 }}>
                <label className="study-check">
                  <input
                    type="checkbox"
                    checked={chosen[c.id]?.on ?? false}
                    onChange={(e) =>
                      setChosen({ ...chosen, [c.id]: { ...chosen[c.id], on: e.target.checked } })
                    }
                  />
                  {t.keep}
                </label>
                <input
                  className="study-input"
                  aria-label={t.label}
                  value={chosen[c.id]?.label ?? ''}
                  onChange={(e) =>
                    setChosen({ ...chosen, [c.id]: { ...chosen[c.id], label: e.target.value } })
                  }
                />
                <textarea
                  className="study-input"
                  aria-label={t.conceptSummary}
                  rows={3}
                  value={chosen[c.id]?.summary ?? ''}
                  onChange={(e) =>
                    setChosen({ ...chosen, [c.id]: { ...chosen[c.id], summary: e.target.value } })
                  }
                />
                {!!c.originalTerms.length && (
                  <p className="study-muted">
                    {t.terms}: {c.originalTerms.join(', ')}
                  </p>
                )}
                <p className="study-muted">
                  {t.evidence}: {c.evidence}
                </p>
                <p className="study-muted">{t.exercises(c.exercises.map((x) => x.type))}</p>
              </div>
            ))}
          </div>
          <p className="study-muted" style={{ marginTop: 12 }}>
            {t.noMastery}
          </p>
          <div className="study-row" style={{ marginTop: 12 }}>
            <button className="study-btn primary" disabled={busy} onClick={() => void approve()}>
              {t.approve}
            </button>
            <button className="study-btn" disabled={busy} onClick={close}>
              {t.later}
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}

const PENDING = ['importada', 'precisa-transcrever', 'falhou'];
type Queue = {
  lessonIds: string[];
  done: string[];
  errors: Array<{ lessonId: string; message: string }>;
  failed?: { lessonId: string; message: string };
  running: boolean;
};

/** "Processar o resto": estimativa, confirmação e progresso da fila no servidor. */
export function ProcessRest({
  course,
  setSnapshot,
  notify,
}: {
  course: Course;
  setSnapshot: (s: Snapshot) => void;
  notify: (text: string) => void;
}) {
  const pending = (course.lessons ?? []).filter((l) => PENDING.includes(l.status ?? 'importada'));
  const [estimate, setEstimate] = useState<Estimate | null>(null),
    [queue, setQueue] = useState<Queue | null>(null),
    [starting, setStarting] = useState(false);
  const last = useRef<Queue | null>(null);
  useEffect(() => {
    if (!queue?.running) return;
    const timer = setInterval(async () => {
      try {
        const q: Queue | null = await api(`course-queue?courseId=${encodeURIComponent(course.id)}`);
        const previous = last.current;
        last.current = q;
        setQueue(q);
        if (q && !q.running) {
          setSnapshot(await api('workspace'));
          notify(q.failed ? t.queueStopped(q.failed.message) : t.queueDone(q.done.length));
        } else if (queueAdvanced(previous, q)) {
          // Cada aula concluída muda a revisão no servidor: recarrega para as edições continuarem salvando.
          setSnapshot(await api('workspace'));
        }
      } catch (e) {
        notify((e as Error).message);
      }
    }, 3000);
    return () => clearInterval(timer);
    // notify e setSnapshot ficam de fora: trocar a função não deve reiniciar o acompanhamento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue?.running, course.id]);
  if (!pending.length && !queue?.running) return null;
  const ask = async () => {
    try {
      setEstimate(
        await api('course-lesson-estimate', {
          courseId: course.id,
          lessonIds: pending.map((l) => l.id),
        }),
      );
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const start = async () => {
    if (starting) return;
    setStarting(true);
    try {
      const out = await api('course-process-rest', { courseId: course.id, confirmed: true });
      last.current = out.queue;
      setQueue({ ...out.queue, running: true });
      setEstimate(null);
    } catch (e) {
      notify((e as Error).message);
      setEstimate(null);
    } finally {
      setStarting(false);
    }
  };
  return (
    <div className="study-row" style={{ flexWrap: 'wrap', gap: 8, margin: '8px 0' }}>
      {queue?.running ? (
        <span className="study-pill" role="status">
          {t.queueProgress(queue.done.length + queue.errors.length, queue.lessonIds.length)}
        </span>
      ) : (
        <button className="study-btn" onClick={() => void ask()}>
          {t.processRest(pending.length)}
        </button>
      )}
      {estimate && (
        <Dialog title={t.restTitle} close={() => setEstimate(null)}>
          <p>{t.estimate(estimate)}</p>
          <p className="study-muted">{t.restHelp}</p>
          <div className="study-row" style={{ marginTop: 16 }}>
            <button className="study-btn primary" disabled={starting} onClick={() => void start()}>
              {starting ? t.processing : t.confirm}
            </button>
            <button className="study-btn" disabled={starting} onClick={() => setEstimate(null)}>
              {t.cancel}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
