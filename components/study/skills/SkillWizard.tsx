'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { scanSensitive } from '@/lib/study/skills/sensitive';
import { friendlyError } from '@/lib/study/ui/errors';
import {
  canSave,
  changeSummary,
  clientSkillMdErrors,
  suggestSlug,
  warningRows,
} from '@/lib/study/ui/skills-view';
import { DiffView } from './DiffView';
import { requestPreview, requestSave, type Preview, type SkillsState } from './skills-api';

const errorOf = (e: unknown) => {
  const err = e as Error & { code?: string };
  return friendlyError(err.code, err.message);
};
type Existing = SkillsState['skills'][number];

export function SkillWizard({
  state,
  existing,
  ready,
  onSaved,
  onCancel,
}: {
  state: SkillsState;
  existing?: Existing;
  ready: boolean;
  onSaved: (message: string) => void;
  onCancel: () => void;
}) {
  const eligibleIds = useMemo(() => new Set(state.eligible.map((c) => c.id)), [state.eligible]);
  const [name, setName] = useState(existing?.name ?? '');
  const [selected, setSelected] = useState<string[]>(
    existing ? existing.conceptIds.filter((id) => eligibleIds.has(id)) : [],
  );
  const [includeAnswers, setIncludeAnswers] = useState(false);
  const [search, setSearch] = useState('');
  const [phase, setPhase] = useState<'form' | 'review'>('form');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [md, setMd] = useState('');
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmAi, setConfirmAi] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const duplicate = !existing && state.skills.some((s) => s.slug === suggestSlug(name));
  const slug = existing?.slug ?? suggestSlug(name);
  const removed = existing ? existing.conceptIds.filter((id) => !eligibleIds.has(id)).length : 0;

  useEffect(() => {
    heading.current?.focus();
  }, [phase]);
  // Editar o texto invalida a confirmação anterior: um aviso novo precisa de nova confirmação.
  useEffect(() => {
    setAck(false);
  }, [md]);

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const map = new Map<string, SkillsState['eligible']>();
    for (const c of state.eligible) {
      if (q && !c.label.toLowerCase().includes(q)) continue;
      const key = c.courseTitle ?? 'Sem curso';
      map.set(key, [...(map.get(key) ?? []), c]);
    }
    return [...map.entries()];
  }, [state.eligible, search]);

  const generate = async (mode: 'template' | 'ai') => {
    setBusy(true);
    setError('');
    setConfirmAi(false);
    try {
      const result = await requestPreview({
        slug,
        name: name.trim(),
        conceptIds: selected,
        includeAnswers,
        mode,
      });
      setPreview(result);
      setMd(result.skillMd);
      setAck(false);
      setPhase('review');
    } catch (e) {
      setError(errorOf(e));
    } finally {
      setBusy(false);
    }
  };

  const warnings = useMemo(
    () => (preview ? scanSensitive({ ...preview.next, 'SKILL.md': md }) : []),
    [preview, md],
  );
  const mdErrors = clientSkillMdErrors(md, slug);
  const verdict = canSave({ warnings, acknowledged: ack, skillMdErrors: mdErrors, busy });
  const hasWarn = warnings.some((w) => w.severity === 'avisa');

  const save = async () => {
    if (!preview) return;
    setBusy(true);
    setError('');
    try {
      const result = await requestSave({
        slug,
        name: name.trim(),
        conceptIds: selected,
        includeAnswers,
        skillMd: md,
        intro: preview.intro,
        acknowledgeWarnings: ack,
        baseVersion: preview.baseVersion,
      });
      onSaved(`Versão v${result.version} salva no commit ${result.commit.slice(0, 7)}.`);
    } catch (e) {
      setError(errorOf(e));
    } finally {
      setBusy(false);
    }
  };

  if (phase === 'review' && preview) {
    const paths = Object.keys(preview.diffs).sort();
    return (
      <section className="study-card guria-skills-wizard" aria-label="Revisão da skill">
        <h2 ref={heading} tabIndex={-1}>
          Revisar {name} · v{preview.version}
        </h2>
        <p>{changeSummary(preview.changes, preview.empty)}</p>
        <label className="study-label">
          SKILL.md (você pode editar)
          <textarea rows={18} value={md} onChange={(e) => setMd(e.target.value)} />
        </label>
        {mdErrors.length > 0 && (
          <p role="alert" className="guria-practice-error">
            {mdErrors[0]}
          </p>
        )}
        <h3>Diferenças por arquivo</h3>
        {paths.length === 0 && <p className="study-muted">Nenhum arquivo mudou.</p>}
        {paths.map((p) => (
          <DiffView key={p} path={p} rows={preview.diffs[p]} open={p === 'SKILL.md'} />
        ))}
        {warnings.length > 0 && (
          <div role="alert" className="guria-skills-warnings">
            <h3>Avisos</h3>
            <ul>
              {warningRows(warnings).map((w, i) => (
                <li key={i} className={w.severity}>
                  <strong>{w.severity === 'bloqueia' ? 'Bloqueia' : 'Avisa'}:</strong> {w.label} em{' '}
                  <code>{w.where}</code> ({w.excerpt})
                </li>
              ))}
            </ul>
            {hasWarn && !warnings.some((w) => w.severity === 'bloqueia') && (
              <label>
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />{' '}
                Li os avisos e quero salvar mesmo assim
              </label>
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="guria-practice-error">
            {error}
          </p>
        )}
        {!verdict.ok && verdict.reason && <p className="study-muted">{verdict.reason}</p>}
        <div className="study-row">
          <button
            className="study-btn primary"
            disabled={!verdict.ok || (preview.empty && md === preview.skillMd)}
            onClick={() => void save()}
          >
            Salvar e criar commit
          </button>
          <button className="study-btn" disabled={busy} onClick={() => setPhase('form')}>
            Voltar
          </button>
          <button className="study-btn" disabled={busy} onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="study-card guria-skills-wizard" aria-label="Nova skill">
      <h2 ref={heading} tabIndex={-1}>
        {existing ? `Melhorar ${existing.name}` : 'Nova skill'}
      </h2>
      <label className="study-label">
        Nome da skill
        <input value={name} disabled={!!existing} onChange={(e) => setName(e.target.value)} />
      </label>
      <p className="study-muted">
        Pasta: <code>{slug || '…'}</code>
      </p>
      {duplicate && (
        <p role="alert" className="guria-practice-error">
          Já existe uma skill com esta pasta. Use "Melhorar" na lista para criar uma nova versão.
        </p>
      )}
      {removed > 0 && (
        <p role="status">
          {removed}{' '}
          {removed === 1
            ? 'conceito saiu do domínio e será removido'
            : 'conceitos saíram do domínio e serão removidos'}{' '}
          da nova versão.
        </p>
      )}
      <h3>Conceitos dominados</h3>
      {state.eligible.length === 0 ? (
        <p className="study-muted">
          Ainda não há conceitos dominados. Um conceito é dominado com duas demonstrações sem ajuda,
          com pelo menos 3 dias de intervalo (veja a aba Praticar).
        </p>
      ) : (
        <>
          <input
            type="search"
            aria-label="Buscar conceito"
            placeholder="Buscar conceito"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {groups.map(([course, list]) => (
            <fieldset key={course} className="guria-skills-group">
              <legend>{course}</legend>
              {list.map((c) => (
                <label key={c.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(c.id)}
                    onChange={() =>
                      setSelected((prev) =>
                        prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id],
                      )
                    }
                  />
                  {c.label}
                </label>
              ))}
            </fieldset>
          ))}
        </>
      )}
      <label>
        <input
          type="checkbox"
          checked={includeAnswers}
          onChange={(e) => setIncludeAnswers(e.target.checked)}
        />{' '}
        Incluir meus exemplos de resposta
      </label>
      {includeAnswers && (
        <p className="study-muted">
          Suas respostas escritas corrigidas como certas poderão aparecer na skill. Se ela for
          publicada, elas ficam visíveis para quem tiver acesso ao repositório.
        </p>
      )}
      {confirmAi && (
        <div role="alertdialog" aria-label="Confirmar uso da IA" className="guria-practice-confirm">
          <p>
            Redigir com IA usa uma chamada da IA escolhida e consome sua cota. Deseja continuar?
          </p>
          <div className="study-row">
            <button
              className="study-btn primary"
              disabled={busy}
              onClick={() => void generate('ai')}
            >
              Confirmar e redigir
            </button>
            <button className="study-btn" onClick={() => setConfirmAi(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="guria-practice-error">
          {error}
        </p>
      )}
      <div className="study-row">
        <button
          className="study-btn primary"
          disabled={busy || duplicate || !slug || !name.trim() || selected.length === 0}
          onClick={() => void generate('template')}
        >
          Gerar modelo (sem IA)
        </button>
        <button
          className="study-btn"
          disabled={busy || !ready || !slug || !name.trim() || selected.length === 0}
          onClick={() => setConfirmAi(true)}
        >
          Redigir com IA
        </button>
        <button className="study-btn" disabled={busy} onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </section>
  );
}
