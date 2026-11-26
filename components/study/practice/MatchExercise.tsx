'use client';
import { useEffect, useReducer } from 'react';
import type { Exercise } from '@/lib/study/exercises/schema';
import { initMatch, matchComplete, matchReduce } from '@/lib/study/ui/match';

export function MatchExercise({
  exercise,
  sessionId,
  onChange,
  disabled,
}: {
  exercise: Extract<Exercise, { type: 'ligar' }>;
  sessionId: string;
  onChange: (matches: Record<string, string>, complete: boolean) => void;
  disabled?: boolean;
}) {
  const [state, dispatch] = useReducer(matchReduce, undefined, () =>
    initMatch(exercise, sessionId),
  );
  useEffect(() => {
    onChange(state.matches, matchComplete(state, exercise.pairs.length));
    // onChange é estável o suficiente para esta tela; reagir só às ligações.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.matches]);
  const rightOwner = (right: string) =>
    Object.entries(state.matches).find(([, value]) => value === right)?.[0];
  return (
    <div className="guria-practice-match">
      <p className="study-muted">
        Escolha um item da esquerda e depois o item que combina na direita. Clique num item já
        ligado para desfazer.
      </p>
      <div className="guria-practice-match-grid">
        <ul aria-label="Itens">
          {exercise.pairs.map((pair) => (
            <li key={pair.left}>
              <button
                type="button"
                className={`study-btn ${state.selectedLeft === pair.left ? 'primary' : ''}`}
                aria-pressed={state.selectedLeft === pair.left}
                disabled={disabled}
                onClick={() => dispatch({ type: 'left', left: pair.left })}
              >
                {pair.left}
                {state.matches[pair.left] !== undefined && (
                  <span className="guria-practice-linked"> → {state.matches[pair.left]}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
        <ul aria-label="Correspondências">
          {state.rights.map((right) => (
            <li key={right}>
              <button
                type="button"
                className="study-btn"
                disabled={disabled || state.selectedLeft === undefined}
                onClick={() => dispatch({ type: 'right', right })}
              >
                {right}
                {rightOwner(right) !== undefined && (
                  <span className="guria-practice-linked"> ← {rightOwner(right)}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <button
        type="button"
        className="study-btn"
        disabled={disabled}
        onClick={() => dispatch({ type: 'clear' })}
      >
        Limpar ligações
      </button>
    </div>
  );
}
