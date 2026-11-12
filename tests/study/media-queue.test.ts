import { it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MediaPipeline, localReady } from '@/lib/study/runtime/media';
it.skipIf(!localReady())(
  'preserves queued originals after failure and resumes sequentially before expiry',
  async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openmaic-study-queue-'));
    const source = path.join(root, 'fixture.wav');
    // A self-contained, two-second silent PCM fixture; no recordings or AI calls.
    const wav = Buffer.alloc(44 + 16000 * 2 * 2);
    wav.write('RIFF', 0);
    wav.writeUInt32LE(wav.length - 8, 4);
    wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(16000, 24);
    wav.writeUInt32LE(32000, 28);
    wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34);
    wav.write('data', 36);
    wav.writeUInt32LE(wav.length - 44, 40);
    fs.writeFileSync(source, wav);
    const response = JSON.stringify({
      summary: 'Teste sintético da fila.',
      concepts: [],
      connections: [],
      transcriptSegments: [],
    });
    let calls = 0;
    let selection = { harness: 'claude', model: 'sonnet' };
    const dispatched: Array<{ model?: string; harness?: string }> = [];
    const engine = new MediaPipeline(
      root,
      {
        generate: async (_prompt, _schema, _images, model, harness) => {
          calls++;
          dispatched.push({ model, harness });
          await new Promise((r) => setTimeout(r, 150));
          if (calls === 1) throw new Error('Synthetic failure');
          return response;
        },
      },
      () => selection.model,
      () => selection.harness,
    );
    const context = {
      lessonId: 'synthetic',
      lessonTitle: 'Teste da fila',
      offsetSeconds: 0,
      durationSeconds: 1,
      sourceType: 'video_file' as const,
    };
    try {
      fs.copyFileSync(source, path.join(root, 'one.wav'));
      const one = engine.create(
        path.join(root, 'one.wav'),
        context,
        '1\n00:00:00,000 --> 00:00:02,000\nTeste sintético.',
      );
      selection = { harness: 'codex', model: 'gpt-test' };
      fs.copyFileSync(source, path.join(root, 'two.wav'));
      const two = engine.create(
        path.join(root, 'two.wav'),
        context,
        '1\n00:00:00,000 --> 00:00:02,000\nTeste sintético.',
      );
      while (engine.busy) await new Promise((r) => setTimeout(r, 50));
      expect(engine.get(one).status).toBe('failed');
      expect(engine.get(two).status).toBe('queued');
      expect(fs.existsSync(path.join(engine.root, two, 'source.media'))).toBe(true);
      selection = { harness: 'claude', model: 'opus' }; // UI changes do not retarget queued/retried material.
      engine.retry(one);
      while (engine.busy) await new Promise((r) => setTimeout(r, 50));
      expect(engine.get(one).status).toBe('completed');
      expect(engine.get(two).status).toBe('completed');
      expect(calls).toBe(3);
      expect(dispatched).toEqual([
        { harness: 'claude', model: 'sonnet' },
        { harness: 'claude', model: 'sonnet' },
        { harness: 'codex', model: 'gpt-test' },
      ]);
      const file = path.join(engine.root, two, 'job.json');
      fs.writeFileSync(file, JSON.stringify({ ...engine.get(two), expiresAt: Date.now() - 1 }));
      engine.cleanup();
      expect(engine.get(two).status).toBe('expired');
      expect(fs.existsSync(path.join(engine.root, two, 'source.media'))).toBe(false);
    } finally {
      const resolved = path.resolve(root);
      if (!resolved.startsWith(path.resolve(os.tmpdir()) + path.sep + 'openmaic-study-queue-'))
        throw new Error('Unexpected test cleanup target');
      fs.rmSync(resolved, { recursive: true, force: true });
    }
  },
  30000,
);
