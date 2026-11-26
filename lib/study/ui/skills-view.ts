// Só importa tipos de módulos do servidor (apagados no build) e funções puras do cliente.
import type { DiffRow } from '../skills/diff';
import type { Finding } from '../skills/sensitive';
import { slugify } from '../skills/names';

export type DiffViewRow =
  | { kind: 'row'; type: DiffRow['type']; text: string }
  | { kind: 'gap'; hidden: number };

/** Recolhe trechos iguais longos, mantendo `context` linhas ao redor de cada mudança. */
export function diffRows(rows: DiffRow[], context = 3): DiffViewRow[] {
  const out: DiffViewRow[] = [];
  let i = 0;
  while (i < rows.length) {
    if (rows[i].type !== 'same') {
      out.push({ kind: 'row', type: rows[i].type, text: rows[i].text });
      i++;
      continue;
    }
    let j = i;
    while (j < rows.length && rows[j].type === 'same') j++;
    const run = rows.slice(i, j);
    const leading = i === 0;
    const trailing = j === rows.length;
    const keepHead = leading ? 0 : context;
    const keepTail = trailing ? 0 : context;
    if (run.length <= (keepHead + keepTail || 1) + context) {
      for (const r of run) out.push({ kind: 'row', type: 'same', text: r.text });
    } else {
      for (const r of run.slice(0, keepHead)) out.push({ kind: 'row', type: 'same', text: r.text });
      out.push({ kind: 'gap', hidden: run.length - keepHead - keepTail });
      for (const r of run.slice(run.length - keepTail))
        out.push({ kind: 'row', type: 'same', text: r.text });
    }
    i = j;
  }
  return out;
}

export function changeSummary(
  changes: { added: string[]; removed: string[]; changed: string[] },
  empty: boolean,
): string {
  if (empty) return 'Nada mudou desde a versão anterior.';
  const parts: string[] = [];
  if (changes.added.length)
    parts.push(`+${changes.added.length} ${changes.added.length === 1 ? 'conceito' : 'conceitos'}`);
  if (changes.removed.length) parts.push(`−${changes.removed.length}`);
  if (changes.changed.length) parts.push(`~${changes.changed.length} alterados`);
  return parts.length ? parts.join(', ') : 'Só o texto mudou.';
}

const LABELS: Record<Finding['kind'], string> = {
  chave: 'Chave ou token',
  email: 'E-mail',
  caminho: 'Caminho do computador',
  cpf: 'CPF',
  telefone: 'Telefone',
  injecao: 'Frase que parece instruir o agente',
};

export function warningRows(warnings: Finding[]) {
  return [...warnings]
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'bloqueia' ? -1 : 1))
    .map((w) => ({
      severity: w.severity,
      label: LABELS[w.kind],
      where: `${w.file}:${w.line}`,
      excerpt: w.excerpt.slice(0, 40),
    }));
}

export function canSave(state: {
  warnings: Finding[];
  acknowledged: boolean;
  skillMdErrors: string[];
  busy: boolean;
}): { ok: boolean; reason?: string } {
  if (state.busy) return { ok: false, reason: 'Aguarde a operação em andamento.' };
  if (state.skillMdErrors.length) return { ok: false, reason: state.skillMdErrors[0] };
  if (state.warnings.some((w) => w.severity === 'bloqueia'))
    return { ok: false, reason: 'Há chaves ou tokens no texto: remova-os para salvar.' };
  if (state.warnings.length && !state.acknowledged)
    return { ok: false, reason: 'Confirme que leu os avisos para salvar.' };
  return { ok: true };
}

/** Conferência leve no cliente; o servidor valida de verdade. */
export function clientSkillMdErrors(md: string, slug: string): string[] {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(md);
  if (!match)
    return ['O SKILL.md precisa começar com um bloco de frontmatter (---) com name e description.'];
  const errors: string[] = [];
  const name = /^name:\s*(.*)$/m.exec(match[1])?.[1]?.trim();
  const description = /^description:\s*(.*)$/m.exec(match[1])?.[1]?.trim().replace(/^"|"$/g, '');
  if (name !== slug) errors.push(`O campo name do frontmatter deve ser "${slug}".`);
  if (!description) errors.push('O campo description do frontmatter não pode ficar vazio.');
  return errors;
}

export const suggestSlug = (name: string): string => slugify(name);

export function pushSummary(info: { branch: string; url: string; ahead: string[] }): string {
  const n = info.ahead.length;
  return `Enviar ${n} ${n === 1 ? 'commit' : 'commits'} de ${info.branch} para ${info.url}`;
}
