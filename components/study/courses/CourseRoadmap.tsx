'use client';
// Roteiro de um curso importado: aulas em ordem, estado de cada uma e edição
// (renomear, mover, juntar, remover). Processar e revisar entram nas próximas etapas.
import { useState } from 'react';
import { ptCourse as t } from '@/lib/study/locale';
import type { Course, Workspace } from '@/lib/study/domain';
import { api } from '../shared';

type Snapshot = { data: Workspace; revision: number };
type Lesson = NonNullable<Course['lessons']>[number];

export function CourseRoadmap({
  course,
  revision,
  setSnapshot,
  notify,
  children,
  actions,
}: {
  course: Course;
  revision: number;
  setSnapshot: (s: Snapshot) => void;
  notify: (text: string) => void;
  children?: (lesson: Lesson) => React.ReactNode;
  actions?: React.ReactNode;
}) {
  const lessons = course.lessons ?? [];
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null),
    [busy, setBusy] = useState(false);
  const save = async (next: Lesson[]) => {
    setBusy(true);
    try {
      const out = await api(
        'course-roadmap',
        {
          revision,
          courseId: course.id,
          lessons: next.map((l) => ({ id: l.id, title: l.title, sourceIds: l.sourceIds ?? [] })),
        },
        'PUT',
      );
      setSnapshot({ data: out.data, revision: out.revision });
      setEditing(null);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const move = (i: number, by: number) => {
    const next = [...lessons];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    void save(next);
  };
  const join = (i: number) => {
    const [a, b] = [lessons[i], lessons[i + 1]];
    const merged = { ...a, sourceIds: [...(a.sourceIds ?? []), ...(b.sourceIds ?? [])] };
    void save([...lessons.slice(0, i), merged, ...lessons.slice(i + 2)]);
  };
  return (
    <article className="study-card guria-course-roadmap" aria-busy={busy}>
      <header className="study-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <h3>{course.title}</h3>
        <span className="study-muted">
          {t.origins[course.origin ?? ''] ?? course.origin} · {t.lessons(lessons.length)}
        </span>
      </header>
      {course.license && (
        <p className="study-muted" style={{ overflowWrap: 'anywhere' }}>
          {t.license}: {course.license} ({t.personalUse})
        </p>
      )}
      {actions}
      <ol className="guria-roadmap-list" style={{ paddingLeft: 20, marginTop: 12 }}>
        {lessons.map((l, i) => (
          <li key={l.id} style={{ marginBottom: 10 }}>
            <div className="study-row" style={{ flexWrap: 'wrap', gap: 8 }}>
              {editing?.id === l.id ? (
                <>
                  <input
                    className="study-input"
                    aria-label={t.rename}
                    value={editing.title}
                    onChange={(e) => setEditing({ id: l.id, title: e.target.value })}
                  />
                  <button
                    className="study-btn primary"
                    disabled={busy || !editing.title.trim()}
                    onClick={() =>
                      void save(
                        lessons.map((x) => (x.id === l.id ? { ...x, title: editing.title } : x)),
                      )
                    }
                  >
                    {t.save}
                  </button>
                  <button className="study-btn" onClick={() => setEditing(null)}>
                    {t.cancel}
                  </button>
                </>
              ) : (
                <strong style={{ overflowWrap: 'anywhere' }}>{l.title}</strong>
              )}
              <span className="study-pill">{t.status[l.status ?? 'importada']}</span>
              <span className="study-muted">{t.minutes(l.minutes, l.minutesEstimated)}</span>
            </div>
            <div className="study-row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
              {children?.(l)}
              <button
                className="study-btn"
                disabled={busy}
                onClick={() => setEditing({ id: l.id, title: l.title })}
              >
                {t.rename}
              </button>
              <button className="study-btn" disabled={busy || i === 0} onClick={() => move(i, -1)}>
                {t.up}
              </button>
              <button
                className="study-btn"
                disabled={busy || i === lessons.length - 1}
                onClick={() => move(i, 1)}
              >
                {t.down}
              </button>
              <button
                className="study-btn"
                disabled={busy || i === lessons.length - 1}
                onClick={() => join(i)}
              >
                {t.join}
              </button>
              <button
                className="study-btn"
                disabled={busy || lessons.length === 1}
                onClick={() => {
                  if (window.confirm(t.removeConfirm))
                    void save(lessons.filter((x) => x.id !== l.id));
                }}
              >
                {t.remove}
              </button>
            </div>
          </li>
        ))}
      </ol>
    </article>
  );
}
