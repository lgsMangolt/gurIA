import { describe, expect, it } from 'vitest';
import { gradeEscolha, gradeLigar } from '@/lib/study/exercises/grade-local';
import { escolhaSchema, ligarSchema } from '@/lib/study/exercises/schema';

const single = escolhaSchema.parse({
  type: 'escolha',
  id: 'e',
  prompt: 'p',
  options: ['a', 'b', 'c'],
  answerIndexes: [1],
});
const multi = escolhaSchema.parse({
  type: 'escolha',
  id: 'm',
  prompt: 'p',
  options: ['a', 'b', 'c', 'd'],
  answerIndexes: [0, 2],
});
const ligar = ligarSchema.parse({
  type: 'ligar',
  id: 'l',
  prompt: 'p',
  pairs: [
    { left: 'a', right: '1' },
    { left: 'b', right: '2' },
  ],
});

describe('correção local', () => {
  it('escolha única certa e errada', () => {
    expect(gradeEscolha(single, [1])).toEqual({ correct: true, score: 1 });
    expect(gradeEscolha(single, [0])).toEqual({ correct: false, score: 0 });
  });
  it('escolha múltipla exige o conjunto exato', () => {
    expect(gradeEscolha(multi, [2, 0]).correct).toBe(true);
    expect(gradeEscolha(multi, [0]).correct).toBe(false);
    expect(gradeEscolha(multi, [0, 2, 3]).correct).toBe(false);
  });
  it('índices repetidos na resposta contam uma vez', () => {
    expect(gradeEscolha(multi, [0, 0, 2]).correct).toBe(true);
    expect(gradeEscolha(single, [1, 1]).correct).toBe(true);
  });
  it('ligar com todos os pares certos dá 1', () => {
    expect(gradeLigar(ligar, { a: '1', b: '2' })).toEqual({ correct: true, score: 1 });
  });
  it('ligar com metade certa dá score 0.5 e correct false', () => {
    expect(gradeLigar(ligar, { a: '1', b: '1' })).toEqual({ correct: false, score: 0.5 });
  });
  it('ligar ignora lado esquerdo inexistente', () => {
    expect(gradeLigar(ligar, { a: '1', b: '2', zzz: '9' })).toEqual({ correct: true, score: 1 });
    expect(gradeLigar(ligar, {})).toEqual({ correct: false, score: 0 });
  });
});
