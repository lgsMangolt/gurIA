'use client';
import { useEffect, useState } from 'react';
import { StudySkeleton } from './StudySkeleton';

type LibraryStage = { id: string; name: string; sceneCount?: number };

/** Uses the existing owner-scoped OpenMAIC document index; no model calls. */
export function StudyLibrary({
  openPractice,
}: {
  openPractice: (id: string, title: string) => void;
}) {
  const [stages, setStages] = useState<LibraryStage[] | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setStages(null);
    setError('');
    fetch('/api/stages', { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Não foi possível carregar a biblioteca.');
        const data = await response.json();
        if (!Array.isArray(data.stages)) throw new Error('A biblioteca retornou dados inválidos.');
        return data.stages.filter(
          (stage: LibraryStage) => typeof stage.id === 'string' && typeof stage.name === 'string',
        );
      })
      .then(setStages)
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      });
    return () => controller.abort();
  }, [retry]);
  if (error)
    return (
      <section className="study-card" role="alert">
        <p>{error}</p>
        <button className="study-btn" onClick={() => setRetry((n) => n + 1)}>
          Tentar novamente
        </button>
      </section>
    );
  if (!stages) return <StudySkeleton label="Carregando sua biblioteca…" />;
  if (!stages.length)
    return (
      <section className="study-card">
        <h2>Sua biblioteca está vazia</h2>
        <p>Os cursos e práticas disponíveis aparecerão aqui.</p>
      </section>
    );
  return (
    <div className="study-grid">
      {stages.map((stage) => (
        <article className="study-card" key={stage.id}>
          <h2>{stage.name}</h2>
          {typeof stage.sceneCount === 'number' && (
            <p className="study-muted">{stage.sceneCount} cenas</p>
          )}
          <button className="study-btn" onClick={() => openPractice(stage.id, stage.name)}>
            Abrir na gurIA
          </button>
        </article>
      ))}
    </div>
  );
}
