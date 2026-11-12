'use client';
import { useEffect, useState } from 'react';
import type { Workspace } from '@/lib/study/domain';
import type { ImprovementEvent, Variant } from '@/lib/study/improvement';
import { intakeSchema, studyPlanSchema, type StudyPlan } from '@/lib/study/intake';
import { api, Field } from './shared';
import { StudySkeleton } from './StudySkeleton';
type Draft = {
  topic: string;
  questions: Array<{ question: string; options: string[] }>;
  answers: string[];
  level: 'beginner' | 'some' | 'advanced';
  format: 'explanation' | 'practice' | 'mixed';
  minutes: number;
  plan: StudyPlan | null;
  provider: string;
  questionVariant: Variant;
  questionExposure: string;
};
const fresh = (): Draft => ({
  topic: '',
  questions: [],
  answers: [],
  level: 'beginner',
  format: 'mixed',
  minutes: 30,
  plan: null,
  provider: '',
  questionVariant: 'baseline',
  questionExposure: '',
});
export function Studies({
  conversationTopic,
  clearConversationTopic,
  reading,
  setReading,
  state,
  revision,
  harness,
  ready,
  setSnapshot,
  notify,
  openMap,
  openMaterials,
  openPlan,
  openPractice,
  review,
  recordImprovement,
}: {
  conversationTopic: string;
  clearConversationTopic: () => void;
  reading: string;
  setReading: (id: string) => void;
  state: Workspace;
  revision: number;
  harness: string;
  ready: boolean;
  setSnapshot: (s: { data: Workspace; revision: number }) => void;
  notify: (s: string) => void;
  openMap: (id: string, nodeId?: string) => void;
  openMaterials: () => void;
  openPlan: () => void;
  openPractice: (stageId: string, title: string) => void;
  review: (id: string) => void;
  recordImprovement: (event: ImprovementEvent) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Draft>(fresh),
    [hydrated, setHydrated] = useState(false),
    [busy, setBusy] = useState(false),
    [filter, setFilter] = useState('all');
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem('guria-study-draft') || 'null');
      if (
        v &&
        typeof v.topic === 'string' &&
        Array.isArray(v.questions) &&
        Array.isArray(v.answers)
      )
        setDraft({ ...fresh(), ...v });
    } catch {}
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (hydrated)
      try {
        localStorage.setItem('guria-study-draft', JSON.stringify(draft));
      } catch {}
  }, [draft, hydrated]);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const intake = () =>
    intakeSchema.parse({
      topic: draft.topic,
      goal: (draft.answers.join('; ') || draft.topic).slice(0, 1000),
      level: draft.level,
      format: draft.format,
      minutes: draft.minutes,
      answers: draft.questions.map((q, i) => ({
        question: q.question,
        answer: draft.answers[i] || '',
      })),
    });
  const selected = state.courses.find((c) => c.id === reading);
  const nodes = state.concepts.filter((n) => n.courseIds.includes(reading));
  return (
    <div className="guria-studies">
      {conversationTopic && !selected && <section className="study-card"><h2>Tema vindo da conversa</h2><p>{conversationTopic}</p><p className="study-muted">Revise o tema antes de continuar. Usar este tema substitui o rascunho de estudo atual.</p><div className="study-row"><button className="study-btn primary" onClick={() => { setDraft({ ...fresh(), topic: conversationTopic }); clearConversationTopic(); }}>Usar este tema</button><button className="study-btn" onClick={clearConversationTopic}>Manter meu rascunho</button></div></section>}
      {busy && <StudySkeleton label="Preparando seu estudo…" compact />}
      {!selected && (
        <section
          className={`study-card guria-start ${!draft.questions.length ? 'guria-start-idle' : ''}`}
        >
          <h2>O que você quer estudar?</h2>
          <p className="study-muted">Escolha um tema. Vamos encontrar seu próximo passo.</p>
          <Field title="Tema ou dúvida">
            <textarea
              className="study-input"
              rows={3}
              maxLength={200}
              value={draft.topic}
              disabled={busy || !!draft.questions.length}
              placeholder="Ex.: lógica do CS50, fotografia ou como funciona uma API"
              onChange={(e) => setDraft({ ...draft, topic: e.target.value })}
            />
          </Field>
          <div className="study-row" style={{ marginTop: 16 }}>
            {!draft.questions.length && (
              <button
                className="study-btn primary"
                disabled={busy || !ready || draft.topic.trim().length < 2}
                onClick={() =>
                  void run(async () => {
                    const r = await api('studies/questions', { topic: draft.topic, harness });
                    setDraft({
                      ...draft,
                      questions: r.questions,
                      answers: r.questions.map(() => ''),
                      provider: r.harness,
                      questionVariant:
                        r.improvementVariant === 'candidate' ? 'candidate' : 'baseline',
                      questionExposure: crypto.randomUUID(),
                      plan: null,
                    });
                  })
                }
              >
                {busy ? 'Preparando perguntas…' : 'Conversar sobre o tema'}
              </button>
            )}
          </div>
          {!!draft.questions.length && (
            <div style={{ marginTop: 24 }}>
              <h3>Antes de começar</h3>
              {draft.provider !== harness && (
                <p className="study-alert">
                  A IA configurada mudou.{' '}
                  <button
                    className="study-btn"
                    onClick={() =>
                      setDraft({ ...draft, questions: [], answers: [], plan: null, provider: '' })
                    }
                  >
                    Refazer perguntas com a escolha atual
                  </button>
                </p>
              )}
              {draft.questions.map((q, i) => (
                <fieldset key={i} className="guria-question" disabled={busy}>
                  <legend>
                    {i + 1}. {q.question}
                  </legend>
                  <div className="study-options">
                    {q.options.map((o, j) => (
                      <label className="study-check" key={j}>
                        <input
                          type="radio"
                          name={'intake-' + i}
                          checked={draft.answers[i] === o}
                          onChange={() =>
                            setDraft({
                              ...draft,
                              plan: null,
                              answers: draft.answers.map((a, k) => (k === i ? o : a)),
                            })
                          }
                        />
                        {o}
                      </label>
                    ))}
                  </div>
                  <Field title="Ou escreva sua resposta">
                    <input
                      className="study-input"
                      maxLength={1000}
                      value={q.options.includes(draft.answers[i]) ? '' : draft.answers[i] || ''}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          plan: null,
                          answers: draft.answers.map((a, k) => (k === i ? e.target.value : a)),
                        })
                      }
                    />
                  </Field>
                </fieldset>
              ))}
              {draft.questionExposure && (
                <div className="study-card">
                  <p>Essas perguntas ajudaram você a definir o que quer estudar?</p>
                  {state.improvement.events.some((event) => event.id === draft.questionExposure) ? (
                    <p className="study-muted">Avaliação registrada. Obrigado!</p>
                  ) : (
                    <div className="study-row">
                      {[true, false].map((helpful) => (
                        <button
                          key={String(helpful)}
                          className="study-btn"
                          disabled={busy}
                          onClick={() =>
                            void run(() =>
                              recordImprovement({
                                id: draft.questionExposure,
                                kind: 'questions',
                                variant: draft.questionVariant,
                                helpful,
                              }),
                            )
                          }
                        >
                          {helpful ? 'Sim, ajudaram' : 'Podem melhorar'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="study-grid">
                <Field title="Sua base neste assunto">
                  <select
                    className="study-input"
                    disabled={busy}
                    value={draft.level}
                    onChange={(e) =>
                      setDraft({ ...draft, plan: null, level: e.target.value as Draft['level'] })
                    }
                  >
                    <option value="beginner">Estou começando</option>
                    <option value="some">Já conheço um pouco</option>
                    <option value="advanced">Quero aprofundar</option>
                  </select>
                </Field>
                <Field title="Como prefere aprender?">
                  <select
                    className="study-input"
                    disabled={busy}
                    value={draft.format}
                    onChange={(e) =>
                      setDraft({ ...draft, plan: null, format: e.target.value as Draft['format'] })
                    }
                  >
                    <option value="mixed">Explicação e prática</option>
                    <option value="explanation">Mais explicação e exemplos</option>
                    <option value="practice">Mais exercícios</option>
                  </select>
                </Field>
                <Field title="Tempo para esta sessão (minutos)">
                  <input
                    className="study-input"
                    disabled={busy}
                    type="number"
                    min="10"
                    max="120"
                    value={draft.minutes}
                    onChange={(e) =>
                      setDraft({ ...draft, plan: null, minutes: Number(e.target.value) })
                    }
                  />
                </Field>
              </div>
              <div className="study-row" style={{ marginTop: 16 }}>
                <button
                  className="study-btn primary"
                  disabled={
                    busy ||
                    draft.answers.some((a) => !a.trim()) ||
                    draft.provider !== harness ||
                    draft.minutes < 10 ||
                    draft.minutes > 120
                  }
                  onClick={() =>
                    void run(async () => {
                      const r = await api('studies/prepare', { intake: intake(), harness });
                      setDraft({ ...draft, plan: studyPlanSchema.parse(r.plan) });
                    })
                  }
                >
                  {busy ? 'Preparando estudo…' : 'Preparar meu estudo'}
                </button>
                <button className="study-btn" disabled={busy} onClick={() => setDraft(fresh())}>
                  Mudar tema
                </button>
              </div>
            </div>
          )}
        </section>
      )}
      {!selected && draft.plan && (
        <section className="study-card">
          <span className="study-pill">Revise antes de começar · preparado por IA</span>
          <h2>{draft.plan.title}</h2>
          <p>{draft.plan.objective}</p>
          <ol>
            {draft.plan.sections.map((s, i) => (
              <li key={i}>{s.title}</li>
            ))}
          </ol>
          <p className="study-muted">
            {draft.minutes} minutos estimados entre conteúdo, prática e revisão. O plano de estudos
            distribui a carga na sua disponibilidade.
          </p>
          <details>
            <summary>Conferir conteúdo preparado</summary>
            {draft.plan.sections.map((s, i) => (
              <article key={i}>
                <h3>{s.title}</h3>
                <p className="study-note">{s.explanation}</p>
                <p className="study-note">
                  <strong>Exemplo:</strong> {s.example}
                </p>
                <p className="study-note">
                  <strong>Prática:</strong> {s.practice}
                </p>
              </article>
            ))}
          </details>
          <button
            className="study-btn primary"
            style={{ marginTop: 16 }}
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const r = await api('studies/save', {
                  intake: intake(),
                  plan: draft.plan,
                  revision,
                });
                setSnapshot(r);
                setReading(r.courseId);
                setDraft(fresh());
              })
            }
          >
            Salvar e começar a estudar
          </button>
        </section>
      )}
      {selected && (
        <section className="study-card guria-reading-panel">
          <div className="study-row guria-section-header">
            <h2>{selected.title}</h2>
            <button className="study-btn" onClick={() => setReading('')}>
              Fechar leitura
            </button>
          </div>
          <p className="study-muted">
            Conteúdo preparado por IA: confira informações importantes e pratique antes de
            considerar aprendido.
          </p>
          <div className="study-row guria-reading-actions">
            <button className="study-btn primary" onClick={() => review(selected.id)}>
              Testar meu conhecimento
            </button>
            <button className="study-btn" onClick={() => openMap(selected.id)}>
              Ver diagrama de conceitos
            </button>
            <button className="study-btn" onClick={openPlan}>
              Ver planejamento
            </button>
            {selected.stageId && (
              <button
                className="study-btn"
                onClick={() => openPractice(selected.stageId!, selected.title)}
              >
                Praticar na gurIA
              </button>
            )}
          </div>
          {nodes.map((n, i) => (
            <article className="guria-reading" key={n.id}>
              <span className="study-pill">Parte {i + 1}</span>
              <h3>{n.label}</h3>
              <p className="study-note">{n.summary}</p>
              <p className="study-note">{n.note}</p>
              <button className="study-btn" onClick={() => openMap(selected.id, n.id)}>
                Explorar e aprofundar este conceito no mapa
              </button>
            </article>
          ))}
        </section>
      )}
      {!!state.courses.length && (
        <section className="guria-library">
          <div className="study-row guria-section-header">
            <h2>Seus estudos</h2>
            <Field title="Filtrar estudos">
              <select
                className="study-input"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">Todos os estudos</option>
                <option value="free">Aprendizados livres</option>
                <option value="courses">Cursos</option>
              </select>
            </Field>
          </div>
          <div className="study-grid">
            {state.courses
              .filter(
                (c) =>
                  filter === 'all' ||
                  (filter === 'free' ? c.learningType === 'free' : c.learningType !== 'free'),
              )
              .map((c) => (
                <article className="study-card" key={c.id}>
                  <span className="study-pill">
                    {c.learningType === 'free' ? 'Aprendizado livre' : 'Curso'}
                  </span>
                  <h3>{c.title}</h3>
                  <div className="study-row">
                    <button className="study-btn" onClick={() => setReading(c.id)}>
                      Abrir estudo
                    </button>
                    <button className="study-btn" onClick={() => openMap(c.id)}>
                      Ver mapa
                    </button>
                  </div>
                </article>
              ))}
          </div>
          {filter === 'free' && !state.courses.some((c) => c.learningType === 'free') && (
            <p className="study-muted">
              Nenhum aprendizado livre salvo ainda. Comece pelo tema que quer explorar.
            </p>
          )}
          <button className="study-btn" onClick={openMaterials}>
            Estudar a partir de uma aula ou material
          </button>
        </section>
      )}
    </div>
  );
}
