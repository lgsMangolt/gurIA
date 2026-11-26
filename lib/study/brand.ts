// Nome do produto e compatibilidade com o nome antigo (OpenMAIC Estudos).
// Backups e launchers antigos continuam funcionando durante a transição.
export const APP_NAME = 'gurIA';
export const LEGACY_APP_NAMES = ['OpenMAIC Estudos'] as const;

export const BACKUP_FORMAT = 'gurIA-v1';
export const LEGACY_BACKUP_FORMATS = ['openmaic-study-v1'] as const;

export function isKnownAppName(name: unknown): boolean {
  return name === APP_NAME || LEGACY_APP_NAMES.some((legacy) => legacy === name);
}

export function isKnownBackupFormat(format: unknown): boolean {
  return format === BACKUP_FORMAT || LEGACY_BACKUP_FORMATS.some((legacy) => legacy === format);
}

// GURIA_LOCAL é o nome novo; OPENMAIC_STUDY_LOCAL continua aceito. A nova vence quando não vazia.
export function resolveStudyLocal(env: Record<string, string | undefined>): string {
  return env.GURIA_LOCAL || env.OPENMAIC_STUDY_LOCAL || 'false';
}
