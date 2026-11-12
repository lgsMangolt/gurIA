'use client';
import { useEffect, useState } from 'react';
import type { Concept, Workspace } from '@/lib/study/domain';
import { mastery } from '@/lib/study/domain';
import { pt } from '@/lib/study/locale';
import { graphStatus, graphStatuses } from '@/lib/study/graph-status';
import { MatteGraph3D } from './MatteGraph3D';
export function KnowledgeGraph({
  nodes,
  links,
  onSelect,
  mode,
  onFallback,
}: {
  nodes: Concept[];
  links: Workspace['connections'];
  onSelect: (node: Concept) => void;
  mode: '2d' | '3d';
  onFallback?: () => void;
}) {
  const [zoom, setZoom] = useState(1),
    [pan, setPan] = useState({ x: 0, y: 0 }),
    [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const points = new Map(
    nodes.map((n, i) => {
      const a = i * 2.399963,
        r = 85 * Math.sqrt(i + 1),
        rawX = Math.cos(a) * r,
        depth = 1;
      return [
        n.id,
        {
          x: 500 + rawX,
          y: 320 + Math.sin(a) * r * 0.65 * depth,
          depth,
        },
      ];
    }),
  );
  return (
    <div className="guria-graph-panel">
      <ul className="guria-graph-legend" aria-label="Legenda dos estados de aprendizagem">
        {Object.entries(graphStatuses).map(([key, status]) => (
          <li key={key} className={`guria-graph-state guria-graph-state-${key}`}>
            <span className="guria-state-key" aria-hidden="true">
              {status.symbol}
            </span>
            {status.label}
          </li>
        ))}
      </ul>
      {mode === '3d' ? (
        <MatteGraph3D
          nodes={nodes}
          links={links}
          onSelect={onSelect}
          now={now}
          onFallback={onFallback}
        />
      ) : (
        <svg
          viewBox="0 0 1000 640"
          className="study-graph"
          aria-label={pt.network}
          onWheel={(e) => {
            setZoom((z) => Math.max(0.3, Math.min(3, z * (e.deltaY > 0 ? 0.9 : 1.1))));
          }}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) {
              e.currentTarget.setPointerCapture(e.pointerId);
              setDrag({ x: e.clientX, y: e.clientY });
            }
          }}
          onPointerUp={() => setDrag(null)}
          onPointerMove={(e) => {
            if (drag) {
              setPan((p) => ({
                x: p.x + (e.clientX - drag.x) / zoom,
                y: p.y + (e.clientY - drag.y) / zoom,
              }));
              setDrag({ x: e.clientX, y: e.clientY });
            }
          }}
        >
          <defs>
            <pattern id="study-dots" width="28" height="28" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1" fill="var(--line)" />
            </pattern>
          </defs>
          <rect width="1000" height="640" fill="url(#study-dots)" pointerEvents="none" />
          <g
            transform={`translate(${500 + pan.x},${320 + pan.y}) scale(${zoom}) translate(-500,-320)`}
          >
            {links.map((l) => {
              const a = points.get(l.source),
                b = points.get(l.target);
              return a && b ? (
                <g key={l.id}>
                  <line
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke="var(--line)"
                    strokeWidth="1.5"
                  />
                  <title>{l.relation}</title>
                </g>
              ) : null;
            })}
            {nodes.map((n) => {
              const p = points.get(n.id)!;
              const m = mastery(n),
                r = (18 + Math.min(16, Math.log2(n.evidence.length + 2) * 5)) * p.depth;
              const statusKey = graphStatus(n, now);
              const status = graphStatuses[statusKey];
              return (
                <g
                  key={n.id}
                  role="button"
                  tabIndex={0}
                  aria-label={n.label}
                  aria-describedby={`graph-state-${n.id}`}
                  className={`guria-graph-state guria-graph-state-${statusKey}`}
                  onClick={() => onSelect(n)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelect(n);
                    }
                  }}
                  style={{ cursor: 'pointer' }}
                  transform={`translate(${p.x},${p.y})`}
                >
                  <desc id={`graph-state-${n.id}`}>
                    {status.label}
                    {m.mastered && statusKey === 'review'
                      ? '; domínio demonstrado, revisão agendada pendente'
                      : ''}
                  </desc>
                  <circle r={r + 5} fill="var(--graph-state-color)" fillOpacity="0.12" />
                  <circle
                    r={r}
                    fill="var(--graph-state-color)"
                    stroke="var(--color-surface)"
                    strokeWidth="2"
                  />
                  <text
                    y={r + 24}
                    fill="var(--ink)"
                    fontSize="12"
                    textAnchor="middle"
                    fontWeight="600"
                  >
                    {n.label.length > 29 ? n.label.slice(0, 27) + '…' : n.label}
                  </text>
                  <text y={r + 39} fill="var(--muted)" fontSize="10" textAnchor="middle">
                    {status.label}
                  </text>
                  <title>
                    {status.label} · {n.summary}
                  </title>
                </g>
              );
            })}
          </g>
          {!nodes.length && (
            <text x="500" y="320" textAnchor="middle" fill="var(--muted)" fontSize="15">
              {pt.empty}
            </text>
          )}
        </svg>
      )}
    </div>
  );
}
