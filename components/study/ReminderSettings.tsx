'use client';
// Configurações → Lembrete de revisões: liga/desliga a tarefa diária do Windows.
import { useEffect, useState } from 'react';
import { ptReminder as t } from '@/lib/study/locale';
import { api, Field } from './shared';

type Status = { suportado: boolean; ativo: boolean; hora?: string; proxima?: string };

export function ReminderSettings({ notify }: { notify: (text: string) => void }) {
  const [status, setStatus] = useState<Status | null>(null),
    [hora, setHora] = useState('19:00'),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api<Status>('reminder')
      .then((s) => {
        setStatus(s);
        if (s.hora) setHora(s.hora);
      })
      .catch((e) => notify((e as Error).message));
    // notify fica de fora: só carrega ao abrir Configurações.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const save = (ativo: boolean) =>
    act(async () => {
      const s = await api<Status>('reminder', ativo ? { ativo, hora } : { ativo }, 'PUT');
      setStatus(s);
      if (s.hora) setHora(s.hora);
    });
  return (
    <section className="study-card guria-reminder">
      <h2>{t.title}</h2>
      <p className="study-muted">{t.help}</p>
      {!status ? (
        <p className="study-muted">{t.loading}</p>
      ) : !status.suportado ? (
        <p className="study-note">{t.unsupported}</p>
      ) : (
        <>
          <p role="status">
            {status.ativo ? t.active(status.hora ?? hora, status.proxima) : t.inactive}
          </p>
          <Field title={t.hour}>
            <input
              className="study-input"
              type="time"
              value={hora}
              disabled={busy}
              onChange={(e) => setHora(e.target.value)}
            />
          </Field>
          <div className="study-row" style={{ flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {status.ativo ? (
              <>
                {hora !== status.hora && (
                  <button
                    className="study-btn primary"
                    disabled={busy}
                    onClick={() => void save(true)}
                  >
                    {t.saveHour}
                  </button>
                )}
                <button className="study-btn" disabled={busy} onClick={() => void save(false)}>
                  {t.off}
                </button>
              </>
            ) : (
              <button className="study-btn primary" disabled={busy} onClick={() => void save(true)}>
                {t.on}
              </button>
            )}
            <button
              className="study-btn"
              disabled={busy}
              onClick={() => void act(async () => notify(t.tested(await api('reminder-test', {}))))}
            >
              {t.test}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
