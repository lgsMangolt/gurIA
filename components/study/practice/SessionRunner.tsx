'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Workspace } from '@/lib/study/domain';
import { exercisesOf } from '@/lib/study/exercises/migrate';
import type { Exercise } from '@/lib/study/exercises/schema';
import type { SubmitOutcome } from '@/lib/study/exercises/submission-service';
import type { StudySession } from '@/lib/study/sessions/session-schema';
import { confidenceValue } from '@/lib/study/ui/confidence';
import { COST_NOTICE_DRAWING, costNotice, MODE_LABELS, practiceCopy } from '@/lib/study/ui/copy';
import { friendlyError } from '@/lib/study/ui/errors';
import {
  buildAnswerPayload,
  nextPendingIndex,
  nextUnansweredIndex,
  requiresCostConfirmation,
  sessionSummaryView,
  shouldAutoFinish,
  type Draft,
} from '@/lib/study/ui/payload';
import { formatRemaining, remainingMs, timerWarning } from '@/lib/study/ui/timer';
import {
  answerItem,
  finishSession,
  gradeSession,
  type BatchResult,
  type FinishResult,
} from './practice-api';
import { ChoiceExercise } from './ChoiceExercise';
import { ConfidenceSelector } from './ConfidenceSelector';
import { DrawingExercise, type DrawingHandle } from './DrawingExercise';
import { MatchExercise } from './MatchExercise';
import { WritingExercise } from './WritingExercise';

const emptyDraft = (exercise: Exercise): Draft => {
  switch (exercise.type) {
    case 'escolha':
      return { type: 'escolha', chosen: [] };
    case 'ligar':
      return { type: 'ligar', matches: {}, total: exercise.pairs.length };
    case 'escrita':
      return { type: 'escrita', text: '' };
    default:
      return { type: 'desenho' };
  }
};
const errorOf = (e: unknown) => {
  const err = e as Error & { code?: string };
  return friendlyError(err.code, err.message);
};

export function SessionRunner({
  session,
  skew,
  state,
  ready,
  refresh,
  onClose,
}: {
  session: StudySession;
  skew: number;
  state: Workspace;
  ready: boolean;
  refresh: () => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState(session.items);
  const [index, setIndex] = useState(() => Math.max(0, nextPendingIndex(session)));
  const [view, setView] = useState<'item' | 'summary'>(
    nextPendingIndex(session) === -1 ? 'summary' : 'item',
  );
  const [confidence, setConfidence] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [outcome, setOutcome] = useState<SubmitOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [live, setLive] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [finished, setFinished] = useState<FinishResult | null>(null);
  const [batch, setBatch] = useState<BatchResult | null>(null);
  const [confirmGrade, setConfirmGrade] = useState(false);
  const [drawing, setDrawing] = useState<DrawingHandle | null>(null);
  const [confirmCost, setConfirmCost] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const finishing = useRef(false);
  const timeUpFired = useRef(false);
  const warned = useRef('');
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [finishFailed, setFinishFailed] = useState(false);

  const isProva = session.mode === 'prova';
  const remaining = remainingMs(session, now, skew);
  const item = items[index];
  const exercise = useMemo(() => {
    const concept = state.concepts.find((c) => c.id === item?.conceptId);
    return concept ? exercisesOf(concept).find((e) => e.id === item?.exerciseId) : undefined;
  }, [state.concepts, item]);
  const concept = state.concepts.find((c) => c.id === item?.conceptId);
  const current = draft ?? (exercise ? emptyDraft(exercise) : null);

  useEffect(() => {
    if (!isProva) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isProva]);
  useEffect(() => {
    heading.current?.focus();
  }, [index, view]);

  const finish = async (reason?: string) => {
    if (finishing.current) return;
    finishing.current = true;
    setBusy(true);
    try {
      const result = await finishSession(session.id);
      setFinished(result);
      setFinishFailed(false);
      setConfirmEnd(false);
      setView('summary');
      if (reason) setLive(reason);
      refresh();
    } catch (e) {
      // Sem laço de repetição: mostra o erro no resumo e deixa um botão para tentar de novo.
      setError(errorOf(e));
      setFinishFailed(true);
      setView('summary');
      finishing.current = false;
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (remaining === null || view !== 'item') return;
    const level = timerWarning(remaining);
    if (level !== 'ok' && warned.current !== level) {
      warned.current = level;
      setLive(
        level === 'cinco'
          ? 'Faltam 5 minutos.'
          : level === 'um'
            ? 'Falta 1 minuto.'
            : practiceCopy.timeUp,
      );
    }
    // Só no zero, sem envio em andamento (a resposta enviada dentro do prazo não se perde) e uma vez.
    if (shouldAutoFinish({ remaining, busy, fired: timeUpFired.current })) {
      timeUpFired.current = true;
      void finish(practiceCopy.timeUp);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, view, busy]);

  const resetItem = () => {
    setConfidence('');
    setDraft(null);
    setOutcome(null);
    setDrawing(null);
    setConfirmCost(false);
    setError('');
  };
  const goSummary = () => {
    setView('summary');
    void finish();
  };
  /** Depois de responder: segue para o próximo, volta aos pulados e, sem mais itens, encerra. */
  const advance = (list = items) => {
    resetItem();
    const next = nextUnansweredIndex(list, index);
    if (next === -1) goSummary();
    else setIndex(next);
  };
  /** Pular o último item restante encerraria a sessão: na Prova isso pede confirmação. */
  const skip = () => {
    const next = nextUnansweredIndex(items, index);
    if (next === -1 && isProva) return setConfirmEnd(true);
    advance();
  };
  const requestFinish = () => {
    if (isProva) setConfirmEnd(true);
    else void finish();
  };

  const submit = async () => {
    if (!exercise || !current || busy) return;
    let draftToSend: Draft = current;
    if (exercise.type === 'desenho') {
      try {
        draftToSend = {
          type: 'desenho',
          image: drawing && !drawing.blank ? drawing.exportImage() : undefined,
        };
      } catch (e) {
        setConfirmCost(false);
        return setError((e as Error).message);
      }
    }
    setConfirmCost(false);
    const built = buildAnswerPayload({
      sessionId: session.id,
      index,
      conceptId: item.conceptId,
      exercise,
      draft: draftToSend,
      confidence: confidenceValue(confidence),
    });
    if ('error' in built) return setError(built.error);
    setBusy(true);
    setError('');
    try {
      const result = await answerItem(built.body);
      setOutcome(result);
      setItems((previous) =>
        previous.map((it, i) => (i === index ? { ...it, answeredAt: Date.now() } : it)),
      );
      setLive(isProva ? practiceCopy.registered : '');
      refresh();
    } catch (e) {
      const code = (e as Error & { code?: string }).code;
      if (code === 'ITEM_JA_RESPONDIDO') {
        // A resposta já chegou ao servidor (rede instável): marca como respondido e segue.
        const marked = items.map((it, i) => (i === index ? { ...it, answeredAt: Date.now() } : it));
        setItems(marked);
        advance(marked);
      } else if (code === 'PROVA_ENCERRADA' || code === 'SESSAO_ENCERRADA') {
        setError(errorOf(e));
        goSummary();
      } else setError(errorOf(e));
    } finally {
      setBusy(false);
    }
  };

  const grade = async () => {
    setBusy(true);
    setError('');
    setConfirmGrade(false);
    try {
      setBatch(await gradeSession(session.id));
      refresh();
    } catch (e) {
      setError(errorOf(e));
    } finally {
      setBusy(false);
    }
  };

  const timer =
    remaining !== null ? (
      <p className={`guria-practice-timer ${timerWarning(remaining)}`}>
        Tempo restante: <strong>{formatRemaining(remaining)}</strong>
      </p>
    ) : null;

  if (view === 'summary') {
    const answered = items.filter((it) => it.answeredAt !== undefined).length;
    const summary = sessionSummaryView(
      finished?.summary ?? { total: items.length, answered, correct: 0, pending: 0, failed: 0 },
      session.mode,
      !!finished,
    );
    const estimate = finished?.estimate;
    const notice = estimate ? costNotice(estimate) : '';
    return (
      <section className="study-card guria-practice-summary" aria-label={practiceCopy.summaryTitle}>
        <h2 ref={heading} tabIndex={-1}>
          {practiceCopy.summaryTitle} · {MODE_LABELS[session.mode].title}
        </h2>
        <p>
          Respondidos: {summary.answered} de {summary.total}
          {summary.correct !== undefined ? ` · Acertos: ${summary.correct}` : ''}
          {summary.pending ? ` · Pendentes de correção: ${summary.pending}` : ''}
        </p>
        {!finished && !finishFailed && <p className="study-muted">Encerrando a sessão…</p>}
        {!finished && finishFailed && (
          <button className="study-btn primary" disabled={busy} onClick={() => void finish()}>
            Tentar encerrar de novo
          </button>
        )}
        {finished && estimate && estimate.total > 0 && !batch && (
          <div>
            <p>{notice}</p>
            {!ready && (
              <p className="study-muted">Conecte uma IA nas configurações para corrigir.</p>
            )}
            {!confirmGrade ? (
              <button
                className="study-btn primary"
                disabled={busy || !ready}
                onClick={() => setConfirmGrade(true)}
              >
                {practiceCopy.gradeNow}
              </button>
            ) : (
              <div className="study-row">
                <button className="study-btn primary" disabled={busy} onClick={() => void grade()}>
                  {practiceCopy.confirmSend}
                </button>
                <button className="study-btn" onClick={() => setConfirmGrade(false)}>
                  {practiceCopy.cancel}
                </button>
              </div>
            )}
          </div>
        )}
        {batch && (
          <p role="status">
            {batch.graded} corrigidas, {batch.pending} ainda pendentes
            {batch.stoppedBy ? `. ${friendlyError(batch.stoppedBy, 'A correção parou.')}` : '.'}
          </p>
        )}
        {error && (
          <p role="alert" className="guria-practice-error">
            {error}
          </p>
        )}
        <button className="study-btn" onClick={onClose}>
          Concluir
        </button>
      </section>
    );
  }

  if (!exercise || !current || !item)
    return (
      <section className="study-card">
        <p>Este exercício não está mais disponível.</p>
        <button className="study-btn" onClick={skip}>
          {practiceCopy.skip}
        </button>
      </section>
    );

  const answered = outcome !== null;
  const result = outcome?.result;
  return (
    <section className="study-card guria-practice-run" aria-label="Sessão de estudo">
      <div className="guria-practice-head">
        <span>
          {MODE_LABELS[session.mode].title} · item {items.filter((_, i) => i <= index).length} de{' '}
          {items.length}
        </span>
        {timer}
      </div>
      <h2 ref={heading} tabIndex={-1}>
        {concept?.label}
      </h2>
      <p className="guria-practice-prompt">{exercise.prompt}</p>

      {!answered && (
        <>
          <ConfidenceSelector value={confidence} onChange={setConfidence} disabled={busy} />
          {exercise.type === 'escolha' && current.type === 'escolha' && (
            <ChoiceExercise
              exercise={exercise}
              value={current.chosen}
              onChange={(chosen) => setDraft({ type: 'escolha', chosen })}
              disabled={busy}
            />
          )}
          {exercise.type === 'ligar' && (
            <MatchExercise
              key={`${index}:${exercise.id}`}
              exercise={exercise}
              sessionId={session.id}
              disabled={busy}
              onChange={(matches) =>
                setDraft({ type: 'ligar', matches, total: exercise.pairs.length })
              }
            />
          )}
          {exercise.type === 'escrita' && current.type === 'escrita' && (
            <WritingExercise
              exercise={exercise}
              value={current.text}
              onChange={(text) => setDraft({ type: 'escrita', text })}
              disabled={busy}
            />
          )}
          {exercise.type === 'desenho' && (
            <DrawingExercise
              key={`${index}:${exercise.id}`}
              exercise={exercise}
              disabled={busy}
              onChange={setDrawing}
            />
          )}
          {!ready && (exercise.type === 'escrita' || exercise.type === 'desenho') && !isProva && (
            <p className="study-muted">
              Conecte uma IA nas configurações para corrigir este tipo de exercício.
            </p>
          )}
          {confirmEnd && (
            <div
              role="alertdialog"
              aria-label="Confirmar encerramento da prova"
              className="guria-practice-confirm"
            >
              <p>
                Encerrar a prova agora? Itens sem resposta:{' '}
                {items.filter((it) => it.answeredAt === undefined).length}.
              </p>
              <div className="study-row">
                <button className="study-btn primary" disabled={busy} onClick={() => void finish()}>
                  Encerrar a prova
                </button>
                <button className="study-btn" onClick={() => setConfirmEnd(false)}>
                  Continuar a prova
                </button>
              </div>
            </div>
          )}
          {confirmCost && exercise.type === 'desenho' && (
            <div
              role="alertdialog"
              aria-label="Confirmar envio do desenho"
              className="guria-practice-confirm"
            >
              <p>{COST_NOTICE_DRAWING}</p>
              <div className="study-row">
                <button className="study-btn primary" disabled={busy} onClick={() => void submit()}>
                  {practiceCopy.confirmSend}
                </button>
                <button className="study-btn" onClick={() => setConfirmCost(false)}>
                  {practiceCopy.cancel}
                </button>
              </div>
            </div>
          )}
          <div className="study-row">
            <button
              className="study-btn primary"
              disabled={busy || (exercise.type === 'desenho' && (drawing?.blank ?? true))}
              onClick={() => {
                if (
                  exercise.type === 'desenho' &&
                  requiresCostConfirmation(session.mode, 'desenho')
                )
                  setConfirmCost(true);
                else void submit();
              }}
            >
              {practiceCopy.answer}
            </button>
            <button className="study-btn" disabled={busy} onClick={skip}>
              {practiceCopy.skip}
            </button>
            <button className="study-btn" disabled={busy} onClick={requestFinish}>
              {practiceCopy.finish}
            </button>
          </div>
        </>
      )}

      {answered && (
        <div className="guria-practice-feedback" role="status">
          {isProva ? (
            <p>{practiceCopy.registered}</p>
          ) : result ? (
            <>
              <p className={result.correct ? 'guria-practice-right' : 'guria-practice-wrong'}>
                {result.correct ? 'Correto.' : 'Ainda não.'} Nota: {Math.round(result.score * 100)}%
              </p>
              {exercise.type === 'escolha' && (
                <p>
                  Resposta certa:{' '}
                  {exercise.answerIndexes.map((i) => exercise.options[i]).join(' · ')}
                  {exercise.explanation ? ` — ${exercise.explanation}` : ''}
                </p>
              )}
              {result.feedback && <p>{result.feedback}</p>}
              {result.criteria.length > 0 && (
                <ul>
                  {result.criteria.map((c) => (
                    <li key={c.criterion}>
                      {c.criterion}: {Math.round(c.score * 100)}%
                      {c.comment ? ` — ${c.comment}` : ''}
                    </li>
                  ))}
                </ul>
              )}
              {result.missing.length > 0 && <p>Faltou: {result.missing.join('; ')}</p>}
            </>
          ) : (
            <p>
              Sua resposta foi guardada, mas a correção está{' '}
              {outcome?.state === 'falhou' ? 'com falha' : 'pendente'}.{' '}
              {outcome?.error ? friendlyError(outcome.error.code, outcome.error.message) : ''} Você
              pode reenviar em Respostas pendentes.
            </p>
          )}
          <button className="study-btn primary" onClick={() => advance()}>
            {practiceCopy.next}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="guria-practice-error">
          {error}
        </p>
      )}
      <div className="guria-practice-live" role="status" aria-live="polite">
        {live}
      </div>
    </section>
  );
}
