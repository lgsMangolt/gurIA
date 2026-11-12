import { randomUUID, createHash } from 'node:crypto';
import fs from 'node:fs';
import { parseEnv } from 'node:util';
import pg from 'pg';
import { expect, it } from 'vitest';
import { ensureAgentSessionSchema, PgAgentSessionStore } from '@openmaic/storage/agent-session/pg';
import { nodePostgresTransaction } from '@/lib/server/agent-runtime/store';

// Explicit opt-in: a disposable database is created and deleted, never the user's database.
it.skipIf(process.env.GURIA_PRO_DB_TEST !== '1')('isolates the Pro queue from existing sessions', async () => {
  const env: Record<string, string> = {};
  for (const file of ['.env', '.env.local']) if (fs.existsSync(file)) Object.assign(env, parseEnv(fs.readFileSync(file, 'utf8')));
  const url = process.env.DATABASE_URL || env.DATABASE_URL;
  if (!url) throw new Error('Banco indisponível.');
  const admin = new pg.Pool({ connectionString: url });
  const name = `guria_pro_test_${randomUUID().replaceAll('-', '')}`;
  if (!/^guria_pro_test_[0-9a-f]{32}$/.test(name)) throw new Error('Nome de teste inválido.');
  const hash = async () => createHash('sha256').update(JSON.stringify((await admin.query('SELECT owner_id,revision,data,updated_at FROM study_workspace ORDER BY owner_id')).rows)).digest('hex');
  const before = await hash();
  let created = false;
  let pool: pg.Pool | undefined;
  try {
    await admin.query(`CREATE DATABASE ${name}`);
    created = true;
    const testUrl = new URL(url);
    testUrl.pathname = `/${name}`;
    pool = new pg.Pool({ connectionString: testUrl.toString() });
    const tables = { sessions: 'guria_pro_sessions', events: 'guria_pro_events', entries: 'guria_pro_entries', ownerEventCounters: 'guria_pro_owner_counters', ownerEvents: 'guria_pro_owner_events', urls: 'guria_pro_urls' };
    await ensureAgentSessionSchema(pool);
    await ensureAgentSessionSchema(pool, tables);
    const withTransaction = nodePostgresTransaction(pool);
    const normal = new PgAgentSessionStore(pool, { withTransaction });
    const local = new PgAgentSessionStore(pool, { tableNames: tables, withTransaction });
    await normal.createSession({ id: 'other-provider', ownerId: 'owner', prompt: 'synthetic' });
    await local.createSession({ id: 'codex-only', ownerId: 'owner', prompt: 'synthetic' });
    const claim = await local.claimNextSession('test-worker', 123, { leaseTtlMs: 10000, maxAttempts: 3 });
    expect(claim?.id).toBe('codex-only');
    expect((await normal.getSession('other-provider'))?.status).toBe('queued');
    expect(await local.getSession('other-provider')).toBeNull();
    expect(await normal.getSession('codex-only')).toBeNull();
  } finally {
    await pool?.end();
    if (created) await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
    const after = await hash();
    await admin.end();
    expect(after).toBe(before);
  }
}, 120000);
