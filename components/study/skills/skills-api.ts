import type { getSkillsState, previewSkill, pushState } from '@/lib/study/skills/service';
import { api } from '../shared';

export type SkillsState = Awaited<ReturnType<typeof getSkillsState>>;
export type Preview = Awaited<ReturnType<typeof previewSkill>>;
export type PushState = Awaited<ReturnType<typeof pushState>>;
export type PreviewBody = {
  slug: string;
  name: string;
  conceptIds: string[];
  includeAnswers: boolean;
  mode: 'template' | 'ai';
};
export type SaveBody = Omit<PreviewBody, 'mode'> & {
  skillMd: string;
  intro: string;
  acknowledgeWarnings: boolean;
  baseVersion: number;
};

export const loadState = () => api<SkillsState>('skill-state');
export const saveConfig = (body: {
  mode: 'separate' | 'in-repo';
  repoPath?: string;
  initRepo?: boolean;
}) => api<SkillsState>('skill-config', body, 'PUT');
export const requestPreview = (body: PreviewBody) => api<Preview>('skill-preview', body);
export const requestSave = (body: SaveBody) =>
  api<{ version: number; commit: string; paths: string[] }>('skill-save', body);
export const loadPushState = () => api<PushState>('skill-push-state');
export const requestPush = (confirmedRemote: string, confirmedHead: string) =>
  api<{ ok: true }>('skill-push', { confirmedRemote, confirmedHead });
