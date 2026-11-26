import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo .js servido em public/, sem tipos
import { crowdedLabels } from '../../public/study/network-3d/label-layout.js';

// left é o centro do rótulo (o CSS usa translate(-50%, 0)); top é a borda de cima.
const box = (
  left: number,
  top: number,
  depth: number,
  width = 120,
  height = 36,
  visible = true,
) => ({
  left,
  top,
  width,
  height,
  depth,
  visible,
});

describe('crowdedLabels (rótulos da rede 3D)', () => {
  it('rótulos separados ficam todos visíveis', () => {
    expect([
      ...crowdedLabels([box(100, 100, 0.5), box(400, 100, 0.6), box(100, 300, 0.4)]),
    ]).toEqual([]);
  });

  it('dois rótulos sobrepostos: esconde o que está mais longe', () => {
    const hidden = crowdedLabels([box(100, 100, 0.8), box(130, 110, 0.3)]);
    expect([...hidden]).toEqual([0]);
  });

  it('em cadeia: o do meio some e os das pontas, que não se tocam, ficam', () => {
    const hidden = crowdedLabels([box(100, 100, 0.2), box(200, 100, 0.5), box(300, 100, 0.3)]);
    expect([...hidden]).toEqual([1]);
  });

  it('rótulo fora da tela não ocupa lugar nem é marcado', () => {
    const hidden = crowdedLabels([box(100, 100, 0.1, 120, 36, false), box(110, 100, 0.9)]);
    expect([...hidden]).toEqual([]);
  });

  it('o rótulo selecionado nunca some e tem prioridade', () => {
    const hidden = crowdedLabels([box(100, 100, 0.9), box(110, 100, 0.1)], { keep: 0 });
    expect([...hidden]).toEqual([1]);
  });
});
