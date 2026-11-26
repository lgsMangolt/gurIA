import type { Generate } from '../exercises/grade-ai';
import {
  buildConceptsBlock,
  buildManifest,
  buildReferenceFiles,
  buildSkillReadme,
  replaceConceptsBlock,
  type Manifest,
  type SkillConceptSnapshot,
} from './content';
import { draftWithAi } from './draft';
import { diffConcepts, diffLines, type DiffRow } from './diff';
import { scanSensitive, type Finding } from './sensitive';

export const MANIFEST_PATH = '.guria/manifest.json';

export type Proposal = {
  slug: string;
  version: number;
  previous: Record<string, string>;
  next: Record<string, string>;
  changes: ReturnType<typeof diffConcepts>;
  diffs: Record<string, DiffRow[]>;
  warnings: Finding[];
  empty: boolean;
};

export function proposeVersion(args: {
  slug: string;
  name: string;
  manifest?: Manifest;
  previousFiles: Record<string, string>;
  snaps: SkillConceptSnapshot[];
  includeAnswers: boolean;
  skillMd: string;
  intro: string;
  now: string;
}): Proposal {
  const { slug, name, manifest, previousFiles, snaps } = args;
  const version = manifest ? manifest.version + 1 : 1;
  const newManifest = buildManifest({
    slug,
    name,
    version,
    snaps,
    includeAnswers: args.includeAnswers,
    now: args.now,
    createdAt: manifest?.createdAt,
  });
  const next: Record<string, string> = {
    'SKILL.md': replaceConceptsBlock(args.skillMd, buildConceptsBlock(snaps)),
    'README.md': buildSkillReadme({ name, slug, intro: args.intro, snaps }),
    ...buildReferenceFiles(snaps),
    [MANIFEST_PATH]: JSON.stringify(newManifest, null, 2) + '\n',
  };
  // Só conta o que a skill gerou: referências que o dono acrescentou à mão não entram no diff.
  const owned = manifest
    ? new Set(['SKILL.md', 'README.md', MANIFEST_PATH, ...manifest.concepts.map((c) => c.file)])
    : undefined;
  const previous = owned
    ? Object.fromEntries(Object.entries(previousFiles).filter(([p]) => owned.has(p)))
    : previousFiles;
  const paths = [...new Set([...Object.keys(previous), ...Object.keys(next)])].sort();
  const diffs: Record<string, DiffRow[]> = {};
  for (const p of paths)
    if (previous[p] !== next[p]) diffs[p] = diffLines(previous[p] ?? '', next[p] ?? '');
  const empty = manifest !== undefined && Object.keys(diffs).every((p) => p === MANIFEST_PATH);
  return {
    slug,
    version,
    previous,
    next,
    changes: diffConcepts(manifest?.concepts ?? [], snaps),
    diffs,
    warnings: scanSensitive(next),
    empty,
  };
}

/** Texto introdutório do README anterior (entre o título e "## Conceitos incluídos"). */
export function introFromReadme(readme: string | undefined): string {
  if (!readme) return '';
  const lines = readme.split('\n');
  const end = lines.findIndex((l) => l.startsWith('## '));
  return lines
    .slice(1, end === -1 ? undefined : end)
    .join('\n')
    .trim();
}

export function improveWithoutAi(args: {
  previousSkillMd: string;
  snaps: SkillConceptSnapshot[];
}): string {
  return replaceConceptsBlock(args.previousSkillMd, buildConceptsBlock(args.snaps));
}

export async function improveWithAi(args: {
  slug: string;
  name: string;
  snaps: SkillConceptSnapshot[];
  manifest: Manifest;
  previousFiles: Record<string, string>;
  generate: Generate;
  harness: 'codex' | 'claude';
  model?: string;
}): Promise<{ skillMd: string; intro: string }> {
  return draftWithAi({
    slug: args.slug,
    name: args.name,
    snaps: args.snaps,
    generate: args.generate,
    harness: args.harness,
    model: args.model,
    previousSkillMd: args.previousFiles['SKILL.md'] ?? '',
    diff: diffConcepts(args.manifest.concepts, args.snaps),
  });
}
