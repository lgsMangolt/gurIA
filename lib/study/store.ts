import os from 'node:os';
import { studyPool, type Queryable } from './db';
import { writeReviewSummary } from './reminder';
import { studyRoot } from './storage-root';
import { emptyWorkspace, workspaceSchema, validateReferences, type Workspace } from './domain';
import { AppError } from './runtime/analysis';

export { studyPool };
export async function readWorkspace(owner: string): Promise<{ revision: number; data: Workspace }> {
  const pool = await studyPool();
  const result = await pool.query('SELECT revision,data FROM study_workspace WHERE owner_id=$1', [
    owner,
  ]);
  return result.rows[0]
    ? { revision: result.rows[0].revision, data: workspaceSchema.parse(result.rows[0].data) }
    : { revision: 0, data: emptyWorkspace() };
}
export async function saveWorkspace(owner: string, revision: number, raw: unknown) {
  const data = workspaceSchema.parse(raw);
  validateReferences(data);
  const pool = await studyPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await saveWorkspaceInTransaction(client, owner, revision, data);
    await client.query('COMMIT');
    try {
      // Aviso do Windows lê este resumo com o app fechado; falhar aqui nunca desfaz o salvamento.
      writeReviewSummary(studyRoot(process.env.LOCALAPPDATA || os.homedir(), owner), data);
    } catch {}
    return { revision: revision + 1, data };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
export async function saveWorkspaceInTransaction(
  client: Queryable,
  owner: string,
  revision: number,
  raw: unknown,
) {
  const data = workspaceSchema.parse(raw);
  validateReferences(data);
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['study:' + owner]);
  const existing: { rows: { revision: number }[] } = await client.query(
    'SELECT revision FROM study_workspace WHERE owner_id=$1 FOR UPDATE',
    [owner],
  );
  if ((existing.rows[0]?.revision || 0) !== revision)
    throw new AppError(
      409,
      'REVISION_CONFLICT',
      'Outra aba alterou seus estudos. Recarregue antes de salvar; a edição local foi preservada.',
    );
  await client.query(
    'INSERT INTO study_workspace(owner_id,revision,data) VALUES($1,$2,$3) ON CONFLICT(owner_id) DO UPDATE SET revision=EXCLUDED.revision,data=EXCLUDED.data,updated_at=now()',
    [owner, revision + 1, JSON.stringify(data)],
  );
}
