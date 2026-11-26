import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  AppError,
  analysisJsonSchema,
  lessonPrompt,
  normalizeAnalysis,
  parseJson,
  type LessonContext,
} from './analysis';

const DAY = 86400000;
export function toolPaths() {
  const root = path.join(process.env.LOCALAPPDATA || os.homedir(), 'CognitiveStudyHubTools');
  const find = (folder: string, name: string): string => {
    if (!fs.existsSync(folder)) return '';
    for (const item of fs.readdirSync(folder, { withFileTypes: true })) {
      const file = path.join(folder, item.name);
      if (item.isFile() && item.name === name) return file;
      if (item.isDirectory()) {
        const match = find(file, name);
        if (match) return match;
      }
    }
    return '';
  };
  return {
    whisper: find(path.join(root, 'whisper'), 'whisper-cli.exe'),
    ffmpeg: find(path.join(root, 'ffmpeg'), 'ffmpeg.exe'),
    ffprobe: find(path.join(root, 'ffmpeg'), 'ffprobe.exe'),
    model: path.join(root, 'ggml-small-q5_1.bin'),
  };
}
export function localReady() {
  const t = toolPaths();
  return Object.values(t).every((p) => !!p && fs.existsSync(p));
}
export async function runLocal(executable: string, args: string[], timeout = 900000) {
  return new Promise<string>((resolve, reject) => {
    // Local media must never fetch remote playlists or nested network resources.
    const safeArgs = /ff(?:mpeg|probe)\.exe$/i.test(executable)
      ? ['-protocol_whitelist', 'file,pipe,lavfi', ...args]
      : args;
    const child = spawn(executable, safeArgs, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '',
      stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(
        new AppError(
          504,
          'LOCAL_TIMEOUT',
          'A transcrição local excedeu o tempo limite. O material foi preservado para repetir.',
        ),
      );
    }, timeout);
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (stdout.length > 8000000) child.kill();
    });
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk).slice(-2000);
    });
    child.on('error', () => {
      clearTimeout(timer);
      reject(
        new AppError(
          503,
          'LOCAL_TOOL_MISSING',
          'Não foi possível iniciar o motor local. Confira a instalação.',
        ),
      );
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      code === 0
        ? resolve(stdout)
        : reject(
            new AppError(
              422,
              'LOCAL_MEDIA_FAILED',
              `Não foi possível processar esta mídia localmente (código ${code}). Confira áudio e formato do arquivo.`,
            ),
          );
    });
  });
}
export type Segment = { startSeconds: number; endSeconds: number; text: string };

/** Transcreve um trecho da mídia com o Whisper local (FFmpeg → WAV 16 kHz → whisper-cli -oj). */
export async function transcribeChunk(
  source: string,
  workdir: string,
  offset: number,
  length: number,
): Promise<Segment[]> {
  const t = toolPaths();
  const wav = path.join(workdir, 'audio.wav'),
    output = path.join(workdir, 'transcript');
  await runLocal(t.ffmpeg, [
    '-nostdin',
    '-v',
    'error',
    '-y',
    '-ss',
    String(offset),
    '-i',
    source,
    '-t',
    String(length),
    '-vn',
    '-ac',
    '1',
    '-ar',
    '16000',
    '-c:a',
    'pcm_s16le',
    wav,
  ]);
  await runLocal(t.whisper, [
    '-m',
    t.model,
    '-f',
    wav,
    '-l',
    'auto',
    '-t',
    '6',
    '-ng',
    '-oj',
    '-of',
    output,
    '-sns',
  ]);
  const raw = JSON.parse(fs.readFileSync(output + '.json', 'utf8'));
  const segments = (raw.transcription || [])
    .map((s: any) => ({
      startSeconds: Math.max(0, s.offsets.from / 1000),
      endSeconds: Math.min(length, s.offsets.to / 1000),
      text: String(s.text).trim(),
    }))
    .filter((s: Segment) => s.text && s.endSeconds >= s.startSeconds && s.startSeconds <= length);
  fs.unlinkSync(wav);
  fs.unlinkSync(output + '.json');
  return segments;
}

/** Duração da mídia em segundos (ffprobe). */
export async function probeDuration(source: string): Promise<number> {
  const out = await runLocal(toolPaths().ffprobe, [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'json',
    source,
  ]);
  const duration = Number(JSON.parse(out).format?.duration);
  if (!Number.isFinite(duration) || duration <= 0)
    throw new AppError(400, 'MEDIA_DURATION', 'Não foi possível ler a duração desta mídia.');
  return duration;
}

/** Transcreve a mídia inteira em blocos de 5 minutos; os tempos são do início do arquivo. */
export async function transcribeFile(source: string, workdir: string): Promise<Segment[]> {
  fs.mkdirSync(workdir, { recursive: true });
  const duration = await probeDuration(source);
  const all: Segment[] = [];
  for (let offset = 0; offset < duration; offset += 300) {
    const length = Math.min(300, duration - offset);
    for (const s of await transcribeChunk(source, workdir, offset, length))
      all.push({ ...s, startSeconds: s.startSeconds + offset, endSeconds: s.endSeconds + offset });
  }
  return all;
}

export function parseCaptions(text: string) {
  const timestamp = (s: string) =>
    s
      .replace(',', '.')
      .split(':')
      .reduce((sum, n) => sum * 60 + Number(n), 0);
  const segments: Array<{ startSeconds: number; endSeconds: number; text: string }> = [];
  for (const block of text.replace(/\r/g, '').split(/\n\s*\n/)) {
    const lines = block.trim().split('\n');
    const index = lines.findIndex((l) => l.includes('-->'));
    if (index < 0) continue;
    const match = lines[index].match(/([\d:. ,]+)\s*-->\s*([\d:.,]+)/);
    if (!match) continue;
    const startSeconds = timestamp(match[1].trim()),
      endSeconds = timestamp(match[2]);
    const value = lines
      .slice(index + 1)
      .join(' ')
      .replace(/<[^>]*>/g, '')
      .trim();
    if (
      Number.isFinite(startSeconds) &&
      Number.isFinite(endSeconds) &&
      startSeconds >= 0 &&
      endSeconds >= startSeconds &&
      value
    )
      segments.push({ startSeconds, endSeconds, text: value });
  }
  if (!segments.length)
    throw new AppError(
      400,
      'INVALID_CAPTIONS',
      'A legenda precisa ser SRT ou VTT com horários válidos.',
    );
  return segments;
}

export class MediaPipeline {
  readonly root: string;
  private running = new Set<string>();
  constructor(
    private directory: string,
    private harness: {
      generate(
        prompt: string,
        schema?: unknown,
        images?: string[],
        model?: string,
        harness?: string,
      ): Promise<string>;
    },
    private getModel: () => string,
    private getHarness: () => string = () => 'codex',
  ) {
    this.root = path.join(directory, 'media-jobs');
    fs.mkdirSync(this.root, { recursive: true });
    for (const job of this.list())
      if (['processing', 'queued'].includes(job.status)) {
        job.status = 'failed';
        job.error = 'Processamento interrompido. Tente novamente para continuar.';
        this.write(job);
      }
  }
  get busy() {
    return this.running.size > 0;
  }
  private folder(id: string) {
    if (!/^[a-f0-9-]{36}$/.test(id))
      throw new AppError(404, 'JOB_NOT_FOUND', 'Material não encontrado.');
    return path.join(this.root, id);
  }
  private write(job: any) {
    const file = path.join(this.folder(job.id), 'job.json');
    fs.writeFileSync(file + '.tmp', JSON.stringify(job));
    fs.renameSync(file + '.tmp', file);
  }
  get(id: string): any {
    try {
      return JSON.parse(fs.readFileSync(path.join(this.folder(id), 'job.json'), 'utf8'));
    } catch {
      throw new AppError(404, 'JOB_NOT_FOUND', 'Material não encontrado.');
    }
  }
  list() {
    const result: any[] = [];
    for (const name of fs.readdirSync(this.root)) {
      try {
        result.push(this.get(name));
      } catch {}
    }
    return result.sort((a, b) => b.createdAt - a.createdAt);
  }
  cleanup() {
    for (const job of this.list())
      if (job.expiresAt && Date.now() >= job.expiresAt && !this.running.has(job.id)) {
        this.removeRaw(job.id);
        job.status = 'expired';
        job.stage = 'Material temporário expirado após 24 horas';
        job.result = undefined;
        job.parts = undefined;
        job.captions = undefined;
        job.expiresAt = null;
        this.write(job);
      }
  }
  private removeRaw(id: string, keepApprovedClips = false) {
    const folder = this.folder(id);
    for (const name of fs.readdirSync(folder))
      if (name !== 'job.json' && !(keepApprovedClips && /^clip-\d+\.mp4$/.test(name)))
        fs.unlinkSync(path.join(folder, name));
  }
  create(
    source: string,
    context: LessonContext,
    captions = '',
    selection = { harness: this.getHarness(), model: this.getModel() },
  ) {
    if (!localReady())
      throw new AppError(
        428,
        'LOCAL_TOOLS_MISSING',
        'Instale os componentes locais do beta antes de analisar.',
      );
    if (captions) parseCaptions(captions);
    const id = randomUUID();
    fs.mkdirSync(this.folder(id));
    fs.renameSync(source, path.join(this.folder(id), 'source.media'));
    const job = {
      id,
      context,
      selection,
      captions,
      status: 'queued',
      stage: 'Na fila local; original preservado',
      createdAt: Date.now(),
      expiresAt: Date.now() + DAY,
      parts: [],
      nextOffset: 0,
    };
    this.write(job);
    if (!this.busy) void this.process(id);
    return id;
  }
  retry(id: string) {
    const job = this.get(id);
    if (this.busy || !['failed', 'completed', 'queued'].includes(job.status))
      throw new AppError(409, 'JOB_BUSY', 'Este material não pode ser repetido agora.');
    if (job.status === 'completed') return id;
    if (Date.now() >= job.expiresAt)
      throw new AppError(
        410,
        'JOB_EXPIRED',
        'O prazo de 24 horas expirou. Importe novamente a mídia.',
      );
    job.status = 'processing';
    job.error = undefined;
    job.code = undefined;
    this.write(job);
    void this.process(id);
    return id;
  }
  async process(id: string) {
    this.running.add(id);
    const job = this.get(id),
      folder = this.folder(id),
      t = toolPaths();
    const source = path.join(folder, 'source.media');
    job.status = 'processing';
    this.write(job);
    try {
      const info = JSON.parse(
        await runLocal(
          t.ffprobe,
          ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', source],
          30000,
        ),
      );
      let duration = Number(info.format?.duration);
      // MediaRecorder WebM often omits container duration. Read packet timestamps locally.
      if (!Number.isFinite(duration) || duration <= 0) {
        const progress = await runLocal(t.ffmpeg, [
          '-nostdin',
          '-v',
          'error',
          '-progress',
          'pipe:1',
          '-i',
          source,
          '-map',
          '0',
          '-c',
          'copy',
          '-f',
          'null',
          '-',
        ]);
        const times = [...progress.matchAll(/^out_time_us=(\d+)/gm)].map(
          (match) => Number(match[1]) / 1000000,
        );
        duration = Math.max(0, ...times);
      }
      if (!Number.isFinite(duration) || duration <= 0 || duration > 43200)
        throw new AppError(
          400,
          'MEDIA_DURATION',
          'Use uma mídia com duração entre 1 segundo e 12 horas.',
        );
      const hasAudio = info.streams.some((s: any) => s.codec_type === 'audio'),
        hasVideo = info.streams.some((s: any) => s.codec_type === 'video');
      job.duration = duration;
      job.mimeType = hasVideo
        ? String(info.format.format_name).includes('webm')
          ? 'video/webm'
          : 'video/mp4'
        : String(info.format.format_name).includes('wav')
          ? 'audio/wav'
          : 'audio/mpeg';
      const captions = job.captions ? parseCaptions(job.captions) : null;
      for (let offset = job.nextOffset || 0; offset < duration; offset += 300) {
        const length = Math.min(300, duration - offset);
        job.stage = `${captions ? 'Lendo legendas' : 'Transcrevendo no computador'} · ${Math.floor(offset / 60)}–${Math.ceil((offset + length) / 60)} min`;
        this.write(job);
        let segments: Array<{ startSeconds: number; endSeconds: number; text: string }> = [];
        if (captions)
          segments = captions
            .filter((s) => s.endSeconds > offset && s.startSeconds < offset + length)
            .map((s) => ({
              ...s,
              startSeconds: Math.max(0, s.startSeconds - offset),
              endSeconds: Math.min(length, s.endSeconds - offset),
            }));
        else if (hasAudio) {
          segments = await transcribeChunk(source, folder, offset, length);
        }
        const images: string[] = [],
          frameTimes: number[] = [];
        if (hasVideo)
          for (const fraction of [0.08, 0.36, 0.64, 0.9]) {
            const time = Math.min(duration - 0.05, offset + length * fraction),
              file = path.join(folder, 'frame.jpg');
            await runLocal(
              t.ffmpeg,
              [
                '-nostdin',
                '-v',
                'error',
                '-y',
                '-ss',
                String(Math.max(0, time)),
                '-i',
                source,
                '-frames:v',
                '1',
                '-vf',
                'scale=960:-2',
                '-q:v',
                '5',
                file,
              ],
              30000,
            );
            if (fs.existsSync(file)) {
              images.push('data:image/jpeg;base64,' + fs.readFileSync(file).toString('base64'));
              frameTimes.push(time - offset);
              fs.unlinkSync(file);
            }
          }
        const context = {
          ...job.context,
          durationSeconds: length,
          offsetSeconds: job.context.offsetSeconds + offset,
          hasAudio: hasAudio || !!captions,
        };
        job.stage = `${job.selection?.harness === 'claude' ? 'Claude' : 'Codex'} analisando transcrição e imagens pela assinatura`;
        this.write(job);
        const prompt =
          lessonPrompt(context) +
          `\nVocê recebe uma transcrição LOCAL automática (pode conter erros) e ${images.length} imagens, NÃO o áudio/vídeo original. Não afirme ter ouvido o áudio. Baseie evidências de fala somente nesta transcrição. Horários das imagens em ordem: ${JSON.stringify(frameTimes)}. Transcrição/legenda: ${JSON.stringify(segments)}.`;
        const raw = parseJson(
          await this.harness.generate(
            prompt,
            analysisJsonSchema,
            images,
            job.selection?.model || '',
            job.selection?.harness || 'codex',
          ),
        );
        // Transcript is authoritative local ASR/captions; the model cannot rewrite it.
        raw.transcriptSegments = segments.slice(0, 80);
        const result = normalizeAnalysis(raw, context);
        result.transcriptSegments = segments.map((s) => ({
          ...s,
          startSeconds: s.startSeconds + context.offsetSeconds,
          endSeconds: s.endSeconds + context.offsetSeconds,
        }));
        result.concepts = result.concepts.map((c: any) => ({
          ...c,
          id: `${id}:${offset}:${c.id}`,
          mediaJobId: id,
        }));
        const mapping = new Map(
          raw.concepts.map((c: any, index: number) => [
            `${context.lessonId}:${c.id}`,
            result.concepts[index].id,
          ]),
        );
        result.connections = result.connections.map((c: any) => ({
          ...c,
          source: mapping.get(c.source),
          target: mapping.get(c.target),
        })) as any;
        job.parts.push(result);
        job.nextOffset = offset + length;
        this.write(job);
      }
      job.result = {
        ...job.parts[0],
        jobId: id,
        summary: job.parts.map((p: any) => p.summary).join('\n\n'),
        concepts: job.parts.flatMap((p: any) => p.concepts),
        connections: job.parts.flatMap((p: any) => p.connections),
        transcriptSegments: job.parts.flatMap((p: any) => p.transcriptSegments),
      };
      job.status = 'completed';
      job.stage = 'Pronto para revisar e aprovar';
      this.write(job);
    } catch (e: any) {
      job.status = 'failed';
      job.error =
        e instanceof AppError
          ? e.message
          : 'Falha na análise. O material foi preservado para tentar novamente.';
      job.code = e.code || 'ANALYSIS_FAILED';
      job.stage = 'Análise pausada';
      this.write(job);
    } finally {
      this.running.delete(id);
      for (const name of ['audio.wav', 'frame.jpg', 'transcript.json']) {
        const file = path.join(folder, name);
        if (fs.existsSync(file)) fs.unlinkSync(file);
      }
      if (job.status === 'completed' && !this.busy) {
        const next = this.list()
          .reverse()
          .find((j) => j.status === 'queued' && j.expiresAt > Date.now());
        if (next) void this.process(next.id);
      }
    }
  }
  async approve(
    id: string,
    choices: Array<{ id: string; startSeconds: number; endSeconds: number }>,
  ) {
    const job = this.get(id);
    if (job.status !== 'completed' || this.running.has(id))
      throw new AppError(
        409,
        'NOT_REVIEWABLE',
        'Este material não está disponível para aprovação.',
      );
    if (Date.now() >= job.expiresAt)
      throw new AppError(410, 'JOB_EXPIRED', 'Material temporário expirado.');
    const selected = choices.map((choice) => {
      const node = job.result.concepts.find((n: any) => n.id === choice.id);
      const start = choice.startSeconds - job.context.offsetSeconds,
        end = choice.endSeconds - job.context.offsetSeconds;
      if (!node || start < 0 || end <= start || end > job.duration + 0.1 || end - start > 300)
        throw new AppError(
          400,
          'INVALID_CLIP',
          'Confira os limites do trecho; máximo de cinco minutos por destaque.',
        );
      return { node, start, end, choice };
    });
    this.running.add(id);
    try {
      const t = toolPaths();
      const concepts = [];
      for (const [index, item] of selected.entries()) {
        const clip = path.join(this.folder(id), `clip-${index}.mp4`);
        await runLocal(t.ffmpeg, [
          '-nostdin',
          '-v',
          'error',
          '-y',
          '-ss',
          String(item.start),
          '-i',
          path.join(this.folder(id), 'source.media'),
          '-t',
          String(item.end - item.start),
          '-map',
          '0:v:0?',
          '-map',
          '0:a:0?',
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '24',
          '-c:a',
          'aac',
          '-movflags',
          '+faststart',
          clip,
        ]);
        concepts.push({
          ...item.node,
          startSeconds: item.choice.startSeconds,
          endSeconds: item.choice.endSeconds,
          mediaUrl: `/api/study/media/${id}/clip-${index}.mp4`,
        });
      }
      const ids = new Set(concepts.map((n) => n.id));
      job.result = {
        ...job.result,
        concepts,
        connections: job.result.connections.filter(
          (c: any) => ids.has(c.source) && ids.has(c.target),
        ),
      };
      job.status = 'approved';
      job.stage = 'Destaques aprovados';
      job.expiresAt = null;
      job.parts = undefined;
      job.captions = undefined;
      this.write(job);
      this.removeRaw(id, true);
      return job.result;
    } finally {
      this.running.delete(id);
    }
  }
  discard(id: string) {
    const job = this.get(id);
    if (this.running.has(id)) throw new AppError(409, 'JOB_BUSY', 'Aguarde o processamento.');
    this.removeRaw(id);
    job.status = 'discarded';
    job.stage = 'Material descartado';
    job.result = undefined;
    job.parts = undefined;
    job.expiresAt = null;
    job.captions = undefined;
    this.write(job);
  }
  mediaPath(id: string, name: string) {
    if (!/^(source\.media|clip-\d+\.mp4)$/.test(name))
      throw new AppError(404, 'MEDIA_NOT_FOUND', 'Mídia não encontrada.');
    const job = this.get(id);
    if (
      name === 'source.media' &&
      (job.expiresAt < Date.now() || !['completed', 'failed'].includes(job.status))
    )
      throw new AppError(410, 'MEDIA_EXPIRED', 'Mídia temporária indisponível.');
    return path.join(this.folder(id), name);
  }
}
