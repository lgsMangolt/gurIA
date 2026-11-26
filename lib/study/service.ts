import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { studyRoot } from './storage-root';
import { CodexBridge } from './runtime/codex';
import {
  ClaudeBridge,
  harnessNames,
  type Harness,
  type HarnessId,
  type Selection,
} from './runtime/harness';
import { AppError } from './runtime/analysis';
import { MediaPipeline } from './runtime/media';

const instances = globalThis as typeof globalThis & {
  studyServices?: Map<string, ReturnType<typeof create>>;
};
function create(owner: string) {
  const root = studyRoot(process.env.LOCALAPPDATA || os.homedir(), owner);
  const modelFile = path.join(root, 'model.json');
  let selection: Selection = { harness: 'codex', model: '' };
  let models: Partial<Record<HarnessId, string>> = {};
  try {
    const saved = JSON.parse(fs.readFileSync(modelFile, 'utf8'));
    selection = {
      harness: ['codex', 'claude'].includes(saved.harness) ? saved.harness : 'codex',
      model: saved.model || '',
    };
    models = saved.models || { [selection.harness]: selection.model };
  } catch {}
  const codex = new CodexBridge(root);
  const adapters: Record<HarnessId, Harness> = { codex, claude: new ClaudeBridge(root) };
  const generate = (
    prompt: string,
    schema?: unknown,
    images: string[] = [],
    model?: string,
    harness?: string,
  ) => {
    const chosen = (harness || selection.harness) as HarnessId;
    if (!adapters[chosen]) throw new AppError(400, 'HARNESS', 'Harness desconhecido.');
    return adapters[chosen].generate(
      prompt,
      schema,
      images,
      model === undefined
        ? chosen === selection.harness
          ? selection.model
          : models[chosen] || ''
        : model,
    );
  };
  const media = new MediaPipeline(
    root,
    { generate },
    () => selection.model,
    () => selection.harness,
  );
  media.cleanup();
  const cleanup = setInterval(() => media.cleanup(), 60000);
  cleanup.unref();
  return {
    root,
    codex,
    media,
    generate,
    get harness() {
      return selection.harness;
    },
    get model() {
      return selection.model;
    },
    async select(harness: HarnessId, model?: string) {
      const info = await adapters[harness].status();
      const chosen = model || models[harness] || info.models.find((m) => m.isDefault)?.id;
      if (!info.connected || !chosen || !info.models.some((m) => m.id === chosen))
        throw new AppError(400, 'MODEL', 'Harness ou modelo indisponível.');
      const next = { harness, model: chosen };
      models = { ...models, [harness]: chosen };
      fs.writeFileSync(modelFile + '.tmp', JSON.stringify({ ...next, models }));
      fs.renameSync(modelFile + '.tmp', modelFile);
      selection = next;
    },
    async settings() {
      const entries = await Promise.all(
        (Object.keys(adapters) as HarnessId[]).map(async (id) => {
          try {
            return { id, name: harnessNames[id], ...(await adapters[id].status()) };
          } catch (e) {
            return {
              id,
              name: harnessNames[id],
              connected: false,
              models: [],
              error: e instanceof Error ? e.message : 'Indisponível',
            };
          }
        }),
      );
      const selected = entries.find((e) => e.id === selection.harness)!;
      return {
        harness: selection.harness,
        harnesses: entries,
        model: selection.model || selected.models.find((m) => m.isDefault)?.id || '',
        codex: entries.find((e) => e.id === 'codex'),
        selected,
      };
    },
  };
}
export function service(owner: string) {
  const map = (instances.studyServices ||= new Map());
  let value = map.get(owner);
  if (!value) {
    value = create(owner);
    map.set(owner, value);
  }
  return value;
}
