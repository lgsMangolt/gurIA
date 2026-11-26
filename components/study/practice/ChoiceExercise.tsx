'use client';
import type { Exercise } from '@/lib/study/exercises/schema';

export function ChoiceExercise({
  exercise,
  value,
  onChange,
  disabled,
}: {
  exercise: Extract<Exercise, { type: 'escolha' }>;
  value: number[];
  onChange: (chosen: number[]) => void;
  disabled?: boolean;
}) {
  const multiple = exercise.answerIndexes.length > 1;
  const toggle = (index: number) => {
    if (!multiple) return onChange([index]);
    onChange(value.includes(index) ? value.filter((i) => i !== index) : [...value, index]);
  };
  return (
    <fieldset className="guria-practice-options column" disabled={disabled}>
      <legend>{multiple ? 'Marque todas as corretas' : 'Marque uma opção'}</legend>
      {exercise.options.map((option, index) => (
        <label key={index} className={value.includes(index) ? 'selected' : ''}>
          <input
            type={multiple ? 'checkbox' : 'radio'}
            name={'choice-' + exercise.id}
            checked={value.includes(index)}
            onChange={() => toggle(index)}
          />
          {option}
        </label>
      ))}
    </fieldset>
  );
}
