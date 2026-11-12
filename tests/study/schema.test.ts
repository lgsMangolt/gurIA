import { expect, it } from 'vitest';
import { emptyWorkspace, workspaceSchema, courseSchema } from '@/lib/study/domain';
it('hydrates older saved workspaces without losing their data', () => {
  const { sessions, dayOverrides, ...old } = emptyWorkspace();
  expect(workspaceSchema.parse(old)).toEqual({ ...old, sessions: [], dayOverrides: {} });
});
it('rejects nonexistent calendar dates in deadlines and day overrides', () => {
  expect(
    workspaceSchema.safeParse({ ...emptyWorkspace(), dayOverrides: { '2026-02-30': 0 } }).success,
  ).toBe(false);
  expect(
    courseSchema.safeParse({
      id: 'a',
      title: 'A',
      minutes: 10,
      deadline: '2026-99-99',
      hoursSource: 'estimate',
    }).success,
  ).toBe(false);
  expect(
    workspaceSchema.safeParse({ ...emptyWorkspace(), dayOverrides: { '2028-02-29': 0 } }).success,
  ).toBe(true);
});
