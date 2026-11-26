'use client';
// Aba Entrevista: simulado de entrevista de emprego com as skills mock-interview e job-search-os.
import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { api, Field } from './shared';
import { StudySkeleton } from './StudySkeleton';

type Message = { role: 'user' | 'assistant'; text: string };
type Setup = {
  cargo: string;
  empresa: string;
  tipo: 'comportamental' | 'tecnica' | 'case' | 'mista';
  nivel: 'estagio' | 'junior' | 'pleno' | 'senior' | 'lideranca';
  vaga: string;
  perguntas: number;
};
type Saved = { setup: Setup; messages: Message[]; finished: boolean; feedback: string };
type Status = { mockInterview: boolean; coach: boolean; dir: string };

const key = 'guria-entrevista';
const emptySetup: Setup = {
  cargo: '',
  empresa: '',
  tipo: 'comportamental',
  nivel: 'pleno',
  vaga: '',
  perguntas: 5,
};
const tipos: Array<[Setup['tipo'], string]> = [
  ['comportamental', 'Comportamental (histórias reais)'],
  ['tecnica', 'Técnica conversada'],
  ['case', 'Case / estudo de caso'],
  ['mista', 'Mista'],
];
const niveis: Array<[Setup['nivel'], string]> = [
  ['estagio', 'Estágio'],
  ['junior', 'Júnior'],
  ['pleno', 'Pleno'],
  ['senior', 'Sênior'],
  ['lideranca', 'Liderança'],
];

/** Negrito com **texto**, sem HTML. */
function inline(text: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part, i) =>
      part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
        <strong key={i}>{part.slice(2, -2)}</strong>
      ) : (
        <Fragment key={i}>{part}</Fragment>
      ),
    );
}

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim());

/** Markdown simples do retorno (títulos, listas, tabelas, parágrafos) como elementos React. */
export function Markdown({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let list: ReactNode[] = [];
  let rows: string[][] = [];
  const flushTable = () => {
    if (!rows.length) return;
    const [head, ...body] = rows;
    out.push(
      <div key={out.length} className="guria-interview-table">
        <table>
          <thead>
            <tr>
              {head.map((c, i) => (
                <th key={i}>{inline(c)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j}>{inline(c)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
    rows = [];
  };
  const flush = () => {
    flushTable();
    if (list.length) out.push(<ul key={out.length}>{list}</ul>);
    list = [];
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (/^\s*\|.*\|\s*$/.test(line)) {
      // Linha separadora |---|:--:| só marca o cabeçalho.
      if (!/^[\s|:-]+$/.test(line)) rows.push(cells(line));
      continue;
    }
    if (!line.trim() && rows.length) continue;
    flushTable();
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    const li = /^\s*(?:[-*]|\d+[.)])\s+(.*)$/.exec(line);
    if (h) {
      flush();
      const Tag = h[1].length <= 2 ? 'h3' : 'h4';
      out.push(<Tag key={out.length}>{inline(h[2])}</Tag>);
    } else if (li) list.push(<li key={list.length}>{inline(li[1])}</li>);
    else if (line.trim()) {
      flush();
      out.push(<p key={out.length}>{inline(line)}</p>);
    } else flush();
  }
  flush();
  return <div className="guria-interview-feedback">{out}</div>;
}

export function InterviewTab({ harness, ready }: { harness: string; ready: boolean }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [setup, setSetup] = useState<Setup>(emptySetup);
  const [messages, setMessages] = useState<Message[]>([]);
  const [finished, setFinished] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api<Status>('interview-status')
      .then(setStatus)
      .catch((e) => setError(e instanceof Error ? e.message : 'Não foi possível abrir.'));
    try {
      const saved: Saved | null = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (saved?.setup && Array.isArray(saved.messages)) {
        setSetup({ ...emptySetup, ...saved.setup });
        setMessages(saved.messages.slice(-60));
        setFinished(!!saved.finished);
        setFeedback(typeof saved.feedback === 'string' ? saved.feedback : '');
      }
    } catch {}
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try {
      sessionStorage.setItem(key, JSON.stringify({ setup, messages, finished, feedback }));
    } catch {}
  }, [setup, messages, finished, feedback, loaded]);

  const talk = async (next: Message[]) => {
    setBusy(true);
    setError('');
    try {
      const r = await api<{ reply: string; finished: boolean }>('interview-turn', {
        harness,
        setup,
        messages: next,
      });
      setMessages([...next, { role: 'assistant', text: r.reply }]);
      setFinished(r.finished);
      setInput('');
    } catch (e) {
      setMessages(next.slice(0, -1).length ? next.slice(0, -1) : []);
      setError(e instanceof Error ? e.message : 'Não foi possível responder.');
    } finally {
      setBusy(false);
    }
  };
  const start = () => void talk([{ role: 'user', text: 'Olá! Estou pronto para começar.' }]);
  const send = () => {
    const text = input.trim();
    if (!text || busy) return;
    void talk([...messages, { role: 'user', text }]);
  };
  const evaluate = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await api<{ feedback: string }>('interview-feedback', {
        harness,
        setup,
        messages,
      });
      setFeedback(r.feedback);
      setFinished(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível gerar o retorno.');
    } finally {
      setBusy(false);
    }
  };
  const reset = () => {
    setMessages([]);
    setFinished(false);
    setFeedback('');
    setInput('');
    setError('');
  };

  if (!status && !error) return <StudySkeleton label="Abrindo a Entrevista…" compact />;
  const installed = status?.mockInterview && status?.coach;
  const started = messages.length > 0;

  return (
    <section className="study-card guria-interview" aria-label="Entrevista">
      <h2>Simulado de entrevista</h2>
      <p className="study-muted">
        Usa as skills <strong>mock-interview</strong> (entrevistador) e{' '}
        <strong>job-search-os</strong> (notas e retorno) instaladas no seu Claude Code. Cada
        resposta do entrevistador e o retorno final usam 1 pedido da sua assinatura. A conversa fica
        só nesta aba do navegador.
      </p>
      {error && (
        <p role="alert" className="study-alert">
          {error}
        </p>
      )}
      {status && !installed && (
        <div className="study-note">
          <p>
            Falta instalar:{' '}
            {[!status.mockInterview && 'mock-interview', !status.coach && 'job-search-os']
              .filter(Boolean)
              .join(' e ')}
            . A gurIA procura as skills em <code>{status.dir}</code>.
          </p>
        </div>
      )}
      {installed && !started && (
        <>
          <Field title="Cargo">
            <input
              className="study-input"
              maxLength={120}
              value={setup.cargo}
              onChange={(e) => setSetup({ ...setup, cargo: e.target.value })}
              placeholder="Ex.: Analista de dados"
            />
          </Field>
          <Field title="Empresa (opcional)">
            <input
              className="study-input"
              maxLength={120}
              value={setup.empresa}
              onChange={(e) => setSetup({ ...setup, empresa: e.target.value })}
            />
          </Field>
          <div className="study-grid guria-interview-options">
            <Field title="Tipo de entrevista">
              <select
                className="study-input"
                value={setup.tipo}
                onChange={(e) => setSetup({ ...setup, tipo: e.target.value as Setup['tipo'] })}
              >
                {tipos.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field title="Nível">
              <select
                className="study-input"
                value={setup.nivel}
                onChange={(e) => setSetup({ ...setup, nivel: e.target.value as Setup['nivel'] })}
              >
                {niveis.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field title="Perguntas principais">
              <input
                className="study-input"
                type="number"
                min={2}
                max={10}
                value={setup.perguntas}
                onChange={(e) =>
                  setSetup({
                    ...setup,
                    perguntas: Math.min(10, Math.max(2, Number(e.target.value) || 5)),
                  })
                }
              />
            </Field>
          </div>
          <Field title="Descrição da vaga (opcional)">
            <textarea
              className="study-input"
              rows={5}
              maxLength={6000}
              value={setup.vaga}
              onChange={(e) => setSetup({ ...setup, vaga: e.target.value })}
              placeholder="Cole aqui o anúncio da vaga para a entrevista ficar mais realista."
            />
          </Field>
          <div className="study-row" style={{ marginTop: 12 }}>
            <button
              className="study-btn primary"
              disabled={busy || !ready || setup.cargo.trim().length < 2}
              onClick={start}
            >
              {busy ? 'Preparando…' : 'Começar entrevista'}
            </button>
          </div>
          {!ready && <p className="study-muted">Escolha sua IA em Configurações para começar.</p>}
        </>
      )}
      {started && (
        <>
          <p className="study-muted">
            {setup.cargo}
            {setup.empresa ? ` · ${setup.empresa}` : ''} ·{' '}
            {tipos.find((t) => t[0] === setup.tipo)?.[1]}
          </p>
          <div aria-live="polite">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`guria-interview-msg ${m.role === 'user' ? 'is-candidate' : 'is-interviewer'}`}
              >
                <strong>{m.role === 'user' ? 'Você' : 'Entrevistador'}</strong>
                <p style={{ whiteSpace: 'pre-wrap' }}>{m.text}</p>
              </div>
            ))}
          </div>
          {busy && <StudySkeleton label="Pensando…" compact />}
          {!finished && (
            <>
              <label htmlFor="guria-interview-input">Sua resposta</label>
              <textarea
                id="guria-interview-input"
                className="study-input"
                rows={5}
                maxLength={6000}
                value={input}
                disabled={busy}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send();
                }}
                placeholder="Responda como responderia na entrevista. Ctrl+Enter envia."
              />
            </>
          )}
          <div className="study-row" style={{ flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {!finished && (
              <button className="study-btn primary" disabled={busy || !input.trim()} onClick={send}>
                {busy ? 'Enviando…' : 'Responder'}
              </button>
            )}
            {!feedback && (
              <button
                className={`study-btn ${finished ? 'primary' : ''}`}
                disabled={busy}
                onClick={() => void evaluate()}
              >
                {finished ? 'Ver retorno' : 'Encerrar e ver retorno'}
              </button>
            )}
            <button className="study-btn" disabled={busy} onClick={reset}>
              Nova entrevista
            </button>
          </div>
          {feedback && (
            <div className="study-card" style={{ marginTop: 16 }}>
              <h2>Retorno</h2>
              <Markdown text={feedback} />
            </div>
          )}
        </>
      )}
    </section>
  );
}
