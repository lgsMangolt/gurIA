'use client';
import { CONFIDENCE_LEVELS, practiceCopy } from '@/lib/study/ui/copy';

export function ConfidenceSelector({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="guria-practice-confidence" disabled={disabled}>
      <legend>{practiceCopy.confidenceTitle}</legend>
      <div className="guria-practice-options">
        {CONFIDENCE_LEVELS.map((level) => (
          <label key={level.id} className={value === level.id ? 'selected' : ''}>
            <input
              type="radio"
              name="confidence"
              value={level.id}
              checked={value === level.id}
              onChange={() => onChange(level.id)}
            />
            {level.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
