'use client';
import { useEffect, useRef, useState } from 'react';
import type { Concept, Workspace } from '@/lib/study/domain';
import { graphStatus, graphStatuses } from '@/lib/study/graph-status';
type View = { x: number; y: number; distance: number };
type Runtime = {
  dispose: () => void;
  rotate: (delta: number) => void;
  reset: () => void;
  view: () => View;
};
export function MatteGraph3D({
  nodes,
  links,
  onSelect,
  now,
  onFallback,
}: {
  nodes: Concept[];
  links: Workspace['connections'];
  onSelect: (node: Concept) => void;
  now: number;
  onFallback?: () => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    runtime = useRef<Runtime | null>(null),
    select = useRef(onSelect),
    view = useRef<View | null>(null);
  const [error, setError] = useState(false),
    [ready, setReady] = useState(false);
  select.current = onSelect;
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let cancelled = false,
      instance: Runtime | null = null;
    setError(false);
    setReady(false);
    const moduleUrl = '/study/network-3d/graph-runtime.js';
    import(/* webpackIgnore: true */ moduleUrl)
      .then((module) => {
        if (cancelled) return;
        const records = nodes.map((n) => {
          const state = graphStatus(n, now);
          const key = element
            .closest('.guria-graph-panel')
            ?.querySelector('.guria-graph-legend .guria-graph-state-' + state);
          return {
            id: n.id,
            label: n.label,
            status: graphStatuses[state].label,
            color: key
              ? getComputedStyle(key).getPropertyValue('--graph-state-color').trim()
              : '#68717d',
            evidence: n.evidence.length,
          };
        });
        instance = module.createMatteGraph(
          element,
          records,
          links,
          (id: string) => {
            const node = nodes.find((n) => n.id === id);
            if (node) select.current(node);
          },
          view.current,
          () => {
            if (!cancelled) setError(true);
          },
        );
        runtime.current = instance;
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
      if (instance) {
        view.current = instance.view();
        instance.dispose();
      }
      runtime.current = null;
    };
  }, [nodes, links, now]);
  return (
    <>
      <div
        className="guria-matte-graph study-graph"
        role="region"
        aria-label="Rede de conhecimento 3D · esferas foscas"
      >
        <div className="guria-matte-canvas" ref={host} />
        {!error && !ready && <p className="guria-3d-message">Preparando a rede 3D…</p>}
        {ready && !error && !nodes.length && (
          <p className="guria-3d-message">
            Sua rede começa com uma aula, um curso ou uma anotação.
          </p>
        )}
        {error && (
          <div className="guria-3d-message">
            <p>Não foi possível abrir a rede 3D.</p>
            <button className="study-btn" onClick={onFallback}>
              Usar mapa 2D
            </button>
          </div>
        )}
      </div>
      {!error && (
        <div className="guria-3d-controls">
          <span className="study-muted">
            Arraste para girar · role para aproximar · clique em um conceito
          </span>
          <div className="study-row">
            <button
              className="study-btn"
              aria-label="Girar rede à esquerda"
              onClick={() => runtime.current?.rotate(-0.25)}
            >
              ↶
            </button>
            <button
              className="study-btn"
              aria-label="Girar rede à direita"
              onClick={() => runtime.current?.rotate(0.25)}
            >
              ↷
            </button>
            <button className="study-btn" onClick={() => runtime.current?.reset()}>
              Redefinir visão
            </button>
          </div>
        </div>
      )}
    </>
  );
}
