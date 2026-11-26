'use client';
import { useEffect, useState } from 'react';
import { friendlyError } from '@/lib/study/ui/errors';
import { pushSummary } from '@/lib/study/ui/skills-view';
import { loadPushState, requestPush, type PushState } from './skills-api';

const errorOf = (e: unknown) => {
  const err = e as Error & { code?: string };
  return friendlyError(err.code, err.message);
};

/** Nunca envia ao abrir a aba nem depois de salvar: só com a confirmação do remoto exato. */
export function PublishCard({ reloadKey }: { reloadKey: string }) {
  const [info, setInfo] = useState<PushState | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    try {
      setInfo(await loadPushState());
    } catch (e) {
      setError(errorOf(e));
    }
  };
  useEffect(() => {
    void load();
  }, [reloadKey]);

  const send = async () => {
    if (!info || !info.available) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await requestPush(info.url, info.head);
      setMessage('Skills enviadas ao GitHub.');
      setConfirming(false);
      await load();
    } catch (e) {
      setError(errorOf(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="study-card guria-skills-publish">
      <h2>Publicar no GitHub</h2>
      <p className="study-muted">
        A gurIA nunca publica sozinha: o envio só acontece depois da sua confirmação.
      </p>
      {!info && !error && <p className="study-muted">Carregando…</p>}
      {info && !info.available && <p>{info.reason}</p>}
      {info && info.available && (
        <>
          <p>
            Remoto: <code>{info.url}</code> · branch <code>{info.branch}</code>
          </p>
          {info.refused && (
            <p role="alert" className="guria-practice-error">
              {info.refused}
            </p>
          )}
          {info.ahead.length === 0 ? (
            <p>Não há commits novos para enviar.</p>
          ) : (
            <>
              <p>{pushSummary(info)}:</p>
              <ul>
                {info.ahead.map((line) => (
                  <li key={line}>
                    <code>{line}</code>
                  </li>
                ))}
              </ul>
              {!confirming ? (
                <button
                  className="study-btn primary"
                  disabled={busy || !!info.refused}
                  onClick={() => setConfirming(true)}
                >
                  Enviar ao GitHub
                </button>
              ) : (
                <div
                  role="alertdialog"
                  aria-label="Confirmar envio ao GitHub"
                  className="guria-practice-confirm"
                >
                  <p>
                    Enviar {info.ahead.length} {info.ahead.length === 1 ? 'commit' : 'commits'} para{' '}
                    <code>{info.url}</code>? Isso publica o conteúdo das skills nesse repositório.
                  </p>
                  <div className="study-row">
                    <button
                      className="study-btn primary"
                      disabled={busy}
                      onClick={() => void send()}
                    >
                      Confirmar envio para {info.url}
                    </button>
                    <button className="study-btn" onClick={() => setConfirming(false)}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="guria-practice-error">
          {error}
        </p>
      )}
    </section>
  );
}
