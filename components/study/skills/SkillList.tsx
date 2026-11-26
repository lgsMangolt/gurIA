'use client';
import type { SkillsState } from './skills-api';

export function SkillList({
  skills,
  onNew,
  onImprove,
  disabled,
}: {
  skills: SkillsState['skills'];
  onNew: () => void;
  onImprove: (skill: SkillsState['skills'][number]) => void;
  disabled: boolean;
}) {
  return (
    <section className="study-card guria-skills-list">
      <h2>Suas skills</h2>
      {skills.length === 0 ? (
        <p className="study-muted">
          Nenhuma skill ainda. Crie a primeira com os conceitos que você já domina.
        </p>
      ) : (
        <ul>
          {skills.map((s) => (
            <li key={s.slug}>
              <div>
                <strong>{s.name}</strong>{' '}
                <span className="study-muted">
                  v{s.version} · {s.count} conceitos
                </span>
                <div className="study-muted">{s.description}</div>
              </div>
              <button className="study-btn" disabled={disabled} onClick={() => onImprove(s)}>
                Melhorar
              </button>
            </li>
          ))}
        </ul>
      )}
      <button className="study-btn primary" disabled={disabled} onClick={onNew}>
        Nova skill
      </button>
    </section>
  );
}
