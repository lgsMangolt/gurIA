'use client';
import type { Exercise } from '@/lib/study/exercises/schema';

export function WritingExercise({
  exercise,
  value,
  onChange,
  disabled,
}: {
  exercise: Extract<Exercise, { type: 'escrita' }>;
  value: string;
  onChange: (text: string) => void;
  disabled?: boolean;
}) {
  const length = value.trim().length;
  return (
    <div className="guria-practice-writing">
      <label className="study-label">
        Sua resposta
        <textarea
          rows={8}
          value={value}
          maxLength={10000}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
      <p className="study-muted" aria-live="polite">
        {length} caracteres
        {exercise.minChars > 0 ? ` · mínimo de ${exercise.minChars}` : ''}
      </p>
      <details>
        <summary>O que será avaliado</summary>
        <ul>
          {exercise.rubric.map((item) => (
            <li key={item.criterion}>{item.criterion}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
