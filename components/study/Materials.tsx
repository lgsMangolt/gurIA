'use client';
import { useEffect, useRef, useState } from 'react';
import { pt } from '@/lib/study/locale';
import type { Workspace } from '@/lib/study/domain';
import { SegmentRecorder, type VideoSegment } from '@/lib/study/segment-recorder';
import { api, Dialog, Field } from './shared';
import { StudySkeleton } from './StudySkeleton';
export function Materials({
  state,
  selection,
  incorporate,
  notify,
}: {
  state: Workspace;
  selection: { harness: string; model: string };
  incorporate: (result: any, courseId: string, mapping: Record<string, string>) => Promise<void>;
  notify: (text: string) => void;
}) {
  const [jobs, setJobs] = useState<any[]>([]),
    [jobsLoaded, setJobsLoaded] = useState(false),
    [file, setFile] = useState<File | null>(null),
    [title, setTitle] = useState(''),
    [courseId, setCourseId] = useState(''),
    [objective, setObjective] = useState(''),
    [captions, setCaptions] = useState(''),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [recording, setRecording] = useState(false),
    [review, setReview] = useState<any>(null),
    [choices, setChoices] = useState<
      Record<
        string,
        { selected: boolean; startSeconds: number; endSeconds: number; existing: string }
      >
    >({});
  const engine = useRef<SegmentRecorder | null>(null),
    queue = useRef<VideoSegment[]>([]),
    draining = useRef(false),
    alive = useRef(true),
    video = useRef<HTMLVideoElement>(null),
    captureActive = useRef(false),
    captureStarted = useRef(0),
    captureInfo = useRef({ title: '', courseId: '', objective: '', harness: 'codex', model: '' });
  useEffect(() => {
    setConsent(false);
  }, [selection.harness, selection.model]);
  const refresh = async () => {
    try {
      const data = await api('jobs');
      if (alive.current) setJobs(data.jobs);
      if (
        captureActive.current &&
        (data.jobs.filter((j: any) => j.status === 'queued').length >= 3 ||
          data.jobs.some(
            (j: any) => j.status === 'failed' && j.createdAt >= captureStarted.current,
          ))
      ) {
        engine.current?.stop();
        notify(pt.paused);
      }
    } catch (e) {
      notify((e as Error).message);
    } finally {
      if (alive.current) setJobsLoaded(true);
    }
  };
  useEffect(() => {
    alive.current = true;
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => {
      alive.current = false;
      clearInterval(timer);
      engine.current?.stop(true);
    };
  }, []);
  useEffect(() => {
    if (!busy && !recording && !queue.current.length) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy, recording]);
  const upload = async (media: Blob, live = false, offset = 0) => {
    const data = new FormData(),
      info = live ? captureInfo.current : { title, courseId, objective, ...selection };
    data.set('media', media, media instanceof File ? media.name : 'capture.webm');
    data.set('title', info.title || pt.importTitle);
    data.set('courseId', info.courseId);
    data.set('objective', info.objective);
    data.set('consent', String(live ? true : consent));
    data.set('harness', info.harness);
    data.set('model', info.model);
    data.set('offset', String(offset));
    data.set('live', String(live));
    if (!live) data.set('captions', captions);
    return api('jobs', data);
  };
  const drain = async () => {
    if (draining.current) return;
    draining.current = true;
    setBusy(true);
    try {
      while (queue.current.length && alive.current) {
        const clip = queue.current[0];
        await upload(clip.blob, true, clip.startSeconds);
        queue.current.shift();
        await refresh();
      }
    } catch (e) {
      engine.current?.stop();
      notify(
        (e as Error).message +
          ' Trechos ainda não enviados permanecem nesta aba. Use Retomar envio antes de fechá-la.',
      );
    } finally {
      draining.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const capture = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 5, max: 10 } },
        audio: true,
      });
      if (!stream.getAudioTracks().length) notify(pt.noAudio);
      captureInfo.current = { title, courseId, objective, ...selection };
      captureStarted.current = Date.now();
      captureActive.current = true;
      engine.current = new SegmentRecorder({
        seconds: 45,
        onSegment: (segment) => {
          queue.current.push(segment);
          if (queue.current.length >= 3) {
            engine.current?.stop();
            notify(pt.paused);
          }
          void drain();
        },
        onStop: () => {
          captureActive.current = false;
          setRecording(false);
        },
        onError: (e) => notify(e.message),
      });
      engine.current.start(stream);
      setRecording(true);
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const openReview = (job: any) => {
    setReview(job);
    setChoices(
      Object.fromEntries(
        job.result.concepts.map((n: any) => [
          n.id,
          {
            selected: true,
            startSeconds: n.startSeconds,
            endSeconds: Math.max(n.startSeconds + 0.1, n.endSeconds),
            existing: '',
          },
        ]),
      ),
    );
  };
  const approve = async () => {
    setBusy(true);
    try {
      const selected = Object.entries(choices).filter(([, v]) => v.selected);
      const result = await api(`jobs/${review.id}/approve`, {
        choices: selected.map(([id, v]) => ({
          id,
          startSeconds: v.startSeconds,
          endSeconds: v.endSeconds,
        })),
      });
      await incorporate(
        result,
        review.context.courseId || '',
        Object.fromEntries(selected.map(([id, v]) => [id, v.existing])),
      );
      setReview(null);
      await refresh();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <section className="study-card guria-material-entry">
        <h2>{pt.importTitle}</h2>
        <p className="study-muted">{pt.importHelp}</p>
        <div className="study-grid" style={{ margin: '20px 0' }}>
          <Field title={pt.lessonTitle}>
            <input
              className="study-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <Field title={pt.course}>
            <select
              className="study-input"
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
            >
              <option value="">{pt.none}</option>
              {state.courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </Field>
          <Field title={pt.file}>
            <input
              type="file"
              accept="audio/*,video/*"
              disabled={busy || recording}
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                setFile(f);
                if (f) setTitle(f.name);
              }}
            />
          </Field>
          <Field title={pt.captions}>
            <input
              type="file"
              accept=".srt,.vtt"
              onChange={async (e) => setCaptions((await e.target.files?.[0]?.text()) || '')}
            />
          </Field>
        </div>
        <Field title={pt.objective}>
          <input
            className="study-input"
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
          />
        </Field>
        <p className="study-muted" style={{ margin: '16px 0' }}>
          {pt.privacy} Destino selecionado: {selection.harness} ({selection.model || 'padrão'}).
        </p>
        <label className="study-check">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          {pt.consent} Enviar para {selection.harness}.
        </label>
        <div className="study-row" style={{ marginTop: 20 }}>
          <button
            className="study-btn primary"
            disabled={!consent || !file || busy || recording}
            onClick={async () => {
              setBusy(true);
              try {
                await upload(file!);
                await refresh();
              } catch (e) {
                notify((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {pt.analyze}
          </button>
          <button
            className="study-btn"
            disabled={!consent || (!recording && busy)}
            onClick={() => (recording ? engine.current?.stop() : void capture())}
          >
            {recording ? pt.stop : pt.capture}
          </button>
          <button
            className="study-btn"
            disabled={!recording}
            onClick={() => engine.current?.rotate('manual_snap')}
          >
            {pt.mark}
          </button>
          {recording && <span className="study-pill">● {pt.recording}</span>}
          {!!queue.current.length && !busy && (
            <button className="study-btn" onClick={() => void drain()}>
              Retomar envio ({queue.current.length})
            </button>
          )}
        </div>
      </section>
      <h2 style={{ fontWeight: 650, marginBottom: 10 }}>{pt.pending}</h2>
      {!jobsLoaded && <StudySkeleton label="Carregando materiais…" compact />}
      <p className="study-muted">{pt.retention}</p>
      <div className="study-list" style={{ marginTop: 15 }}>
        {jobs
          .filter((job) => job.status !== 'discarded')
          .map((job) => (
            <article className="study-card" key={job.id}>
              <div className="study-row" style={{ justifyContent: 'space-between' }}>
                <h3>{job.context.lessonTitle}</h3>
                <span className="study-pill">{job.stage}</span>
              </div>
              {job.expiresAt && (
                <p className="study-muted">
                  {pt.expires}: {new Date(job.expiresAt).toLocaleString('pt-BR')}
                </p>
              )}
              {job.error && <p className="study-alert">{job.error}</p>}
              <div className="study-row" style={{ marginTop: 15 }}>
                {job.status === 'completed' && (
                  <button className="study-btn primary" onClick={() => openReview(job)}>
                    {pt.reviewMaterial}
                  </button>
                )}
                {['failed', 'queued'].includes(job.status) && (
                  <button
                    className="study-btn"
                    disabled={busy}
                    onClick={async () => {
                      try {
                        await api(`jobs/${job.id}/retry`, {});
                        await refresh();
                      } catch (e) {
                        notify((e as Error).message);
                      }
                    }}
                  >
                    {pt.retry}
                  </button>
                )}
                {['failed', 'completed', 'queued'].includes(job.status) && (
                  <button
                    className="study-btn"
                    onClick={async () => {
                      try {
                        await api(`jobs/${job.id}`, undefined, 'DELETE');
                        await refresh();
                      } catch (e) {
                        notify((e as Error).message);
                      }
                    }}
                  >
                    {pt.discard}
                  </button>
                )}
                {job.status === 'approved' && (
                  <button
                    className="study-btn"
                    onClick={() =>
                      void incorporate(job.result, job.context.courseId || '', {}).catch((e) =>
                        notify(e.message),
                      )
                    }
                  >
                    {pt.restore}
                  </button>
                )}
              </div>
            </article>
          ))}
      </div>
      {review && (
        <Dialog title={pt.reviewMaterial} close={() => setReview(null)} busy={busy}>
          <video ref={video} controls src={`/api/study/media/${review.id}/source.media`} />
          <p className="study-note">{review.result.summary}</p>
          <p className="study-muted">{pt.merge}</p>
          {review.result.concepts.map((n: any) => (
            <article className="study-card" key={n.id}>
              <label className="study-check">
                <input
                  type="checkbox"
                  checked={choices[n.id]?.selected}
                  onChange={(e) =>
                    setChoices((p) => ({
                      ...p,
                      [n.id]: { ...p[n.id], selected: e.target.checked },
                    }))
                  }
                />
                <strong>{n.label}</strong>
              </label>
              <p className="study-note">{n.evidence}</p>
              <div className="study-grid">
                <Field title={pt.clipStart}>
                  <input
                    className="study-input"
                    type="number"
                    step="0.1"
                    value={choices[n.id]?.startSeconds}
                    onChange={(e) =>
                      setChoices((p) => ({
                        ...p,
                        [n.id]: { ...p[n.id], startSeconds: Number(e.target.value) },
                      }))
                    }
                  />
                </Field>
                <Field title={pt.clipEnd}>
                  <input
                    className="study-input"
                    type="number"
                    step="0.1"
                    value={choices[n.id]?.endSeconds}
                    onChange={(e) =>
                      setChoices((p) => ({
                        ...p,
                        [n.id]: { ...p[n.id], endSeconds: Number(e.target.value) },
                      }))
                    }
                  />
                </Field>
              </div>
              <Field title={pt.linkExisting}>
                <select
                  className="study-input"
                  value={choices[n.id]?.existing}
                  onChange={(e) =>
                    setChoices((p) => ({ ...p, [n.id]: { ...p[n.id], existing: e.target.value } }))
                  }
                >
                  <option value="">{pt.newConcept}</option>
                  {state.concepts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>
              <button
                className="study-btn"
                onClick={() => {
                  if (video.current) {
                    video.current.currentTime = Math.max(
                      0,
                      n.startSeconds - review.context.offsetSeconds,
                    );
                    void video.current.play();
                  }
                }}
              >
                {pt.evidence}
              </button>
            </article>
          ))}
          <p className="study-muted">{pt.retention}</p>
          <footer>
            <button className="study-btn primary" disabled={busy} onClick={() => void approve()}>
              {pt.approve}
            </button>
          </footer>
        </Dialog>
      )}
    </>
  );
}
