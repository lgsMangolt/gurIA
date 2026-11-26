// Migra os quizzes antigos do OpenMAIC para exercícios `escolha` do workspace.
// Uso: node node_modules/tsx/dist/cli.mjs scripts/quiz-migration.ts <relatorio.json> [--apply]
//  - Sem --apply: SOMENTE LEITURA. Imprime e grava o relatório.
//  - Com --apply: grava o workspace migrado (checagem de revisão) e arquiva as perguntas originais.
// Variáveis: DATABASE_URL (obrigatória), OWNER_SINGLE_USER_ID (padrão study-local).
// Contra o banco pessoal (porta 5440), --apply exige GURIA_CONFIRM_REAL_DB=sim.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Pool } from 'pg';
import { validateReferences, workspaceSchema } from '../lib/study/domain';
import {
  applyQuizMigration,
  extractLegacyQuestions,
  planQuizMigration,
} from '../lib/study/legacy/quiz-migration';
import { studyRoot } from '../lib/study/storage-root';

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const reportFile = args.find((a) => !a.startsWith('--'));
  const url = process.env.DATABASE_URL || '';
  const owner = process.env.OWNER_SINGLE_USER_ID || 'study-local';
  if (!url || !reportFile)
    throw new Error('Uso: quiz-migration.ts <relatorio.json> [--apply] (com DATABASE_URL).');
  const port = /:(\d+)\//.exec(url)?.[1];
  if (apply && port === '5440' && process.env.GURIA_CONFIRM_REAL_DB !== 'sim')
    throw new Error('--apply no banco pessoal exige GURIA_CONFIRM_REAL_DB=sim (e backup feito).');

  const pool = new Pool({ connectionString: url });
  try {
    const row = (
      await pool.query('SELECT revision, data FROM study_workspace WHERE owner_id=$1', [owner])
    ).rows[0];
    if (!row) throw new Error(`Não há workspace para o dono ${owner}.`);
    const ws = workspaceSchema.parse(row.data);

    // As tabelas do OpenMAIC podem não existir (banco novo): então não há o que migrar.
    let stages: { id: string; name: string; scenes: { id: string; data: unknown }[] }[] = [];
    try {
      const rows = (
        await pool.query(
          `SELECT s.id, s.name FROM document_stages s JOIN stage_meta m ON m.stage_id = s.id
           WHERE m.owner_id = $1 AND m.deleted_at IS NULL ORDER BY s.created_at`,
          [owner],
        )
      ).rows as { id: string; name: string }[];
      for (const stage of rows) {
        const scenes = (
          await pool.query(
            'SELECT id, data FROM document_scenes WHERE stage_id=$1 ORDER BY scene_order',
            [stage.id],
          )
        ).rows as { id: string; data: unknown }[];
        stages.push({ id: stage.id, name: stage.name, scenes });
      }
    } catch {
      stages = [];
    }

    const questions = extractLegacyQuestions(stages);
    const plan = planQuizMigration(ws, questions);
    const report = {
      owner,
      revision: row.revision,
      stages: stages.length,
      perguntas: questions.length,
      ligadas: plan.matched.map((m) => ({
        conceito: m.conceptId,
        stage: m.question.stageName,
        pergunta: m.question.question,
      })),
      importadas: plan.imported.map((m) => ({
        conceito: m.conceptLabel,
        pergunta: m.question.question,
      })),
      puladas: plan.skipped.map((s) => ({
        motivo: s.reason,
        stage: s.question.stageName,
        pergunta: s.question.question,
      })),
    };
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    console.log(`Stages: ${report.stages} · perguntas válidas: ${report.perguntas}`);
    console.log(
      `Ligadas a conceitos: ${report.ligadas.length} · importadas: ${report.importadas.length} · puladas: ${report.puladas.length}`,
    );
    for (const reason of ['teste', 'duplicada', 'invalida', 'limite'] as const)
      console.log(
        `  puladas por ${reason}: ${plan.skipped.filter((s) => s.reason === reason).length}`,
      );
    console.log(`Relatório: ${reportFile}`);
    if (!apply) {
      console.log('Modo somente leitura. Nada foi gravado.');
      return;
    }
    if (!plan.matched.length && !plan.imported.length) {
      console.log('Nada a migrar.');
      return;
    }
    const migrated = applyQuizMigration(ws, plan);
    validateReferences(workspaceSchema.parse(migrated));
    // Arquiva as perguntas originais antes de gravar (rede de segurança).
    const archiveDir = studyRoot(process.env.LOCALAPPDATA || os.homedir(), owner);
    const archive = path.join(archiveDir, 'legacy-quizzes.json');
    if (!fs.existsSync(archive)) fs.writeFileSync(archive, JSON.stringify({ stages }, null, 2));
    const result = await pool.query(
      'UPDATE study_workspace SET data=$1, revision=revision+1, updated_at=now() WHERE owner_id=$2 AND revision=$3',
      [JSON.stringify(migrated), owner, row.revision],
    );
    if (result.rowCount !== 1)
      throw new Error(
        'A revisão mudou durante a migração (REVISION_CONFLICT). Nada foi gravado; tente de novo.',
      );
    console.log(
      `Migração gravada (revisão ${row.revision} → ${row.revision + 1}). Arquivo: ${archive}`,
    );
  } finally {
    await pool.end();
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
