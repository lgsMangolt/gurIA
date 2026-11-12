import { expect, it } from 'vitest';
import { runProCodexProbe } from '../../scripts/study-pro-codex-probe';

// Explicit opt-in: this consumes the user's included Codex quota.
it.skipIf(process.env.GURIA_RUN_CODEX_PROBE !== '1')('runs the real Codex and Pro loop with a synthetic tool', async () => {
  const report = await runProCodexProbe();
  expect(report).toMatchObject({ passed: true, model: 'gpt-6-luna', workspaceUnchanged: true, syntheticOnly: true, toolCalled: 'ler_conceito_sintetico' });
}, 360000);
