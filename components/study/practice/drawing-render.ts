import { fitDataUrl, type DrawingDoc } from '@/lib/study/ui/drawing';

export function renderDrawing(ctx: CanvasRenderingContext2D, doc: DrawingDoc): void {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, doc.width, doc.height);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const item of doc.items) {
    const first = item.points[0];
    const last = item.points[item.points.length - 1];
    if (!first) continue;
    ctx.strokeStyle = item.color;
    ctx.fillStyle = item.color;
    ctx.lineWidth = item.width;
    ctx.beginPath();
    if (item.tool === 'pen') {
      if (item.points.length === 1) {
        ctx.arc(first.x, first.y, item.width / 2, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      ctx.moveTo(first.x, first.y);
      for (const p of item.points.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.stroke();
    } else if (item.tool === 'line') {
      ctx.moveTo(first.x, first.y);
      ctx.lineTo(last.x, last.y);
      ctx.stroke();
    } else if (item.tool === 'rect') {
      ctx.strokeRect(
        Math.min(first.x, last.x),
        Math.min(first.y, last.y),
        Math.abs(last.x - first.x),
        Math.abs(last.y - first.y),
      );
    } else if (item.tool === 'ellipse') {
      ctx.ellipse(
        (first.x + last.x) / 2,
        (first.y + last.y) / 2,
        Math.max(1, Math.abs(last.x - first.x) / 2),
        Math.max(1, Math.abs(last.y - first.y) / 2),
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    } else if (item.tool === 'text' && item.text) {
      ctx.font = `${14 + item.width * 4}px sans-serif`;
      ctx.textBaseline = 'top';
      ctx.fillText(item.text, first.x, first.y);
    }
  }
}

/** PNG primeiro; se passar do limite, WebP e depois JPEG. Lança mensagem em português se nada couber. */
export function exportDataUrl(canvas: HTMLCanvasElement): string {
  return fitDataUrl([
    () => canvas.toDataURL('image/png'),
    () => canvas.toDataURL('image/webp', 0.9),
    () => canvas.toDataURL('image/jpeg', 0.8),
  ]);
}
