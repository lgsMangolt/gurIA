import type { StudyMode } from '@/lib/study/domain';
import type { SubmitOutcome } from '@/lib/study/exercises/submission-service';
import type { StudySession } from '@/lib/study/sessions/session-schema';
import type { AnswerBody } from '@/lib/study/ui/payload';
import { api } from '../shared';

export type SessionSummary = {
  total: number;
  answered: number;
  correct: number;
  pending: number;
  failed: number;
};
export type Estimate = { writings: number; drawings: number; total: number; overLimit: boolean };
export type FinishResult = { session: StudySession; summary: SessionSummary; estimate: Estimate };
export type BatchResult = {
  graded: number;
  pending: number;
  failed: number;
  stoppedBy?: string;
};

export const startSession = (args: { id: string; mode: StudyMode; conceptIds?: string[] }) =>
  api<{ session: StudySession; revision: number; now: number }>('session-start', args);
export const activeSession = () =>
  api<{ session: StudySession | null; now: number }>('session-active');
export const answerItem = (body: AnswerBody) => api<SubmitOutcome>('session-answer', body);
export const finishSession = (sessionId: string) =>
  api<FinishResult>('session-finish', { sessionId });
export const gradeSession = (sessionId: string) => api<BatchResult>('session-grade', { sessionId });

export type PendingResponse = {
  items: import('@/lib/study/ui/pending').PendingItem[];
  estimate: Estimate;
};
export const pendingList = () => api<PendingResponse>('exercise-pending');
export const regradeItem = (id: string) => api<SubmitOutcome>('exercise-regrade', { id });
export const discardItem = (id: string) => api<{ revision: number }>('exercise-discard', { id });
export const gradeBatch = (ids: string[]) =>
  api<BatchResult>('exercise-grade-batch', { ids: ids.slice(0, 50) });
