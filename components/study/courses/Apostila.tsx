'use client';
// Apostila do curso: lida na tela e exportada pelo "salvar como PDF" do navegador.
import { useEffect, useRef } from 'react';
import { buildApostila } from '@/lib/study/courses/apostila';
import { ptApostila as t, ptCourse } from '@/lib/study/locale';
import type { Workspace } from '@/lib/study/domain';
import styles from './apostila-print.module.css';

export function Apostila({
  state,
  courseId,
  close,
}: {
  state: Workspace;
  courseId: string;
  close: () => void;
}) {
  const a = buildApostila(state, courseId);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    document.body.classList.add('guria-apostila-aberta');
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('guria-apostila-aberta');
    };
  }, [close]);
  return (
    <div
      className={`${styles.overlay} guria-apostila`}
      role="dialog"
      aria-modal="true"
      aria-label={t.title(a.title)}
    >
      <div className={styles.toolbar}>
        <button className="study-btn primary" onClick={() => window.print()}>
          {t.print}
        </button>
        <button ref={closeRef} className="study-btn" onClick={close}>
          {t.close}
        </button>
      </div>
      <article className={styles.sheet}>
        <header className={styles.cover}>
          <p className="study-muted">{t.kicker}</p>
          <h1>{a.title}</h1>
          {a.origin && <p>{ptCourse.origins[a.origin] ?? a.origin}</p>}
          {a.license && (
            <p className="study-muted">
              {ptCourse.license}: {a.license} ({ptCourse.personalUse})
            </p>
          )}
        </header>
        <nav aria-label={t.toc}>
          <h2>{t.toc}</h2>
          <ol className={styles.toc}>
            {a.lessons.map((l) => (
              <li key={l.id} className={l.pending ? styles.pending : undefined}>
                {l.title}
                {l.pending && ` — ${t.pending}`}
              </li>
            ))}
          </ol>
        </nav>
        {a.lessons
          .filter((l) => !l.pending)
          .map((l, n) => (
            <section key={l.id} className={styles.lesson}>
              <h2>
                {n + 1}. {l.title}
              </h2>
              {l.summary && <p className={styles.note}>{l.summary}</p>}
              {l.concepts.map((c) => (
                <div key={c.label}>
                  <h3>{c.label}</h3>
                  <p>{c.summary}</p>
                  {c.note && <p className={styles.note}>{c.note}</p>}
                </div>
              ))}
              {!!l.exercises.length && (
                <>
                  <h3>{t.exercises}</h3>
                  <ol>
                    {l.exercises.map((ex) => (
                      <li key={ex.id}>
                        <p>{ex.prompt}</p>
                        {ex.type === 'escolha' && (
                          <ol type="a">
                            {ex.options.map((o) => (
                              <li key={o}>{o}</li>
                            ))}
                          </ol>
                        )}
                        {ex.type === 'ligar' && (
                          <p className="study-muted">
                            {ex.pairs.map((p) => p.left).join(' · ')} ⟷{' '}
                            {[...ex.pairs.map((p) => p.right)].sort().join(' · ')}
                          </p>
                        )}
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </section>
          ))}
        {!!a.answers.length && (
          <section className={styles.answers}>
            <h2>{t.answers}</h2>
            {a.answers.map((group) => (
              <div key={group.lessonTitle}>
                <h3>{group.lessonTitle}</h3>
                <ul>
                  {group.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        )}
      </article>
    </div>
  );
}
