import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const mocked = vi.hoisted(() => ({
  codex: { status: vi.fn(), generate: vi.fn() },
  claude: { status: vi.fn(), generate: vi.fn() },
}));
vi.mock('@/lib/study/runtime/codex', () => ({
  CodexBridge: class {
    status = mocked.codex.status;
    generate = mocked.codex.generate;
  },
}));
vi.mock('@/lib/study/runtime/harness', async (original) => {
  const real = await original<Record<string, unknown>>();
  return {
    ...real,
    ClaudeBridge: class {
      status = mocked.claude.status;
      generate = mocked.claude.generate;
    },
  };
});
vi.mock('@/lib/study/runtime/media', () => ({
  MediaPipeline: class {
    cleanup() {}
  },
}));
import { service } from '@/lib/study/service';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openmaic-routing-'));
const originalAppData = process.env.LOCALAPPDATA;
beforeEach(() => {
  process.env.LOCALAPPDATA = root;
  vi.clearAllMocks();
  mocked.codex.status.mockResolvedValue({
    connected: true,
    models: [{ id: 'codex-test', name: 'Codex', isDefault: true }],
  });
  mocked.claude.status.mockResolvedValue({
    connected: true,
    models: [{ id: 'sonnet', name: 'Sonnet', isDefault: true }],
  });
  mocked.codex.generate.mockResolvedValue('codex-result');
  mocked.claude.generate.mockResolvedValue('claude-result');
});
afterAll(() => {
  if (originalAppData === undefined) delete process.env.LOCALAPPDATA;
  else process.env.LOCALAPPDATA = originalAppData;
  if (!path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep + 'openmaic-routing-'))
    throw new Error('Unsafe test cleanup target');
  fs.rmSync(root, { recursive: true, force: true });
});
it('uses the selected provider consistently and retains the model per provider', async () => {
  const s = service('routing-test');
  await s.select('claude');
  expect(await s.generate('lesson')).toBe('claude-result');
  expect(mocked.claude.generate).toHaveBeenCalledWith('lesson', undefined, [], 'sonnet');
  await s.select('codex');
  await s.select('claude');
  expect(s.model).toBe('sonnet');
  expect(JSON.parse(fs.readFileSync(path.join(s.root, 'model.json'), 'utf8')).models).toEqual({
    claude: 'sonnet',
    codex: 'codex-test',
  });
  // A queued Codex job keeps its original destination while Claude is selected.
  await s.generate('pinned job', {}, [], 'codex-test', 'codex');
  expect(mocked.codex.generate).toHaveBeenCalledWith('pinned job', {}, [], 'codex-test');
});
it('never falls back after a provider error and never changes selection on failed validation', async () => {
  const s = service('no-fallback-test');
  await s.select('claude');
  mocked.claude.generate.mockRejectedValueOnce(new Error('quota unavailable'));
  await expect(s.generate('lesson')).rejects.toThrow('quota unavailable');
  expect(mocked.codex.generate).not.toHaveBeenCalled();
  await expect(s.select('codex', 'unavailable')).rejects.toThrow('indisponível');
  expect(s.harness).toBe('claude');
});
