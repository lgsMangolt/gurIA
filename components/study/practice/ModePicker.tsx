'use client';
import { useMemo, useState } from 'react';
import type { StudyMode, Workspace } from '@/lib/study/domain';
import { exercisesOf } from '@/lib/study/exercises/migrate';
import { MODE_LABELS, practiceCopy } from '@/lib/study/ui/copy';

const MODES: StudyMode[] = ['rapido', 'aprofundar', 'prova', 'revisao'];

export function ModePicker({
  state,
  initialMode,
  initialConceptIds,
  busy,
  error,
  onStart,
}: {
  state: Workspace;
  initialMode?: StudyMode;
  initialConceptIds?: string[];
  busy: boolean;
  error: string;
  onStart: (mode: StudyMode, conceptIds: string[]) => void;
}) {
  const [mode, setMode] = useState<StudyMode>(initialMode ?? 'rapido');
  const [chosen, setChosen] = useState<string[]>(initialConceptIds ?? []);
  const [search, setSearch] = useState('');
  const withExercises = useMemo(
    () => state.concepts.filter((c) => exercisesOf(c).length > 0),
    [state.concepts],
  );
  const shown = withExercises.filter((c) =>
    c.label.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const toggle = (id: string) =>
    setChosen((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const provaInvalid = mode === 'prova' && (chosen.length < 1 || chosen.length > 10);
  return (
    <section className="study-card guria-practice-picker">
      <h2>{practiceCopy.chooseMode}</h2>
      <div className="guria-practice-modes" role="radiogroup" aria-label="Modo de estudo">
        {MODES.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            className={`guria-practice-mode ${mode === m ? 'selected' : ''}`}
            onClick={() => setMode(m)}
          >
            <strong>{MODE_LABELS[m].title}</strong>
            <span>{MODE_LABELS[m].blurb}</span>
          </button>
        ))}
      </div>
      <details open={mode === 'prova' || (initialConceptIds?.length ?? 0) > 0}>
        <summary>{practiceCopy.chooseConcepts}</summary>
        {withExercises.length === 0 ? (
          <p className="study-muted">Nenhum conceito tem exercícios ainda.</p>
        ) : (
          <>
            <input
              type="search"
              aria-label="Buscar conceito"
              placeholder="Buscar conceito"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <ul className="guria-practice-concepts">
              {shown.map((c) => (
                <li key={c.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={chosen.includes(c.id)}
                      onChange={() => toggle(c.id)}
                    />
                    {c.label}
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}
      </details>
      {provaInvalid && <p className="study-muted">Escolha de 1 a 10 conceitos para a Prova.</p>}
      {error && (
        <p role="alert" className="guria-practice-error">
          {error}
        </p>
      )}
      <button
        className="study-btn primary"
        disabled={busy || provaInvalid}
        onClick={() => onStart(mode, chosen)}
      >
        {practiceCopy.start}
      </button>
    </section>
  );
}
