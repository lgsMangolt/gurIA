'use client';
// Diálogo de importação: caminho local (pasta, zip ou arquivo), consentimento e relatório.
import { useEffect, useState } from 'react';
import { ptCourse as t } from '@/lib/study/locale';
import type { Workspace } from '@/lib/study/domain';
import { api, Dialog, Field } from '../shared';

type Snapshot = { data: Workspace; revision: number };

export function ImportCourse({
  revision,
  close,
  done,
  notify,
}: {
  revision: number;
  close: () => void;
  done: (snapshot: Snapshot, courseId: string) => void;
  notify: (text: string) => void;
}) {
  const [source, setSource] = useState(''),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [tools, setTools] = useState<{ markitdown: boolean; ytDlp: boolean } | null>(null),
    [report, setReport] = useState('');
  useEffect(() => {
    api('course-tools')
      .then(setTools)
      .catch(() => setTools(null));
  }, []);
  const isLink = /^https?:\/\//i.test(source.trim());
  const run = async () => {
    setBusy(true);
    try {
      const value = source.trim().replace(/^"|"$/g, '');
      const out = await api('course-import', {
        revision,
        ...(isLink ? { url: value } : { path: value }),
      });
      setReport(t.report(out.report));
      done({ data: out.data, revision: out.revision }, out.courseId);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog title={t.dialogTitle} close={close} busy={busy}>
      <Field title={t.pathLabel}>
        <input
          className="study-input"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="C:\Users\…\Downloads\curso.zip ou https://www.youtube.com/playlist?list=…"
          aria-describedby="guria-import-help"
        />
      </Field>
      <p id="guria-import-help" className="study-muted">
        {t.pathHelp}
      </p>
      {tools && !isLink && !tools.markitdown && <p className="study-alert">{t.noConverter}</p>}
      {tools && isLink && !tools.ytDlp && <p className="study-alert">{t.noYtDlp}</p>}
      {isLink && <p className="study-muted">{t.youtubeHelp}</p>}
      <label className="study-check" style={{ margin: '12px 0' }}>
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        {t.consent}
      </label>
      {report && (
        <p className="study-pill" role="status">
          {report}
        </p>
      )}
      <div className="study-row" style={{ marginTop: 16 }}>
        <button
          className="study-btn primary"
          disabled={!consent || !source.trim() || busy}
          onClick={() => void run()}
        >
          {busy ? t.running : t.run}
        </button>
        <button className="study-btn" onClick={close} disabled={busy}>
          {t.cancel}
        </button>
      </div>
    </Dialog>
  );
}
