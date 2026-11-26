// Relatório somente leitura: compara a regra antiga de domínio com a nova sobre um JSON exportado.
// Uso: node node_modules/tsx/dist/cli.mjs scripts/mastery-impact.ts <arquivo.json>
import { readFileSync } from 'node:fs';
import { workspaceSchema } from '../lib/study/domain';
import { compareMastery } from '../lib/study/mastery-impact';

const file = process.argv[2];
if (!file) {
  console.error('Informe o arquivo JSON do workspace.');
  process.exit(1);
}
const workspace = workspaceSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
const r = compareMastery(workspace.concepts);
console.log(`Conceitos: ${r.total}`);
console.log(`Dominados pela regra antiga: ${r.before}`);
console.log(`Dominados pela regra nova: ${r.after}`);
console.log(`Perdem o domínio (${r.lost.length}):`);
for (const l of r.lost) console.log(`  - ${l}`);
console.log(`Ganham o domínio (${r.gained.length}):`);
for (const l of r.gained) console.log(`  - ${l}`);
