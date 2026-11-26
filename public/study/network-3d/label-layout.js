// Rótulos da rede 3D sem sobreposição: percorre do mais próximo da câmera para o mais
// distante e marca como "amontoado" o rótulo que encostaria num já colocado.
// left = centro horizontal (o CSS usa translate(-50%, 0)); top = borda de cima; em pixels.
// options.keep: índice que nunca some (o conceito selecionado) e entra primeiro.
export function crowdedLabels(items, options = {}) {
  const gap = options.gap ?? 4;
  const keep = options.keep;
  const order = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.visible)
    .sort((a, b) => {
      if (a.index === keep) return -1;
      if (b.index === keep) return 1;
      return a.item.depth - b.item.depth;
    });
  const placed = [];
  const crowded = new Set();
  for (const { item, index } of order) {
    const rect = {
      x1: item.left - item.width / 2 - gap,
      x2: item.left + item.width / 2 + gap,
      y1: item.top - gap,
      y2: item.top + item.height + gap,
    };
    const hits = placed.some(
      (p) => rect.x1 < p.x2 && rect.x2 > p.x1 && rect.y1 < p.y2 && rect.y2 > p.y1,
    );
    if (hits && index !== keep) crowded.add(index);
    else placed.push(rect);
  }
  return crowded;
}
