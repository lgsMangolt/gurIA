import { randomUUID, createHash } from 'node:crypto';
import fs from 'node:fs';
import { parseEnv } from 'node:util';
import pg from 'pg';
import { expect, it } from 'vitest';

// Uses included Codex quota only when explicitly opted in.
it.skipIf(process.env.GURIA_RUN_PRO_RUNNER !== '1')('runs a durable Pro session with Luna in a disposable database', async () => {
  const env: Record<string, string> = {};
  for (const file of ['.env', '.env.local']) if (fs.existsSync(file)) Object.assign(env, parseEnv(fs.readFileSync(file, 'utf8')));
  const url = process.env.DATABASE_URL || env.DATABASE_URL;
  if (!url) throw new Error('Banco indisponível.');
  const admin = new pg.Pool({ connectionString: url });
  const snapshot = async () => createHash('sha256').update(JSON.stringify((await admin.query('SELECT owner_id,revision,data,updated_at FROM study_workspace ORDER BY owner_id')).rows)).digest('hex');
  const before = await snapshot();
  const name = `guria_pro_test_${randomUUID().replaceAll('-', '')}`;
  if (!/^guria_pro_test_[0-9a-f]{32}$/.test(name)) throw new Error('Nome de teste inválido.');
  const old = { ...process.env };
  let created = false;
  let stop: (() => Promise<void>) | undefined;
  let testPool: pg.Pool | undefined;
  try {
    await admin.query(`CREATE DATABASE ${name}`);
    created = true;
    const testUrl = new URL(url); testUrl.pathname = `/${name}`;
    process.env.DATABASE_URL = testUrl.toString();
    process.env.OPENMAIC_STUDY_LOCAL = 'true';
    process.env.OPENMAIC_STUDY_PRO_CODEX = 'true';
    const { getAgentSessionStore } = await import('@/lib/server/agent-runtime/store');
    const store = await getAgentSessionStore();
    const { getServerPersistenceProvider } = await import('@/lib/persistence/server-provider');
    testPool = (await getServerPersistenceProvider(testUrl.toString())).pool;
    const session = await store.createSession({ ownerId: `test-${randomUUID()}`, prompt: 'Teste sintético: use a ferramenta ask_user para perguntar qual conectivo lógico desejo estudar, oferecendo E e OU.' });
    const { startAgentRunner } = await import('@/lib/server/agent-runtime/runner');
    const runner = startAgentRunner(); stop = () => runner.stop({ timeoutMs: 15000 });
    const deadline = Date.now() + 180000;
    let current = await store.getSession(session.id);
    while (current && ['queued', 'running'].includes(current.status) && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      current = await store.getSession(session.id);
    }
    const events = await store.readEventsAfter(session.id, 0);
    console.log('Teste Pro:', JSON.stringify({ status: current?.status, error: current?.error, eventTypes: events.map(e => e.type) }));
    expect(current?.status).toBe('succeeded');
    expect(events.some(e => e.type.includes('question'))).toBe(true);
  } finally {
    await stop?.();
    await testPool?.end();
    process.env = old;
    if (created) await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
    const after = await snapshot(); await admin.end(); expect(after).toBe(before);
  }
}, 240000);
