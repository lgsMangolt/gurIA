'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Exercise } from '@/lib/study/exercises/schema';
import {
  addItem,
  clearDrawing,
  emptyDrawing,
  isBlank,
  undo,
  type DrawItem,
  type DrawingDoc,
  type Tool,
} from '@/lib/study/ui/drawing';
import { exportDataUrl, renderDrawing } from './drawing-render';

const TOOLS: { id: Tool; label: string }[] = [
  { id: 'pen', label: 'Caneta' },
  { id: 'line', label: 'Linha' },
  { id: 'rect', label: 'Retângulo' },
  { id: 'ellipse', label: 'Elipse' },
  { id: 'text', label: 'Texto' },
];
const COLORS = [
  { value: '#1f2328', name: 'Preto' },
  { value: '#0969da', name: 'Azul' },
  { value: '#1a7f37', name: 'Verde' },
  { value: '#cf222e', name: 'Vermelho' },
  { value: '#9a6700', name: 'Amarelo escuro' },
];
const WIDTHS = [
  { value: 2, name: 'Fina' },
  { value: 4, name: 'Média' },
  { value: 8, name: 'Grossa' },
];

export type DrawingHandle = { blank: boolean; exportImage: () => string };

export function DrawingExercise({
  exercise,
  disabled,
  onChange,
}: {
  exercise: Extract<Exercise, { type: 'desenho' }>;
  disabled?: boolean;
  onChange: (handle: DrawingHandle) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [doc, setDoc] = useState<DrawingDoc>(() => emptyDrawing());
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState(COLORS[0].value);
  const [width, setWidth] = useState(WIDTHS[1].value);
  const [textAt, setTextAt] = useState<{ x: number; y: number } | null>(null);
  const [text, setText] = useState('');
  const current = useRef<DrawItem | null>(null);

  const redraw = useCallback((preview?: DrawItem | null) => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    renderDrawing(ctx, {
      ...docRef.current,
      items: [...docRef.current.items, ...(preview ? [preview] : [])],
    });
  }, []);
  const docRef = useRef(doc);
  docRef.current = doc;

  useEffect(() => {
    redraw();
    onChange({
      blank: isBlank(doc),
      exportImage: () => exportDataUrl(canvas.current!),
    });
    // O parent só precisa da última versão do documento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * doc.width) / rect.width,
      y: ((e.clientY - rect.top) * doc.height) / rect.height,
    };
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const p = point(e);
    if (tool === 'text') {
      setTextAt(p);
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    current.current = { tool, color, width, points: [p] };
    redraw(current.current);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const item = current.current;
    if (!item) return;
    const p = point(e);
    item.points = tool === 'pen' ? [...item.points, p] : [item.points[0], p];
    redraw(item);
  };
  const up = () => {
    const item = current.current;
    current.current = null;
    if (item) setDoc((d) => addItem(d, item));
  };
  const commitText = () => {
    if (textAt && text.trim())
      setDoc((d) =>
        addItem(d, { tool: 'text', color, width, points: [textAt], text: text.trim() }),
      );
    setTextAt(null);
    setText('');
  };

  return (
    <div className="guria-practice-drawing">
      <div className="guria-practice-toolbar" role="toolbar" aria-label="Ferramentas de desenho">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`study-btn ${tool === t.id ? 'primary' : ''}`}
            aria-pressed={tool === t.id}
            disabled={disabled}
            onClick={() => setTool(t.id)}
          >
            {t.label}
          </button>
        ))}
        <span className="guria-practice-swatches" role="group" aria-label="Cor">
          {COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              className={`guria-practice-swatch ${color === c.value ? 'selected' : ''}`}
              style={{ background: c.value }}
              aria-label={c.name}
              aria-pressed={color === c.value}
              disabled={disabled}
              onClick={() => setColor(c.value)}
            />
          ))}
        </span>
        <span role="group" aria-label="Espessura" className="guria-practice-widths">
          {WIDTHS.map((w) => (
            <button
              key={w.value}
              type="button"
              className={`study-btn ${width === w.value ? 'primary' : ''}`}
              aria-pressed={width === w.value}
              disabled={disabled}
              onClick={() => setWidth(w.value)}
            >
              {w.name}
            </button>
          ))}
        </span>
        <button
          type="button"
          className="study-btn"
          disabled={disabled || doc.items.length === 0}
          onClick={() => setDoc((d) => undo(d))}
        >
          Desfazer
        </button>
        <button
          type="button"
          className="study-btn"
          disabled={disabled || doc.items.length === 0}
          onClick={() => setDoc((d) => clearDrawing(d))}
        >
          Limpar
        </button>
      </div>
      <canvas
        ref={canvas}
        width={doc.width}
        height={doc.height}
        className="guria-practice-canvas"
        role="img"
        aria-label="Área de desenho. Use mouse, toque ou caneta. Se preferir, pule este item."
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      />
      {textAt && (
        <div className="study-row">
          <input
            autoFocus
            aria-label="Texto do desenho"
            value={text}
            maxLength={120}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitText();
              if (e.key === 'Escape') {
                setTextAt(null);
                setText('');
              }
            }}
          />
          <button type="button" className="study-btn" onClick={commitText}>
            Adicionar texto
          </button>
        </div>
      )}
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
