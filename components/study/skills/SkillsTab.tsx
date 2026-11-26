'use client';
import { useCallback, useEffect, useState } from 'react';
import { friendlyError } from '@/lib/study/ui/errors';
import { DestinationCard } from './DestinationCard';
import { PublishCard } from './PublishCard';
import { SkillList } from './SkillList';
import { SkillWizard } from './SkillWizard';
import { loadState, type SkillsState } from './skills-api';

export function SkillsTab({ ready, notify }: { ready: boolean; notify: (text: string) => void }) {
  const [state, setState] = useState<SkillsState | null>(null);
  const [error, setError] = useState('');
  const [wizard, setWizard] = useState<null | { existing?: SkillsState['skills'][number] }>(null);
  const [version, setVersion] = useState(0);

  const refresh = useCallback(async () => {
    try {
      setState(await loadState());
      setError('');
    } catch (e) {
      const err = e as Error & { code?: string };
      setError(friendlyError(err.code, err.message));
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!state)
    return error ? (
      <p role="alert" className="guria-practice-error">
        {error}
      </p>
    ) : (
      <p className="study-muted">Carregando…</p>
    );

  const usable = !!state.config && state.gitOk && state.repoOk;
  return (
    <div className="guria-skills">
      <DestinationCard key={state.config?.repoPath ?? 'none'} state={state} onState={setState} />
      {usable && !wizard && (
        <SkillList
          skills={state.skills}
          disabled={false}
          onNew={() => setWizard({})}
          onImprove={(existing) => setWizard({ existing })}
        />
      )}
      {usable && wizard && (
        <SkillWizard
          key={wizard.existing?.slug ?? 'nova'}
          state={state}
          existing={wizard.existing}
          ready={ready}
          onCancel={() => setWizard(null)}
          onSaved={(message) => {
            notify(message);
            setWizard(null);
            setVersion((v) => v + 1);
            void refresh();
          }}
        />
      )}
      {usable && state.config?.mode === 'separate' && state.skills.length > 0 && (
        <PublishCard
          reloadKey={String(version) + state.skills.map((s) => s.slug + s.version).join()}
        />
      )}
      {error && (
        <p role="alert" className="guria-practice-error">
          {error}
        </p>
      )}
    </div>
  );
}
