'use client';
import { useEffect, useState } from 'react';
import { api } from './shared';
import { StudySkeleton } from './StudySkeleton';

type Message = { role: 'user' | 'assistant'; text: string };
const key = 'guria-conversa-temporaria';

export function StudyChat({ harness, ready, onStudy }: { harness: string; ready: boolean; onStudy: (topic: string) => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (Array.isArray(saved?.messages)) setMessages(saved.messages.filter((m: Message) => (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string').slice(-20));
      if (typeof saved?.topic === 'string') setTopic(saved.topic.slice(0, 200));
    } catch {}
    setLoaded(true);
  }, []);
  useEffect(() => { if (loaded) try { sessionStorage.setItem(key, JSON.stringify({ messages, topic })); } catch {} }, [messages, topic, loaded]);
  const send = async () => {
    const text = input.trim();
    if (!text || busy || !ready) return;
    const next: Message[] = [...messages, { role: 'user' as const, text }].slice(-19);
    setBusy(true); setError('');
    try {
      const result = await api<{ reply: string; topic: string }>('chat', { harness, messages: next });
      setMessages([...next, { role: 'assistant', text: result.reply }]);
      setTopic(result.topic); setInput('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível responder.'); }
    finally { setBusy(false); }
  };
  return <section className="study-card" aria-label="Conversa com IA">
    <h2>Sobre o que você quer conversar?</h2>
    <p className="study-muted">A conversa fica nesta aba do navegador enquanto ela estiver aberta.</p>
    <div aria-live="polite">{messages.map((m, i) => <div key={i} style={{ whiteSpace: 'pre-wrap', padding: '12px 0', borderBottom: '1px solid #ddd' }}><strong>{m.role === 'user' ? 'Você' : 'gurIA'}</strong><p>{m.text}</p></div>)}</div>
    {busy && <StudySkeleton label="Preparando resposta…" compact />}
    {error && <p role="alert" className="study-alert">{error}</p>}
    <label htmlFor="guria-chat-input">Sua mensagem</label>
    <textarea id="guria-chat-input" className="study-input" rows={3} maxLength={4000} value={input} onChange={e => setInput(e.target.value)} disabled={busy} placeholder="Escreva sua pergunta ou ideia…" />
    <div className="study-row" style={{ marginTop: 12 }}><button className="study-btn primary" disabled={busy || !ready || !input.trim()} onClick={() => void send()}>{busy ? 'Respondendo…' : 'Enviar'}</button>{messages.length > 0 && <button className="study-btn" disabled={busy} onClick={() => { setMessages([]); setTopic(''); setError(''); setInput(''); }}>Nova conversa</button>}</div>
    {messages.length > 0 && <div style={{ marginTop: 24 }}><label htmlFor="guria-chat-topic">Tema para estudar</label><input id="guria-chat-topic" className="study-input" maxLength={200} value={topic} onChange={e => setTopic(e.target.value)} placeholder="Escreva ou ajuste o tema" /><button className="study-btn" style={{ marginTop: 10 }} disabled={busy || topic.trim().length < 2} onClick={() => onStudy(topic.trim())}>Criar tema de estudo</button></div>}
  </section>;
}
