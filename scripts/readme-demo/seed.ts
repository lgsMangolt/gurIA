import { Pool } from 'pg';
import { validateReferences, workspaceSchema } from '../../lib/study/domain';
import { buildDemoWorkspace } from './fixture';

// Só grava no banco isolado da demo (porta 5441) e no proprietário da demo.
// Usa a mesma tabela de lib/study/store.ts, sem importar o provedor do OpenMAIC.
async function main() {
  const url = process.env.DATABASE_URL || '';
  const owner = process.env.OWNER_SINGLE_USER_ID || '';
  if (!/127\.0\.0\.1:5441\//.test(url) || owner !== 'readme-demo') {
    throw new Error(
      'Seed recusado: use o banco 5441 e OWNER_SINGLE_USER_ID=readme-demo (veja up.mjs).',
    );
  }
  const data = workspaceSchema.parse(buildDemoWorkspace());
  validateReferences(data);
  const pool = new Pool({ connectionString: url });
  try {
    await pool.query(
      'CREATE TABLE IF NOT EXISTS study_workspace (owner_id text PRIMARY KEY, revision integer NOT NULL DEFAULT 0, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())',
    );
    const { rows } = await pool.query(
      'INSERT INTO study_workspace(owner_id,revision,data) VALUES($1,1,$2) ON CONFLICT(owner_id) DO UPDATE SET revision=study_workspace.revision+1,data=EXCLUDED.data,updated_at=now() RETURNING revision',
      [owner, JSON.stringify(data)],
    );
    console.log('Seed sintético gravado para', owner, 'na revisão', rows[0].revision);
  } finally {
    await pool.end();
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
