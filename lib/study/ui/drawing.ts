export type Tool = 'pen' | 'line' | 'rect' | 'ellipse' | 'text';
export type DrawItem = {
  tool: Tool;
  color: string;
  width: number;
  points: { x: number; y: number }[];
  text?: string;
};
export type DrawingDoc = { width: number; height: number; items: DrawItem[] };

export const MAX_DRAW_ITEMS = 2000;
export const MAX_DRAW_POINTS = 20000;
export const MAX_DATA_URL_CHARS = 1_400_000;

export const emptyDrawing = (width = 800, height = 520): DrawingDoc => ({
  width,
  height,
  items: [],
});

export function addItem(doc: DrawingDoc, item: DrawItem): DrawingDoc {
  if (!item.points.length || doc.items.length >= MAX_DRAW_ITEMS) return doc;
  return {
    ...doc,
    items: [...doc.items, { ...item, points: item.points.slice(0, MAX_DRAW_POINTS) }],
  };
}

export const undo = (doc: DrawingDoc): DrawingDoc => ({ ...doc, items: doc.items.slice(0, -1) });
export const clearDrawing = (doc: DrawingDoc): DrawingDoc => ({ ...doc, items: [] });

export const isBlank = (doc: DrawingDoc): boolean =>
  doc.items.every((item) => item.tool === 'text' && !(item.text ?? '').trim());

/** Tenta cada codificador em ordem e devolve o primeiro resultado que cabe no limite. */
export function fitDataUrl(encoders: (() => string)[], max = MAX_DATA_URL_CHARS): string {
  for (const encode of encoders) {
    const url = encode();
    if (url.length <= max) return url;
  }
  throw new Error('Desenho grande demais para enviar. Simplifique o desenho ou apague parte dele.');
}
