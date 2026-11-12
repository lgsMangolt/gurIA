'use client';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  emptyWorkspace,
  mastery,
  recordAnswer,
  type Workspace,
  type Concept,
} from '@/lib/study/domain';
import {
  addImprovementFeedback,
  chooseImprovement,
  evaluateImprovement,
  type ImprovementEvent,
  type Variant,
} from '@/lib/study/improvement';
import { incorporateMaterial } from '@/lib/study/incorporate';
import { pt } from '@/lib/study/locale';
import { KnowledgeGraph } from './KnowledgeGraph';
import { Materials } from './Materials';
import { CoursesPlan } from './CoursesPlan';
import { Studies } from './Studies';
import { StudyChat } from './StudyChat';
import { StudyLibrary } from './StudyLibrary';
import { StudySkeleton } from './StudySkeleton';
import { useStudyNavigation, type StudyTab as Tab } from './useStudyNavigation';
import { api, Dialog, Field } from './shared';
const ClassroomSurface = dynamic(
  () => import('@/components/classroom/ClassroomSurface').then((module) => module.ClassroomSurface),
  { ssr: false, loading: () => <StudySkeleton label="Carregando revisão e prática…" /> },
);
type Snapshot = { data: Workspace; revision: number };
const sectionDescriptions: Record<Exclude<Tab, 'studies'>, string> = {
  chat: 'Converse sobre suas ideias e transforme uma delas em estudo.',
  network: 'Explore os conceitos, suas conexões e o que já está na hora de revisar.',
  materials: 'Transforme aulas e gravações em conceitos para estudar.',
  courses: 'Organize suas aulas e acompanhe o avanço de cada curso.',
  library: 'Acesse seus cursos e práticas em um só lugar.',
  plan: 'Veja o que estudar hoje e ajuste o plano ao seu tempo.',
  settings: 'Escolha sua IA, confira a transcrição e gerencie seus dados.',
};
const layouts = {
  orbita: '01 · Órbita',
  atlas: '02 · Atlas',
  caderno: '03 · Caderno',
  foco: '04 · Foco',
};
type Layout = keyof typeof layouts;
export function StudyApp() {
  const [chatTopic, setChatTopic] = useState('');
  const [proEnabled, setProEnabled] = useState(false);
  useEffect(() => {
    fetch('/api/agent/runtime').then(async (response) => {
      if (response.ok && (await response.json()).enabled === true) setProEnabled(true);
    }).catch(() => {});
  }, []);
  const { tab, reading, course, practice, navigate, canGoBack, canGoForward, goBack, goForward } =
    useStudyNavigation();
  const setTab = (value: Tab) => navigate({ tab: value, practice: null });
  const setCourse = (value: string) => navigate({ course: value });
  const [layout, setLayout] = useState<Layout>('orbita');
  useEffect(() => {
    const restoreLayout = () => {
      try {
        const chosen =
          new URLSearchParams(window.location.search).get('layout') ||
          localStorage.getItem('nexo-layout');
        if (chosen && Object.hasOwn(layouts, chosen)) {
          setLayout(chosen as Layout);
          localStorage.setItem('nexo-layout', chosen);
        }
      } catch {}
    };
    restoreLayout();
    window.addEventListener('popstate', restoreLayout);
    return () => window.removeEventListener('popstate', restoreLayout);
  }, []);
  const chooseLayout = (value: Layout) => {
    setLayout(value);
    try {
      localStorage.setItem('nexo-layout', value);
    } catch {}
    const url = new URL(window.location.href);
    url.searchParams.set('layout', value);
    window.history.replaceState(window.history.state, '', url);
  };
  const [snapshot, setSnapshot] = useState<Snapshot>({ data: emptyWorkspace(), revision: 0 }),
    [loaded, setLoaded] = useState(false),
    [loadError, setLoadError] = useState(''),
    [notice, setNotice] = useState(''),
    [search, setSearch] = useState(''),
    [mode, setMode] = useState<'2d' | '3d'>('3d'),
    [branch, setBranch] = useState(''),
    [selected, setSelected] = useState(''),
    [editing, setEditing] = useState<Concept | null>(null),
    [busy, setBusy] = useState(false),
    [quiz, setQuiz] = useState<string[]>([]),
    [answer, setAnswer] = useState<number | null>(null),
    [feedback, setFeedback] = useState(false),
    [teachingVariant, setTeachingVariant] = useState<Variant>('baseline'),
    [teachingExposure, setTeachingExposure] = useState(''),
    [application, setApplication] = useState(false),
    [response, setResponse] = useState(''),
    [grade, setGrade] = useState<any>(null),
    [deep, setDeep] = useState<any>(null),
    [settings, setSettings] = useState<any>(null);
  const current = useRef(snapshot),
    saving = useRef(false);
  current.current = snapshot;
  const notify = useCallback((message: string) => setNotice(message), []);
  const loadWorkspace = useCallback(async () => {
    setLoadError('');
    try {
      const next = await api<Snapshot>('workspace');
      setSnapshot(next);
      setLoaded(true);
    } catch (error) {
      setLoadError((error as Error).message);
    }
  }, []);
  const refreshProgress = useCallback(() => {
    void api<Snapshot>('workspace')
      .then((next) =>
        setSnapshot((previous) => (next.revision >= previous.revision ? next : previous)),
      )
      .catch((error: Error) => notify(error.message));
  }, [notify]);
  useEffect(() => {
    window.addEventListener('guria:study-progress', refreshProgress);
    return () => window.removeEventListener('guria:study-progress', refreshProgress);
  }, [refreshProgress]);
  const openPractice = (stageId: string, title: string) => {
    navigate({ practice: { stageId, title } });
  };
  useEffect(() => {
    void loadWorkspace();
    const timer = setInterval(() => notify(pt.quizReminder), 15 * 60 * 1000);
    api('health')
      .then((h) => setSettings({ harness: h.provider, model: h.model }))
      .catch(() => {});
    return () => clearInterval(timer);
  }, [notify, loadWorkspace]);
  const commit = useCallback(async (data: Workspace) => {
    if (saving.current) throw new Error('Aguarde o salvamento em andamento.');
    saving.current = true;
    try {
      const updated = await api<Snapshot>(
        'workspace',
        { data, revision: current.current.revision },
        'PUT',
      );
      current.current = updated;
      setSnapshot(updated);
    } finally {
      saving.current = false;
    }
  }, []);
  const state = snapshot.data,
    node = state.concepts.find((n) => n.id === selected);
  const visible = state.concepts.filter(
    (n) =>
      (!course ||
        (course === '__free__'
          ? !n.courseIds.length ||
            state.courses.some((c) => c.learningType === 'free' && n.courseIds.includes(c.id))
          : n.courseIds.includes(course))) &&
      (!search ||
        `${n.label} ${n.note} ${n.summary} ${n.evidence.map((e) => e.text).join(' ')}`
          .toLocaleLowerCase()
          .includes(search.toLocaleLowerCase())) &&
      (!branch ||
        n.id === branch ||
        state.connections.some(
          (e) =>
            (e.source === branch && e.target === n.id) ||
            (e.target === branch && e.source === n.id),
        )),
  );
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const settingsLoad = () => run(async () => setSettings(await api('settings')));
  const startQuiz = (nodes: Concept[]) => {
    const ids = nodes
      .filter((n) => n.question && n.due <= Date.now())
      .slice(0, 3)
      .map((n) => n.id);
    if (!ids.length) {
      notify(pt.noQuiz);
      return;
    }
    setSelected('');
    setQuiz(ids);
    setAnswer(null);
    setFeedback(false);
    setTeachingVariant(chooseImprovement(current.current.data.improvement, 'teaching'));
    setTeachingExposure(crypto.randomUUID());
  };
  const questionNode = state.concepts.find((n) => n.id === quiz[0]);
  const recordImprovement = async (event: ImprovementEvent) => {
    const latest = current.current.data;
    await commit({ ...latest, improvement: addImprovementFeedback(latest.improvement, event) });
  };
  const saveAttempt = async (
    id: string,
    correct: boolean,
    kind: 'choice' | 'application',
    score = Number(correct),
  ) => {
    const latest = current.current.data;
    await commit({
      ...latest,
      concepts: latest.concepts.map((n) =>
        n.id === id ? recordAnswer(n, correct, kind, score) : n,
      ),
    });
  };
  return (
    <div
      className="study-shell"
      data-color-mode="light"
      data-light-theme="light"
      data-layout={layout}
    >
      <aside className="study-side">
        <div className="study-brand">
          <span className="study-wordmark" role="img" aria-label="gurIA">
            <span className="study-wordmark-gur">gur</span>
            <span className="study-brand-ai">IA</span>
          </span>
        </div>
        <small>{pt.edition}</small>
        <nav className="study-navigation" aria-label="Seções de estudo">
          {(
            ['studies', 'chat', 'network', 'materials', 'courses', 'library', 'plan', 'settings'] as Tab[]
          ).map((t) => (
            <button
              key={t}
              aria-current={tab === t ? 'page' : undefined}
              className={`study-nav ${tab === t ? 'active' : ''}`}
              disabled={!loaded}
              onClick={() => {
                setTab(t);
                if (t === 'settings') void settingsLoad();
              }}
            >
              <span
                className="study-nav-icon"
                aria-hidden="true"
                style={{ maskImage: `url(/study/icons/${t === 'library' ? 'courses' : t === 'chat' ? 'studies' : t}.svg)` }}
              />
              {pt[t]}
            </button>
          ))}
          {proEnabled && <a href="/workspace" className="study-nav">Área Pro</a>}
        </nav>
        <a href="/study/layouts.html" className="nexo-design-link">
          Explorar os 4 layouts ↗
        </a>
      </aside>
      <main className="study-main">
        <nav className="guria-history" aria-label="Histórico de navegação">
          <button
            type="button"
            className="study-btn"
            disabled={!loaded || !canGoBack}
            onClick={goBack}
            title="Voltar à tela anterior"
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <path d="m14 6-6 6 6 6" />
            </svg>
            Voltar
          </button>
          <button
            type="button"
            className="study-btn"
            disabled={!loaded || !canGoForward}
            onClick={goForward}
            title="Avançar para a próxima tela do histórico"
          >
            Avançar
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <path d="m10 6 6 6-6 6" />
            </svg>
          </button>
        </nav>
        <header className={`study-header ${tab === 'studies' ? 'guria-study-header' : ''}`}>
          <div>
            <h1>{pt[tab]}</h1>
            {tab !== 'studies' && <p>{sectionDescriptions[tab]}</p>}
          </div>
          <div className="study-row nexo-header-actions">
            <details className="guria-view-options">
              <summary aria-label="Opções de aparência e configurações">Opções ···</summary>
              <div className="guria-options-panel">
                <label className="nexo-layout-control">
                  Layout
                  <select
                    aria-label="Layout da interface"
                    value={layout}
                    onChange={(e) => chooseLayout(e.target.value as Layout)}
                  >
                    {Object.entries(layouts).map(([key, name]) => (
                      <option key={key} value={key}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="study-btn"
                  onClick={() => {
                    setTab('settings');
                    void settingsLoad();
                  }}
                >
                  Configurar IA e transcrição
                </button>
              </div>
            </details>
            {tab === 'network' && (
              <button
                className="study-btn primary"
                disabled={!loaded}
                onClick={() => startQuiz(visible)}
              >
                {pt.review} · {visible.filter((n) => n.question && n.due <= Date.now()).length}
              </button>
            )}
          </div>
        </header>
        {busy && !node && !editing && !questionNode && (
          <StudySkeleton compact label="Processando sua solicitação…" />
        )}
        {notice && (
          <div
            role="status"
            className="study-alert study-row"
            style={{ justifyContent: 'space-between' }}
          >
            <span>{notice}</span>
            <button aria-label={pt.close} onClick={() => setNotice('')}>
              ×
            </button>
          </div>
        )}
        {practice && (
          <section className="guria-practice" aria-labelledby="guria-practice-title">
            <div className="study-row guria-section-header">
              <div>
                <p className="study-muted">Prática</p>
                <h2 id="guria-practice-title">{practice.title}</h2>
              </div>
              <button className="study-btn" onClick={() => navigate({ practice: null })}>
                {tab === 'courses' ? 'Voltar aos cursos' : 'Voltar à leitura'}
              </button>
            </div>
            <div className="guria-practice-player">
              <ClassroomSurface
                key={practice.stageId}
                classroomId={practice.stageId}
                variant="pane"
                embeddedStudy
              />
            </div>
          </section>
        )}
        <div hidden={!!practice}>
          {!loaded ? (
            loadError ? (
              <section className="study-card" role="alert">
                <h2>Não foi possível carregar seus estudos</h2>
                <p>{loadError}</p>
                <button className="study-btn" onClick={() => void loadWorkspace()}>
                  Tentar novamente
                </button>
              </section>
            ) : (
              <StudySkeleton label="Carregando seus estudos…" />
            )
          ) : (
            <>
              <div hidden={tab !== 'studies'}>
                <Studies
                  conversationTopic={chatTopic}
                  clearConversationTopic={() => setChatTopic('')}
                  reading={reading}
                  setReading={(value) => navigate({ reading: value, practice: null })}
                  state={state}
                  recordImprovement={recordImprovement}
                  revision={snapshot.revision}
                  harness={settings?.harness || 'codex'}
                  ready={!!settings?.harness}
                  setSnapshot={(s) => {
                    current.current = s;
                    setSnapshot(s);
                  }}
                  notify={notify}
                  openMap={(id, nodeId) => {
                    setSelected(nodeId || '');
                    navigate({ tab: 'network', course: id, practice: null });
                  }}
                  openPlan={() => setTab('plan')}
                  openMaterials={() => setTab('materials')}
                  openPractice={openPractice}
                  review={(id) => startQuiz(state.concepts.filter((n) => n.courseIds.includes(id)))}
                />
              </div>
              <div hidden={tab !== 'chat'}><StudyChat harness={settings?.harness || 'codex'} ready={!!settings?.harness} onStudy={(topic) => { setChatTopic(topic); navigate({ tab: 'studies', reading: '', practice: null }); }} /></div>
              {tab === 'network' && (
                <>
                  <div className="guria-network-tools">
                    <input
                      aria-label={pt.search}
                      className="study-input"
                      placeholder={pt.search}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    <select
                      aria-label={pt.course}
                      className="study-input"
                      value={course}
                      onChange={(e) => setCourse(e.target.value)}
                    >
                      <option value="">{pt.all}</option>
                      <option value="__free__">Aprendizados livres</option>
                      {state.courses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title}
                        </option>
                      ))}
                    </select>
                    <button
                      className="study-btn"
                      onClick={() => setMode(mode === '2d' ? '3d' : '2d')}
                    >
                      {mode === '2d' ? pt.view3d : pt.view2d}
                    </button>
                    <button
                      className="study-btn primary"
                      onClick={() =>
                        setEditing({
                          id: crypto.randomUUID(),
                          label: '',
                          summary: '',
                          note: '',
                          courseIds: course ? [course] : [],
                          origin: 'manual',
                          evidence: [],
                          attempts: [],
                          due: 0,
                        })
                      }
                    >
                      ＋ {pt.newNote}
                    </button>
                    {branch && (
                      <button className="study-btn" onClick={() => setBranch('')}>
                        {pt.expand}
                      </button>
                    )}
                  </div>
                  <KnowledgeGraph
                    nodes={visible}
                    links={state.connections}
                    mode={mode}
                    onFallback={() => setMode('2d')}
                    onSelect={(n) => setSelected(n.id)}
                  />
                  <div className="study-stats">
                    <span>
                      {visible.length} conceitos · {state.connections.length} conexões
                    </span>
                    <span>{pt.graphHelp}</span>
                  </div>
                </>
              )}
              <div hidden={tab !== 'materials'}>
                <Materials
                  selection={{
                    harness: settings?.harness || 'codex',
                    model: settings?.model || '',
                  }}
                  state={state}
                  notify={notify}
                  incorporate={async (result, id, mapping) => {
                    await commit(incorporateMaterial(current.current.data, result, id, mapping));
                    notify(pt.saved);
                  }}
                />
              </div>
              {(tab === 'courses' || tab === 'plan') && (
                <CoursesPlan
                  harness={settings?.harness || 'codex'}
                  key={tab}
                  state={state}
                  revision={snapshot.revision}
                  setSnapshot={setSnapshot}
                  commit={commit}
                  notify={notify}
                  openCourse={(id) => {
                    navigate({ tab: 'network', course: id, practice: null });
                  }}
                  planOnly={tab === 'plan'}
                  openPractice={openPractice}
                />
              )}
              {tab === 'library' && <StudyLibrary openPractice={openPractice} />}
              {tab === 'settings' && (
                <>
                  <section className="study-card guria-settings">
                    <h2>IA pela sua assinatura</h2>
                    <p className="study-note">
                      {pt.cost} A escolha vale para análise de material, avaliação e aprofundamento.
                    </p>
                    <button
                      className="study-btn"
                      disabled={busy}
                      onClick={() => void settingsLoad()}
                    >
                      {pt.connection}
                    </button>
                    {!!settings?.harnesses?.length && (
                      <div className="study-grid guria-provider-grid">
                        {settings?.harnesses?.map((h: any) => (
                          <article className="study-card" key={h.id}>
                            <h3>{h.name}</h3>
                            <p className="study-muted">
                              {h.connected
                                ? `Conectado${h.plan ? ' · ' + h.plan : ''} · uso ${h.usedPercent}%`
                                : 'Indisponível'}
                            </p>
                            {h.error && <p className="study-note">{h.error}</p>}
                            <button
                              className="study-btn"
                              disabled={busy || !h.connected || settings.harness === h.id}
                              onClick={() =>
                                void run(async () =>
                                  setSettings(await api('settings', { harness: h.id }, 'PUT')),
                                )
                              }
                            >
                              {settings.harness === h.id ? 'Selecionado' : `Usar ${h.name}`}
                            </button>
                          </article>
                        ))}
                      </div>
                    )}
                    {settings?.selected?.connected && (
                      <Field title={pt.model}>
                        <select
                          className="study-input"
                          disabled={busy}
                          value={settings.model}
                          onChange={(e) =>
                            void run(async () =>
                              setSettings(
                                await api(
                                  'settings',
                                  { harness: settings.harness, model: e.target.value },
                                  'PUT',
                                ),
                              ),
                            )
                          }
                        >
                          {settings.selected.models.map((m: any) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                    )}
                    <p className="study-muted">
                      Sem troca automática de serviço. Materiais já enviados mantêm a escolha
                      original, inclusive ao retomar. Copilot e Gemini não estão habilitados: você
                      confirmou somente as assinaturas Codex e Claude Pro. Provedores por chave de
                      API permanecem bloqueados.
                    </p>
                  </section>
                  <section className="study-card">
                    <h2>{pt.local}</h2>
                    <p className="study-muted">
                      {settings?.localReady ? pt.ready : pt.unavailable}
                    </p>
                  </section>
                  <section className="study-card">
                    <h2>Melhoria do ensino</h2>
                    <p className="study-muted">
                      O gurIA compara avaliações opcionais de duas versões. Elas indicam
                      preferência, não comprovam aprendizagem ou correção. Não são feitas chamadas
                      adicionais de IA.
                    </p>
                    {(['questions', 'teaching'] as const).map((kind) => {
                      const result = evaluateImprovement(state.improvement, kind);
                      return (
                        <p key={kind}>
                          {kind === 'questions' ? 'Perguntas iniciais' : 'Retorno da revisão'}:
                          inicial {result.baseline.positive}/{result.baseline.total} avaliações
                          positivas; alternativa {result.candidate.positive}/
                          {result.candidate.total} ·{' '}
                          {result.adopted ? 'alternativa selecionada' : 'comparação em andamento'}
                        </p>
                      );
                    })}
                    <button
                      className="study-btn"
                      disabled={busy || !state.improvement.events.length}
                      onClick={() =>
                        void run(async () => {
                          await commit({ ...current.current.data, improvement: { events: [] } });
                          notify('Avaliações de melhoria apagadas; comparação reiniciada.');
                        })
                      }
                    >
                      Apagar avaliações e reiniciar comparação
                    </button>
                  </section>
                  <section className="study-card">
                    <h2>Seus dados</h2>
                    <p className="study-muted">{pt.backupNotice}</p>
                    <div className="study-row" style={{ marginTop: 15 }}>
                      <button
                        className="study-btn"
                        onClick={() => {
                          const url = URL.createObjectURL(
                            new Blob(
                              [
                                JSON.stringify(
                                  { format: 'openmaic-study-v1', data: state },
                                  null,
                                  2,
                                ),
                              ],
                              { type: 'application/json' },
                            ),
                          );
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = 'openmaic-estudos.json';
                          a.click();
                          setTimeout(() => URL.revokeObjectURL(url), 1000);
                        }}
                      >
                        {pt.download}
                      </button>
                      <Field title={pt.importBackup}>
                        <input
                          type="file"
                          accept=".json"
                          disabled={busy}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file)
                              void run(async () => {
                                if (file.size > 10 * 1024 * 1024)
                                  throw new Error('Backup maior que 10 MB.');
                                const backup = JSON.parse(await file.text());
                                if (backup.format !== 'openmaic-study-v1')
                                  throw new Error('Formato de backup incompatível.');
                                await commit(backup.data);
                                notify(pt.saved);
                              });
                            e.target.value = '';
                          }}
                        />
                      </Field>
                    </div>
                  </section>
                </>
              )}
            </>
          )}
        </div>
        {node && !editing && !application && !deep && (
          <Dialog title={node.label} close={() => setSelected('')} busy={busy}>
            <div className="study-row">
              <span className="study-pill">{pt.origin[node.origin]}</span>
              <span className="study-pill">
                {mastery(node).mastered ? pt.mastered : pt.learning}
              </span>
            </div>
            <p className="study-note" style={{ margin: '15px 0' }}>
              {node.summary}
            </p>
            <p className="study-note">{node.note}</p>
            <div className="study-row" style={{ margin: '20px 0' }}>
              <button className="study-btn" onClick={() => setEditing({ ...node })}>
                {pt.edit}
              </button>
              <button className="study-btn" onClick={() => startQuiz([node])}>
                {pt.review}
              </button>
              <button
                className="study-btn"
                onClick={() => {
                  setApplication(true);
                  setResponse('');
                  setGrade(null);
                }}
              >
                {pt.master}
              </button>
              <button
                className="study-btn"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const result = await api('deepen', {
                      conceptId: node.id,
                      harness: settings?.harness || 'codex',
                      label: node.label,
                      note: (node.summary + '\n' + node.note).slice(0, 20000),
                    });
                    setDeep({
                      ...result,
                      branches: result.branches.map((b: any) => ({ ...b, selected: true })),
                    });
                  })
                }
              >
                {pt.deepen}
              </button>
              <button
                className="study-btn"
                onClick={() => {
                  setBranch(node.id);
                  setSelected('');
                }}
              >
                {pt.branch}
              </button>
            </div>
            <h3>{pt.evidence}</h3>
            {!node.evidence.length && <p className="study-muted">{pt.noEvidence}</p>}
            {node.evidence.map((e, i) => (
              <article className="study-card" key={i}>
                <p className="study-note">{e.text}</p>
                <p className="study-muted">
                  {Math.round(e.start)}–{Math.round(e.end)} s ·{' '}
                  {state.courses.find((c) => c.id === e.courseId)?.title || pt.none}
                </p>
                {e.mediaUrl && <video controls preload="none" src={e.mediaUrl} />}
              </article>
            ))}
            <p className="study-muted">
              {node.attempts.length} respostas · {mastery(node).days} dias com acertos. O domínio
              exige revisão espaçada e aplicação.
            </p>
          </Dialog>
        )}
        {editing && (
          <Dialog title={pt.edit} close={() => setEditing(null)} busy={busy}>
            <Field title={pt.noteTitle}>
              <input
                autoFocus
                className="study-input"
                value={editing.label}
                onChange={(e) => setEditing({ ...editing, label: e.target.value })}
              />
            </Field>
            <Field title={pt.noteBody}>
              <textarea
                className="study-input"
                value={editing.note}
                onChange={(e) => setEditing({ ...editing, note: e.target.value })}
              />
            </Field>
            <p className="study-muted" style={{ margin: '15px 0' }}>
              {pt.shared}
            </p>
            {state.courses.map((c) => (
              <label key={c.id} className="study-check">
                <input
                  type="checkbox"
                  checked={editing.courseIds.includes(c.id)}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      courseIds: e.target.checked
                        ? [...editing.courseIds, c.id]
                        : editing.courseIds.filter((id) => id !== c.id),
                    })
                  }
                />
                {c.title}
              </label>
            ))}
            <footer>
              <button
                className="study-btn primary"
                disabled={busy || !editing.label.trim()}
                onClick={() =>
                  void run(async () => {
                    const exists = state.concepts.some((n) => n.id === editing.id);
                    await commit({
                      ...state,
                      concepts: exists
                        ? state.concepts.map((n) => (n.id === editing.id ? editing : n))
                        : [...state.concepts, editing],
                    });
                    setEditing(null);
                    notify(pt.saved);
                  })
                }
              >
                {pt.save}
              </button>
            </footer>
          </Dialog>
        )}
        {questionNode?.question && (
          <Dialog title={pt.quiz} close={() => setQuiz([])} busy={busy}>
            <h3>{questionNode.question.question}</h3>
            <div className="study-options" style={{ margin: '20px 0' }}>
              {questionNode.question.options.map((option, i) => (
                <button
                  key={i}
                  className={`study-btn ${answer === i ? 'primary' : ''}`}
                  disabled={feedback || busy}
                  onClick={() => setAnswer(i)}
                >
                  {String.fromCharCode(65 + i)}. {option}
                </button>
              ))}
            </div>
            {feedback && (
              <div className="study-alert">
                <strong>
                  {answer === questionNode.question.answerIndex ? pt.correct : pt.incorrect}
                </strong>
                <p>{questionNode.question.explanation}</p>
                {teachingVariant === 'candidate' && questionNode.summary.trim() && (
                  <details>
                    <summary>Rever o conceito</summary>
                    <p className="study-note">{questionNode.summary}</p>
                  </details>
                )}
                <p>Este retorno ajudou você a entender a resposta?</p>
                {state.improvement.events.some((event) => event.id === teachingExposure) ? (
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
                              id: teachingExposure,
                              kind: 'teaching',
                              variant: teachingVariant,
                              helpful,
                            }),
                          )
                        }
                      >
                        {helpful ? 'Sim, ajudou' : 'Pode melhorar'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <footer>
              <button
                className="study-btn primary"
                disabled={busy || answer === null}
                onClick={() =>
                  feedback
                    ? (setQuiz((q) => q.slice(1)),
                      setAnswer(null),
                      setFeedback(false),
                      setTeachingVariant(
                        chooseImprovement(current.current.data.improvement, 'teaching'),
                      ),
                      setTeachingExposure(crypto.randomUUID()))
                    : void run(async () => {
                        await saveAttempt(
                          questionNode.id,
                          answer === questionNode.question!.answerIndex,
                          'choice',
                        );
                        setFeedback(true);
                      })
                }
              >
                {feedback ? pt.next : pt.answer}
              </button>
            </footer>
          </Dialog>
        )}
        {node && application && (
          <Dialog title={pt.master} close={() => setApplication(false)} busy={busy}>
            <p className="study-note">{pt.explainTask}</p>
            <Field title={pt.yourAnswer}>
              <textarea
                className="study-input"
                value={response}
                disabled={!!grade}
                onChange={(e) => setResponse(e.target.value)}
              />
            </Field>
            <p className="study-muted">{pt.gradeNotice}</p>
            {grade && (
              <div className="study-alert">
                <p>
                  {Math.round(grade.score * 100)}% · {grade.feedback}
                </p>
                {grade.missing?.map((m: string) => (
                  <p key={m}>{m}</p>
                ))}
              </div>
            )}
            <footer>
              <button
                className="study-btn primary"
                disabled={busy || !!grade || response.trim().length < 3}
                onClick={() =>
                  void run(async () => {
                    const result = await api('grade', {
                      conceptId: node.id,
                      harness: settings?.harness || 'codex',
                      label: node.label,
                      note: (node.summary + '\n' + node.note).slice(0, 20000),
                      answer: response,
                      task: pt.explainTask,
                    });
                    await saveAttempt(node.id, result.score >= 0.8, 'application', result.score);
                    setGrade(result);
                  })
                }
              >
                {pt.grade}
              </button>
            </footer>
          </Dialog>
        )}
        {node && deep && (
          <Dialog title={pt.deepTitle} close={() => setDeep(null)} busy={busy}>
            <p className="study-muted">{pt.deepNotice}</p>
            <p className="study-note">{deep.explanation}</p>
            {deep.branches.map((b: any, i: number) => (
              <article className="study-card" key={i}>
                <label className="study-check">
                  <input
                    type="checkbox"
                    checked={b.selected}
                    onChange={(e) =>
                      setDeep({
                        ...deep,
                        branches: deep.branches.map((v: any, j: number) =>
                          i === j ? { ...v, selected: e.target.checked } : v,
                        ),
                      })
                    }
                  />
                  <input
                    aria-label={pt.noteTitle}
                    className="study-input"
                    value={b.label}
                    onChange={(e) =>
                      setDeep({
                        ...deep,
                        branches: deep.branches.map((v: any, j: number) =>
                          i === j ? { ...v, label: e.target.value } : v,
                        ),
                      })
                    }
                  />
                </label>
                <textarea
                  aria-label={pt.noteBody}
                  className="study-input"
                  value={b.summary}
                  onChange={(e) =>
                    setDeep({
                      ...deep,
                      branches: deep.branches.map((v: any, j: number) =>
                        i === j ? { ...v, summary: e.target.value } : v,
                      ),
                    })
                  }
                />
              </article>
            ))}
            <p className="study-note">{deep.application}</p>
            <footer>
              <button
                className="study-btn primary"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const added: Concept[] = deep.branches
                      .filter((b: any) => b.selected)
                      .map((b: any) => ({
                        id: crypto.randomUUID(),
                        label: b.label,
                        summary: b.summary,
                        note: '',
                        origin: 'ai',
                        courseIds: [...node.courseIds],
                        evidence: [],
                        attempts: [],
                        due: 0,
                      }));
                    await commit({
                      ...state,
                      concepts: [...state.concepts, ...added],
                      connections: [
                        ...state.connections,
                        ...added.map((n, i) => ({
                          id: crypto.randomUUID(),
                          source: node.id,
                          target: n.id,
                          relation: deep.branches.filter((b: any) => b.selected)[i].relation,
                        })),
                      ],
                    });
                    setDeep(null);
                    notify(pt.saved);
                  })
                }
              >
                {pt.approveBranches}
              </button>
            </footer>
          </Dialog>
        )}
      </main>
    </div>
  );
}
