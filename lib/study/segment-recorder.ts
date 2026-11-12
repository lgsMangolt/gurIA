export interface VideoSegment {
  blob: Blob;
  startSeconds: number;
  durationSeconds: number;
  sourceType: 'live_stream' | 'manual_snap';
  hasAudio: boolean;
}

/** Each window uses a fresh recorder, so every Blob has its own container header. */
export class SegmentRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private sessionStart = 0;
  private segmentStart = 0;
  private running = false;
  private disposed = false;
  constructor(
    private options: {
      seconds: number;
      onSegment: (segment: VideoSegment) => void;
      onStop: () => void;
      onError: (error: Error) => void;
      factory?: (stream: MediaStream) => MediaRecorder;
      now?: () => number;
    },
  ) {}
  private now() {
    return this.options.now?.() ?? performance.now();
  }
  start(stream: MediaStream) {
    if (this.running) throw new Error('A captura já está ativa.');
    this.disposed = false;
    this.stream = stream;
    this.sessionStart = this.now();
    this.running = true;
    stream
      .getVideoTracks()
      .forEach((track) => track.addEventListener('ended', () => this.stop(), { once: true }));
    try {
      this.beginWindow();
    } catch (error) {
      this.stop(true);
      throw error;
    }
  }
  private beginWindow() {
    if (!this.stream || !this.running) return;
    const mimeType = ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find(
      (type) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type),
    );
    if (!mimeType && !this.options.factory)
      throw new Error(
        'Este navegador não grava vídeo. Use Enviar vídeo ou abra o app no Chrome/Edge.',
      );
    const recorder =
      this.options.factory?.(this.stream) ||
      new MediaRecorder(this.stream, {
        mimeType,
        videoBitsPerSecond: 450000,
        audioBitsPerSecond: 64000,
      });
    this.segmentStart = this.now();
    const start = this.segmentStart;
    const hasAudio = this.stream.getAudioTracks().some((track) => track.readyState === 'live');
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    recorder.onerror = () => {
      this.options.onError(new Error('A gravação foi interrompida pelo navegador.'));
      this.stop(true);
    };
    this.recorder = recorder;
    // closeWindow installs onstop with a stable end time before stopping this recorder.
    (recorder as any).__window = { chunks, start, hasAudio };
    recorder.start(1000);
    this.timer = setTimeout(() => this.rotate(), this.options.seconds * 1000);
  }
  private closeWindow(sourceType: VideoSegment['sourceType']) {
    const recorder = this.recorder;
    this.recorder = null;
    if (!recorder || recorder.state === 'inactive') return;
    const { chunks, start, hasAudio } = (recorder as any).__window as {
      chunks: Blob[];
      start: number;
      hasAudio: boolean;
    };
    const end = this.now();
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
      chunks.length = 0;
      if (!this.disposed && blob.size > 16 && end - start >= 200)
        this.options.onSegment({
          blob,
          startSeconds: (start - this.sessionStart) / 1000,
          durationSeconds: (end - start) / 1000,
          sourceType,
          hasAudio,
        });
    };
    recorder.stop();
  }
  rotate(sourceType: VideoSegment['sourceType'] = 'live_stream') {
    if (!this.running || this.now() - this.segmentStart < 1000) return;
    if (this.timer) clearTimeout(this.timer);
    this.closeWindow(sourceType);
    try {
      this.beginWindow();
    } catch (error) {
      this.options.onError(error as Error);
      this.stop();
    }
  }
  stop(discard = false) {
    if (discard) this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.running) return;
    this.running = false;
    this.closeWindow('live_stream');
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.options.onStop();
  }
  remaining() {
    return Math.max(0, Math.ceil(this.options.seconds - (this.now() - this.segmentStart) / 1000));
  }
}
