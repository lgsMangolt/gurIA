'use client';
import { useState } from 'react';
import { friendlyError } from '@/lib/study/ui/errors';
import { saveConfig, type SkillsState } from './skills-api';

const errorOf = (e: unknown) => {
  const err = e as Error & { code?: string };
  return friendlyError(err.code, err.message);
};

export function DestinationCard({
  state,
  onState,
}: {
  state: SkillsState;
  onState: (next: SkillsState) => void;
}) {
  const [mode, setMode] = useState<'separate' | 'in-repo'>(state.config?.mode ?? 'separate');
  const [path, setPath] = useState(state.config?.mode === 'separate' ? state.config.repoPath : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmInit, setConfirmInit] = useState(false);

  const apply = async (initRepo = false) => {
    setBusy(true);
    setError('');
    try {
      // "Iniciar repositório" age só na pasta já salva, nunca no que está digitado no campo.
      const target =
        initRepo && state.config
          ? { mode: state.config.mode, repoPath: state.config.repoPath }
          : { mode, ...(mode === 'separate' ? { repoPath: path } : {}) };
      onState(await saveConfig({ ...target, ...(initRepo ? { initRepo: true } : {}) }));
      setConfirmInit(false);
    } catch (e) {
      setError(errorOf(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="study-card guria-skills-destination">
      <h2>Onde guardar as skills</h2>
      <fieldset className="guria-practice-options column">
        <legend>Destino</legend>
        <label className={mode === 'separate' ? 'selected' : ''}>
          <input
            type="radio"
            name="skills-mode"
            checked={mode === 'separate'}
            onChange={() => setMode('separate')}
          />
          Repositório separado (recomendado)
        </label>
        <label className={mode === 'in-repo' ? 'selected' : ''}>
          <input
            type="radio"
            name="skills-mode"
            checked={mode === 'in-repo'}
            onChange={() => setMode('in-repo')}
          />
          Pasta skills-geradas/ dentro da gurIA
        </label>
      </fieldset>
      {mode === 'separate' && (
        <label className="study-label">
          Caminho completo da pasta do repositório
          <input
            value={path}
            placeholder="C:\Users\voce\minhas-skills"
            onChange={(e) => setPath(e.target.value)}
          />
        </label>
      )}
      <div className="study-row">
        <button
          className="study-btn primary"
          disabled={busy || (mode === 'separate' && !path.trim())}
          onClick={() => void apply()}
        >
          Salvar destino
        </button>
      </div>
      {state.config && (
        <ul className="guria-skills-status" aria-label="Estado do git">
          <li>
            {state.gitOk ? '✓ git instalado' : '✗ git não encontrado: instale em git-scm.com'}
          </li>
          <li>
            {state.repoOk
              ? '✓ a pasta é um repositório'
              : '✗ a pasta ainda não é um repositório git'}
          </li>
          <li>
            {state.identityOk
              ? '✓ identidade do git configurada'
              : '✗ configure git config --global user.name e user.email'}
          </li>
        </ul>
      )}
      {state.config && state.gitOk && !state.repoOk && state.config.mode === 'separate' && (
        <div>
          {!confirmInit ? (
            <button className="study-btn" disabled={busy} onClick={() => setConfirmInit(true)}>
              Iniciar repositório aqui
            </button>
          ) : (
            <div
              className="study-row"
              role="alertdialog"
              aria-label="Confirmar início do repositório"
            >
              <span>Executar git init em {state.config.repoPath}?</span>
              <button
                className="study-btn primary"
                disabled={busy}
                onClick={() => void apply(true)}
              >
                Confirmar
              </button>
              <button className="study-btn" onClick={() => setConfirmInit(false)}>
                Cancelar
              </button>
            </div>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="guria-practice-error">
          {error}
        </p>
      )}
    </section>
  );
}
