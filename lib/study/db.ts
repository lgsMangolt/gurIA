// Conexão da gurIA com o PostgreSQL: um pool por processo, a partir de DATABASE_URL.
// Substitui o provedor de persistência do OpenMAIC, que abria lojas de aulas,
// assets e runtime que a gurIA não usa. Só cria a tabela study_workspace; as
// tabelas antigas do OpenMAIC, se existirem, ficam como estão.
import { Pool } from 'pg';

/**
 * O mínimo que o código de estudo usa de um pool ou de um cliente em transação.
 * As linhas saem sem tipo, para aceitar qualquer cliente (pg, ou a transação
 * da loja de documentos antiga); quem lê diz o formato que espera.
 */
export type Queryable = {
  query(text: string, params?: unknown[]): Promise<{ rows: any[] }>;
};

/** Quanto esperar por uma conexão livre antes de falhar (o padrão do pg é esperar para sempre). */
export const STUDY_POOL_CONNECTION_TIMEOUT_MS = 10_000;

const CREATE_WORKSPACE_TABLE =
  'CREATE TABLE IF NOT EXISTS study_workspace (owner_id text PRIMARY KEY, revision integer NOT NULL DEFAULT 0, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())';

type PoolState = { connectionString?: string; pool?: Promise<Pool> };
// Guardado no globalThis para o recarregamento do Next em dev não abrir pools novos.
const STATE_KEY = Symbol.for('guria.study.pool');
const globalState = globalThis as typeof globalThis & { [key: symbol]: PoolState | undefined };
const state = (globalState[STATE_KEY] ??= {});

export async function studyPool(): Promise<Pool> {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString)
    throw new Error(
      'DATABASE_URL não está definida. A gurIA precisa do banco local (veja .env.local).',
    );
  if (!state.pool || state.connectionString !== connectionString) {
    state.connectionString = connectionString;
    state.pool = (async () => {
      const pool = new Pool({
        connectionString,
        connectionTimeoutMillis: STUDY_POOL_CONNECTION_TIMEOUT_MS,
      });
      // Uma conexão ociosa que o Postgres encerra (banco reiniciado ou parado)
      // emite 'error' no pool; sem ouvinte, isso derrubaria o processo. O pool
      // já descarta a conexão; a próxima consulta abre outra.
      pool.on('error', (error) => {
        console.error('[gurIA] conexão ociosa com o banco encerrada:', error.message);
      });
      await pool.query(CREATE_WORKSPACE_TABLE);
      return pool;
    })();
    // Uma falha (banco fora do ar) não fica guardada: a próxima chamada tenta de novo.
    state.pool.catch(() => {
      if (state.connectionString === connectionString) state.pool = undefined;
    });
  }
  return state.pool;
}

/** Esquece o pool atual. Só para testes. */
export function resetStudyPoolForTests(): void {
  state.pool = undefined;
  state.connectionString = undefined;
}
