'use client';
import { useRef, useState } from 'react';
import type { Course, Workspace } from '@/lib/study/domain';
import { courseProgress } from '@/lib/study/domain';
import { AdaptivePlan } from './AdaptivePlan';
import { pt } from '@/lib/study/locale';
import { api, Dialog, Field } from './shared';
import { StudySkeleton } from './StudySkeleton';
export function CoursesPlan({
  state,
  revision,
  setSnapshot,
  commit,
  notify,
  openCourse,
  openPractice,
  planOnly = false,
  harness = 'codex',
}: {
  state: Workspace;
  revision: number;
  setSnapshot: (snapshot: { data: Workspace; revision: number }) => void;
  commit: (data: Workspace) => Promise<void>;
  notify: (text: string) => void;
  openCourse: (id: string) => void;
  openPractice: (stageId: string, title: string) => void;
  planOnly?: boolean;
  harness?: string;
}) {
  const [editing, setEditing] = useState<Course | null>(null),
    [busy, setBusy] = useState(false),
    [lessonError, setLessonError] = useState('');
  const [openingCourse, setOpeningCourse] = useState('');
  const opening = useRef(false);

  const beginEditing = (course: Course) => {
    setLessonError('');
    setEditing(course);
  };
  const save = async () => {
    if (!editing || lessonError) return;
    setBusy(true);
    try {
      if (editing.id) {
        await commit({
          ...state,
          courses: state.courses.map((c) => (c.id === editing.id ? editing : c)),
        });
      } else setSnapshot(await api('courses', { revision, course: editing }));
      setEditing(null);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {openingCourse && <StudySkeleton label="Carregando revisão e prática…" />}
      {!planOnly && (
        <>
          <div className="study-row guria-section-header">
            <p className="study-muted">{pt.shared}</p>
            <button
              className="study-btn primary"
              onClick={() =>
                beginEditing({
                  id: '',
                  title: '',
                  url: '',
                  minutes: null,
                  practiceMinutes: 0,
                  reviewMinutes: 0,
                  completedMinutes: 0,
                  deadline: null,
                  hoursSource: 'unknown',
                  sourceNote: '',
                })
              }
            >
              {pt.addCourse}
            </button>
          </div>
          <div className="study-grid guria-course-grid">
            {state.courses.map((c) => (
              <article className="study-card" key={c.id}>
                <span className="study-pill">{pt.sources[c.hoursSource]}</span>
                <h2 style={{ marginTop: 14 }}>{c.title}</h2>
                <p className="study-muted">
                  {c.minutes === null
                    ? pt.unknown
                    : `${(courseProgress(state, c) / 60).toFixed(1)} / ${((c.minutes + c.practiceMinutes + c.reviewMinutes) / 60).toFixed(1)} h`}
                </p>
                <p className="study-muted">{c.deadline || '—'}</p>
                <div className="study-row" style={{ marginTop: 15 }}>
                  <button className="study-btn" onClick={() => openCourse(c.id)}>
                    {pt.courseMap}
                  </button>
                  <button
                    className="study-btn"
                    onClick={() => {
                      setLessonError('');
                      setEditing(c);
                    }}
                  >
                    {pt.edit}
                  </button>
                  <button
                    className="study-btn"
                    disabled={!!openingCourse}
                    aria-busy={openingCourse === c.id}
                    onClick={async () => {
                      if (opening.current) return;
                      opening.current = true;
                      setOpeningCourse(c.id);
                      try {
                        if (c.stageId) {
                          const response = await fetch('/api/stages', { cache: 'no-store' });
                          if (!response.ok) throw new Error('Não foi possível verificar a prática existente.');
                          const index = await response.json();
                          if (!Array.isArray(index.stages)) throw new Error('Não foi possível verificar a prática existente.');
                          const existing = index.stages.find((stage: { id: string }) => stage.id === c.stageId);
                          if (existing && typeof existing.sceneCount === 'number' && existing.sceneCount > 0) {
                            openPractice(c.stageId, c.title);
                            return;
                          }
                        }
                        const data = await api<{ stageId: string }>('classroom', {
                          courseId: c.id,
                        });
                        openPractice(data.stageId, c.title);
                      } catch (e) {
                        notify((e as Error).message);
                      } finally {
                        opening.current = false;
                        setOpeningCourse('');
                      }
                    }}
                  >
                    {openingCourse === c.id ? 'Carregando…' : pt.createClass}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
      {planOnly && <AdaptivePlan state={state} commit={commit} notify={notify} />}
      {editing && (
        <Dialog
          title={editing.id ? pt.edit : pt.addCourse}
          close={() => {
            setEditing(null);
            setLessonError('');
          }}
          busy={busy}
        >
          <p className="study-muted">{pt.courseHelp}</p>
          <button
            className="study-btn"
            style={{ marginBottom: 15 }}
            disabled={busy || !editing.url}
            onClick={async () => {
              setBusy(true);
              try {
                const result = await api('course-source', { url: editing.url, harness });
                setEditing({
                  ...editing,
                  title: result.title || editing.title,
                  minutes: result.minutes,
                  hoursSource: result.minutes === null ? 'unknown' : 'estimate',
                  sourceNote: `Conferir fonte: ${result.url}\nConsulta: ${result.checkedAt}\n${result.evidence}\nTópicos: ${result.topics.join(', ')}`,
                });
              } catch (e) {
                notify((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Ler link com a IA selecionada · revisar antes de salvar
          </button>
          <div className="study-grid">
            <Field title={pt.courseTitle}>
              <input
                className="study-input"
                value={editing.title}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              />
            </Field>
            <Field title={pt.url}>
              <input
                className="study-input"
                value={editing.url}
                onChange={(e) => setEditing({ ...editing, url: e.target.value })}
              />
            </Field>
            {(['minutes', 'practiceMinutes', 'reviewMinutes', 'completedMinutes'] as const).map(
              (key, i) => (
                <Field key={key} title={[pt.hours, pt.practice, pt.reviews, pt.completed][i]}>
                  <input
                    className="study-input"
                    type="number"
                    disabled={key === 'minutes' && !!editing.lessons?.length}
                    min="0"
                    step="0.25"
                    value={editing[key] === null ? '' : editing[key]! / 60}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        [key]:
                          key === 'minutes' && e.target.value === ''
                            ? null
                            : Number(e.target.value) * 60,
                      })
                    }
                  />
                </Field>
              ),
            )}
            <Field title={pt.deadline}>
              <input
                className="study-input"
                type="date"
                value={editing.deadline || ''}
                onChange={(e) => setEditing({ ...editing, deadline: e.target.value || null })}
              />
            </Field>
            <Field title={pt.source}>
              <select
                className="study-input"
                value={editing.hoursSource}
                onChange={(e) =>
                  setEditing({ ...editing, hoursSource: e.target.value as Course['hoursSource'] })
                }
              >
                {Object.entries(pt.sources).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field title="Aulas conhecidas (uma por linha: título | minutos)">
            <textarea
              className="study-input"
              rows={5}
              defaultValue={(editing.lessons || [])
                .map((l) => `${l.title} | ${l.minutes}`)
                .join('\n')}
              disabled={state.sessions.some(
                (s) => s.courseId === editing.id && s.kind === 'lesson',
              )}
              onChange={(e) => {
                const lines = e.target.value.split('\n').filter((l) => l.trim());
                const parsed = lines.map((line, i) => {
                  const split = line.lastIndexOf('|');
                  return {
                    id: editing.lessons?.[i]?.id || crypto.randomUUID(),
                    title: split < 1 ? '' : line.slice(0, split).trim(),
                    minutes: Number(line.slice(split + 1).trim()),
                  };
                });
                if (parsed.some((l) => !l.title || !Number.isFinite(l.minutes) || l.minutes <= 0)) {
                  setLessonError(
                    'Use o formato: Nome da aula | 30. Corrija a lista antes de salvar.',
                  );
                  return;
                }
                setLessonError('');
                setEditing({
                  ...editing,
                  lessons: parsed,
                  ...(parsed.length
                    ? {
                        minutes: parsed.reduce((sum, l) => sum + l.minutes, 0),
                        hoursSource: 'measured' as const,
                      }
                    : {}),
                });
              }}
            />
          </Field>
          {lessonError && <p className="study-alert">{lessonError}</p>}
          <p className="study-muted">
            A soma substitui as horas de aulas. Após registrar sessões, a estrutura das aulas fica
            preservada; desfaça os registros para alterá-la. Horas já estudadas são o progresso
            anterior ao uso do plano, sem incluir sessões registradas aqui.
          </p>
          <Field title={pt.sourceNote}>
            <textarea
              className="study-input"
              value={editing.sourceNote}
              onChange={(e) => setEditing({ ...editing, sourceNote: e.target.value })}
            />
          </Field>
          <footer>
            <button
              className="study-btn primary"
              disabled={busy || !!lessonError || !editing.title.trim()}
              onClick={() => void save()}
            >
              {pt.save}
            </button>
          </footer>
        </Dialog>
      )}
    </>
  );
}
