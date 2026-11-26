import { createHash } from 'node:crypto';
import type { Workspace } from '../domain';
import { AppError } from '../runtime/analysis';
import { isEligible } from './eligible';
import { conceptFileName } from './names';

export type SkillConceptSnapshot = {
  id: string;
  label: string;
  summary: string;
  note: string;
  evidence: string[];
  examples: string[];
};

export type Manifest = {
  schema: 'gurIA-skill-v1';
  slug: string;
  name: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  includeAnswers: boolean;
  concepts: { id: string; label: string; hash: string; file: string }[];
};

export const CONCEPTS_START = '<!-- gurIA:conceitos:inicio -->';
export const CONCEPTS_END = '<!-- gurIA:conceitos:fim -->';
export const MAX_CONCEPTS = 40;
/** Marca o README raiz gerado pela gurIA: sem a marca, o README é do dono e não é sobrescrito. */
export const ROOT_README_MARKER = '<!-- gurIA:indice -->';
export const MAX_SKILL_LINES = 400;
export const MAX_SKILL_CHARS = 30000;
export const MAX_REFERENCE_CHARS = 20000;

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();
export const referencePath = (c: { id: string; label: string }) =>
  'references/' + conceptFileName(c);

/** Dados da skill: só texto. Nada de mediaUrl, courseId ou caminhos. */
export function snapshotConcepts(
  ws: Workspace,
  ids: string[],
  opts: { includeAnswers: boolean },
): SkillConceptSnapshot[] {
  if (ids.length > MAX_CONCEPTS)
    throw new AppError(
      400,
      'MUITOS_CONCEITOS',
      `Escolha no máximo ${MAX_CONCEPTS} conceitos por skill.`,
    );
  const strip = (t: string) => t.replace(/<!--|-->/g, '');
  return [...new Set(ids)].map((id) => {
    const c = ws.concepts.find((x) => x.id === id);
    if (!c || !isEligible(c))
      throw new AppError(
        409,
        'CONCEITO_NAO_DOMINADO',
        'Só conceitos dominados sem ajuda podem entrar em uma skill.',
      );
    const examples = opts.includeAnswers
      ? ws.submissions
          .filter(
            (s) =>
              s.conceptId === id &&
              s.state === 'corrigida' &&
              s.result?.correct === true &&
              s.answer.type === 'escrita',
          )
          .sort((a, b) => (b.gradedAt ?? 0) - (a.gradedAt ?? 0))
          .slice(0, 2)
          .map((s) => (s.answer.type === 'escrita' ? strip(s.answer.text.slice(0, 600)) : ''))
          .filter(Boolean)
      : [];
    return {
      id: c.id,
      label: strip(c.label),
      summary: strip(c.summary),
      note: strip(c.note),
      evidence: c.evidence
        .map((e) => strip(e.text).trim().slice(0, 500))
        .filter(Boolean)
        .slice(0, 5),
      examples,
    };
  });
}

export function conceptHash(s: SkillConceptSnapshot): string {
  return createHash('sha256')
    .update(JSON.stringify([s.label, s.summary, s.note, s.evidence]))
    .digest('hex')
    .slice(0, 16);
}

export function buildReferenceFiles(snaps: SkillConceptSnapshot[]): Record<string, string> {
  const files: Record<string, string> = {};
  for (const s of snaps) {
    const parts = [`# ${oneLine(s.label)}`, '', s.summary.trim() || '(sem resumo)'];
    if (s.note.trim()) parts.push('', '## Anotações', '', s.note.trim());
    if (s.evidence.length)
      parts.push('', '## Evidências', '', ...s.evidence.map((e) => '> ' + oneLine(e)));
    if (s.examples.length)
      parts.push('', '## Exemplos do aluno', '', ...s.examples.map((e) => '> ' + oneLine(e)));
    files[referencePath(s)] = parts.join('\n').slice(0, MAX_REFERENCE_CHARS) + '\n';
  }
  return files;
}

export function buildConceptsBlock(snaps: SkillConceptSnapshot[]): string {
  const lines = snaps.map(
    (s) =>
      `- [${oneLine(s.label)}](${referencePath(s)}): ${oneLine(s.summary).slice(0, 160) || 'sem resumo'}`,
  );
  return [CONCEPTS_START, '## Conceitos', '', ...lines, CONCEPTS_END].join('\n');
}

export function replaceConceptsBlock(skillMd: string, block: string): string {
  const start = skillMd.indexOf(CONCEPTS_START);
  const end = start === -1 ? -1 : skillMd.indexOf(CONCEPTS_END, start);
  if (start !== -1 && end > start)
    return skillMd.slice(0, start) + block + skillMd.slice(end + CONCEPTS_END.length);
  const refs = skillMd.indexOf('## Referências');
  if (refs !== -1) return skillMd.slice(0, refs) + block + '\n\n' + skillMd.slice(refs);
  return skillMd.replace(/\s*$/, '') + '\n\n' + block + '\n';
}

export function frontmatter(name: string, description: string): string {
  return `---\nname: ${name}\ndescription: ${JSON.stringify(oneLine(description).slice(0, 1024))}\n---`;
}

export const templateIntro = (count: number): string =>
  `Conhecimento reunido por quem estudou e dominou estes ${count} conceitos, com anotações e evidências nos arquivos de referência.`;

export function templateSkillMd(args: {
  slug: string;
  name: string;
  description?: string;
  snaps: SkillConceptSnapshot[];
}): string {
  const { slug, name, snaps } = args;
  const labels = snaps.slice(0, 5).map((s) => oneLine(s.label));
  const description =
    args.description ||
    `Use quando a tarefa envolver ${labels.join(', ')}${snaps.length > 5 ? ' e outros conceitos' : ''}: ${snaps.length} conceitos dominados sobre ${oneLine(name)}.`;
  return [
    frontmatter(slug, description),
    '',
    `# ${oneLine(name)}`,
    '',
    templateIntro(snaps.length),
    '',
    '## Quando usar',
    '',
    ...labels.map((l) => `- Quando a tarefa envolver ${l}.`),
    '',
    '## Como aplicar',
    '',
    '- Leia o resumo do conceito na lista abaixo e abra a referência quando precisar de detalhes.',
    '- Responda com base nas anotações e evidências; diga quando algo não estiver coberto.',
    '',
    buildConceptsBlock(snaps),
    '',
    '## Referências',
    '',
    'Cada conceito tem um arquivo em `references/` com resumo, anotações e evidências.',
    '',
  ].join('\n');
}

export function parseSkillMd(
  md: string,
): { name: string; description: string; body: string } | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(md);
  if (!match) return null;
  const fields: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_-]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    let value = kv[2].trim();
    if (value.startsWith('"')) {
      try {
        value = JSON.parse(value);
      } catch {
        value = value.replace(/^"|"$/g, '');
      }
    }
    fields[kv[1]] = value;
  }
  return {
    name: fields.name ?? '',
    description: fields.description ?? '',
    body: md.slice(match[0].length),
  };
}

/** O frontmatter precisa ser lido igual por um YAML de verdade: description sempre entre aspas duplas. */
function yamlProblems(md: string): string[] {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(md)?.[1] ?? '';
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const line of block.split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (/^\s*#/.test(line)) {
      problems.push('O frontmatter não pode ter comentários (#).');
      continue;
    }
    const kv = /^([A-Za-z_-]+):\s*(.*)$/.exec(line);
    if (!kv) {
      problems.push('Cada linha do frontmatter deve ser "chave: valor" em uma só linha.');
      continue;
    }
    if (seen.has(kv[1])) problems.push(`A chave ${kv[1]} está repetida no frontmatter.`);
    seen.add(kv[1]);
    if (kv[1] === 'description' && !/^"(?:[^"\\]|\\.)*"$/.test(kv[2].trim()))
      problems.push('Escreva a description entre aspas duplas ("...").');
    if (kv[1] === 'name' && !/^[a-z0-9-]+$/.test(kv[2].trim()))
      problems.push('O name deve ter só letras minúsculas, números e hífens.');
  }
  return problems;
}

export function validateSkillMd(md: string, slug: string): string[] {
  const errors: string[] = [];
  const parsed = parseSkillMd(md);
  if (!parsed)
    return ['O SKILL.md precisa começar com um bloco de frontmatter (---) com name e description.'];
  errors.push(...yamlProblems(md));
  if (parsed.name !== slug) errors.push(`O campo name do frontmatter deve ser "${slug}".`);
  if (!parsed.description.trim())
    errors.push('O campo description do frontmatter não pode ficar vazio.');
  if (parsed.description.length > 1024)
    errors.push('O campo description pode ter no máximo 1.024 caracteres.');
  if (md.split('\n').length > MAX_SKILL_LINES)
    errors.push(`O SKILL.md pode ter no máximo ${MAX_SKILL_LINES} linhas.`);
  if (md.length > MAX_SKILL_CHARS)
    errors.push(`O SKILL.md pode ter no máximo ${MAX_SKILL_CHARS} caracteres.`);
  return errors;
}

export function buildSkillReadme(args: {
  name: string;
  slug: string;
  intro: string;
  snaps: SkillConceptSnapshot[];
}): string {
  const { name, slug, intro, snaps } = args;
  return [
    `# ${oneLine(name)}`,
    '',
    intro.trim() || 'Skill gerada pela gurIA a partir de conceitos dominados.',
    '',
    '## Conceitos incluídos',
    '',
    ...snaps.map((s) => `- ${oneLine(s.label)}`),
    '',
    '## Instalação',
    '',
    `Copie a pasta \`${slug}\` para a pasta de skills do seu agente:`,
    '',
    `- Claude Code: \`~/.claude/skills/${slug}/\``,
    `- Codex: \`~/.codex/skills/${slug}/\``,
    '',
    '## Dependências',
    '',
    'Nenhuma além do Claude Code ou do Codex. Esta skill só tem texto (`SKILL.md` e `references/`), sem scripts.',
    '',
    '## Atualização',
    '',
    'A skill é gerada e melhorada pela gurIA. Para atualizar, copie a pasta de novo depois de uma nova versão.',
    '',
  ].join('\n');
}

export function buildRootReadme(
  skills: { slug: string; name: string; version: number; description: string; count: number }[],
  destinationName: string,
): string {
  const sorted = [...skills].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  return [
    ROOT_README_MARKER,
    `# ${destinationName}`,
    '',
    'Skills geradas pela gurIA a partir de conceitos dominados. Cada pasta é uma skill com `SKILL.md`, `README.md` e `references/`.',
    '',
    '## Skills',
    '',
    sorted.length
      ? '| Skill | Versão | Conceitos | Descrição |\n|---|---|---|---|'
      : '(nenhuma skill ainda)',
    ...sorted.map(
      (s) =>
        `| [${s.slug}](${s.slug}/) | v${s.version} | ${s.count} | ${oneLine(s.description).replace(/\|/g, '\\|').slice(0, 160)} |`,
    ),
    '',
    '## Instalação',
    '',
    'Copie a pasta da skill desejada para a pasta de skills do seu agente:',
    '',
    '- Claude Code: `~/.claude/skills/<skill>/`',
    '- Codex: `~/.codex/skills/<skill>/`',
    '',
    'As skills não têm dependências além do próprio agente.',
    '',
  ].join('\n');
}

export function buildManifest(args: {
  slug: string;
  name: string;
  version: number;
  snaps: SkillConceptSnapshot[];
  includeAnswers: boolean;
  now: string;
  createdAt?: string;
}): Manifest {
  return {
    schema: 'gurIA-skill-v1',
    slug: args.slug,
    name: args.name,
    version: args.version,
    createdAt: args.createdAt ?? args.now,
    updatedAt: args.now,
    includeAnswers: args.includeAnswers,
    concepts: args.snaps.map((s) => ({
      id: s.id,
      label: s.label,
      hash: conceptHash(s),
      file: referencePath(s),
    })),
  };
}
