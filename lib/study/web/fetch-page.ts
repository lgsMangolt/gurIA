// Adaptado do OpenMAIC (MIT), https://github.com/THU-MAIC/OpenMAIC — veja THIRD_PARTY_NOTICES.md.
// Origem: lib/web-fetch/builtin-extraction.ts. Mantido: download com limite de
// bytes e prazo absoluto, DNS fixado e checagem SSRF a cada redirecionamento,
// recusa de captcha e de página vazia, Readability + Turndown. Removido: PDF
// (dependia dos extratores de documento do OpenMAIC) e o portão de URL das
// sessões de agente. Usado pela rota course-source para ler a página de um curso.
import { gfm } from '@joplin/turndown-plugin-gfm';
import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom/worker';
import TurndownService from 'turndown';
import {
  Agent,
  fetch as undiciFetch,
  type Dispatcher,
  type RequestInit as UndiciRequestInit,
} from 'undici';

import { createPinnedAgent } from './pinned-dispatcher';
import { normalizeUrlForStrictFetch } from './ssrf-guard';

const ALLOWED_CONTENT_TYPES = new Set(['text/html', 'text/plain', 'application/xhtml+xml']);
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_MIN_CHARS = 200;
const MAX_REDIRECTS = 5;
const CONNECT_TIMEOUT_MS = 5_000;
const HEADERS_TIMEOUT_MS = 10_000;
const BODY_TIMEOUT_MS = 30_000;
const BLOCKED_MARKERS = [
  '你似乎来到了没有知识存在的荒原',
  '环境异常',
  '完成验证',
  '访问过于频繁',
  '请完成安全验证',
  'captcha',
];

export type FetchUrlFailure = 'blocked' | 'empty' | 'unsupported_content_type' | 'network';

export class FetchUrlError extends Error {
  constructor(
    readonly reason: FetchUrlFailure,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'FetchUrlError';
  }
}

export interface FetchedPage {
  sourceUrl: string;
  finalUrl: string;
  title: string;
  markdown: string;
  contentType: string;
  truncated: boolean;
}

type FetchImplementation = (input: string | URL, init?: UndiciRequestInit) => Promise<Response>;

export interface FetchPageOptions {
  /** Só para testes: troca o fetch e o dispatcher (com DNS fixado) reais. */
  fetchImpl?: FetchImplementation;
  dispatcher?: Dispatcher;
  maxBytes?: number;
  minChars?: number;
  bodyTimeoutMs?: number;
  signal?: AbortSignal;
}

function createPinnedFetchAgent(): Agent {
  return createPinnedAgent({
    headersTimeout: HEADERS_TIMEOUT_MS,
    bodyTimeout: BODY_TIMEOUT_MS,
    connectTimeout: CONNECT_TIMEOUT_MS,
  });
}

function mediaType(response: Response): string {
  return (response.headers.get('content-type') ?? '').split(';', 1)[0]!.trim().toLowerCase();
}

function abortReadRace(signal: AbortSignal): { promise: Promise<never>; cleanup: () => void } {
  if (signal.aborted) {
    return {
      promise: Promise.reject(new FetchUrlError('network', 'Operation aborted')),
      cleanup: () => {},
    };
  }
  let listener: (() => void) | undefined;
  const promise = new Promise<never>((_resolve, reject) => {
    listener = () => reject(new FetchUrlError('network', 'Operation aborted'));
    signal.addEventListener('abort', listener, { once: true });
  });
  return {
    promise,
    cleanup: () => {
      if (listener) signal.removeEventListener('abort', listener);
    },
  };
}

async function readWithTruncation(
  response: Response,
  maxBytes: number,
  signal?: AbortSignal,
  timeoutMs = BODY_TIMEOUT_MS,
): Promise<{ bytes: Buffer; truncated: boolean }> {
  if (!response.body) throw new FetchUrlError('network', 'Fetch response has no body');
  const declared = Number(response.headers.get('content-length'));
  let truncated = Number.isFinite(declared) && declared > maxBytes;
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  // Prazo absoluto, não de ociosidade: um servidor que pinga um byte por vez não o estende.
  const deadline = Date.now() + timeoutMs;
  try {
    for (;;) {
      const remainingTime = deadline - Date.now();
      if (remainingTime <= 0) {
        throw new FetchUrlError('network', 'Timed out while reading response body');
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new FetchUrlError('network', 'Timed out while reading response body')),
          remainingTime,
        );
        timer.unref?.();
      });
      const abort = signal ? abortReadRace(signal) : null;
      const { done, value } = await Promise.race([
        reader.read(),
        timeout,
        ...(abort ? [abort.promise] : []),
      ]).finally(() => {
        if (timer) clearTimeout(timer);
        abort?.cleanup();
      });
      if (done) break;
      if (!value) continue;
      const remaining = maxBytes - total;
      if (value.byteLength > remaining) {
        if (remaining > 0) chunks.push(Buffer.from(value.subarray(0, remaining)));
        total += Math.max(0, remaining);
        truncated = true;
        await reader.cancel().catch(() => undefined);
        break;
      }
      chunks.push(Buffer.from(value));
      total += value.byteLength;
      if (total === maxBytes && truncated) {
        await reader.cancel().catch(() => undefined);
        break;
      }
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  return { bytes: Buffer.concat(chunks, total), truncated };
}

function normalizeUntrustedText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[​-‏⁠﻿]/gu, '')
    .replace(/[؜‪-‮⁦-⁩]/gu, '')
    .replace(/[-\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]/gu, '')
    .replace(/\r\n?/g, '\n');
}

function cleanMarkdown(value: string): string {
  return normalizeUntrustedText(value)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

/** HTML -> título e Markdown do conteúdo principal (sem menus, scripts e rodapés). */
export function extractHtmlToMarkdown(
  html: string,
  url: string,
): { title: string; markdown: string } {
  // Diferença do original: HTML vazio fazia o Readability lançar; aqui é página vazia.
  if (!html.trim()) return { title: '', markdown: '' };
  const { document } = parseHTML(html);
  // O Readability resolve links relativos e pontua o conteúdo a partir desta URL.
  Object.defineProperty(document, 'documentURI', { configurable: true, value: url });
  const article = new Readability(document as unknown as Document, { charThreshold: 200 }).parse();
  if (!article?.content) return { title: '', markdown: '' };
  const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
  turndown.use(gfm);
  return {
    title: normalizeUntrustedText(article.title ?? '').trim(),
    markdown: cleanMarkdown(turndown.turndown(article.content)),
  };
}

function matchingBlockedMarker(content: string): string | undefined {
  const compact = normalizeUntrustedText(content).replace(/\s+/gu, '').toLowerCase();
  return BLOCKED_MARKERS.find((marker) => compact.includes(marker.toLowerCase()));
}

function assertContentSuccess(markdown: string, minChars: number): void {
  const compact = markdown.replace(/\s+/gu, '');
  const blocked = matchingBlockedMarker(compact);
  if (blocked) {
    throw new FetchUrlError('blocked', `Page was blocked by anti-bot verification (${blocked})`);
  }
  if (compact.length === 0) throw new FetchUrlError('empty', 'Extracted page body is empty');
  if (compact.length < minChars) {
    throw new FetchUrlError(
      'empty',
      `Extracted page body is too short (${compact.length} characters; minimum ${minChars})`,
    );
  }
}

/** Baixa uma página pública (checando cada redirecionamento) e devolve título e texto. */
export async function fetchPageText(
  input: string,
  options: FetchPageOptions = {},
): Promise<FetchedPage> {
  const source = normalizeUrlForStrictFetch(input);
  const ownedAgent = options.dispatcher ? null : createPinnedFetchAgent();
  const dispatcher = options.dispatcher ?? ownedAgent!;
  const fetchImpl = options.fetchImpl ?? (undiciFetch as unknown as FetchImplementation);
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const bodyTimeoutMs = options.bodyTimeoutMs ?? BODY_TIMEOUT_MS;
  let current = source;
  let headers: Record<string, string> = { accept: [...ALLOWED_CONTENT_TYPES].join(', ') };
  try {
    if (options.signal?.aborted) {
      throw new FetchUrlError('network', 'Operation aborted', { cause: options.signal.reason });
    }
    for (let redirects = 0; ; redirects += 1) {
      const response = await fetchImpl(current, {
        method: 'GET',
        redirect: 'manual',
        headers,
        dispatcher,
        headersTimeout: HEADERS_TIMEOUT_MS,
        bodyTimeout: bodyTimeoutMs,
        ...(options.signal ? { signal: options.signal } : {}),
      } as UndiciRequestInit & { headersTimeout: number; bodyTimeout: number });
      if (response.status >= 300 && response.status < 400) {
        if (redirects >= MAX_REDIRECTS) {
          throw new FetchUrlError('network', `Too many redirects (maximum ${MAX_REDIRECTS})`);
        }
        const location = response.headers.get('location');
        if (!location) throw new FetchUrlError('network', 'Redirect response has no Location');
        const next = normalizeUrlForStrictFetch(new URL(location, current).href);
        await response.body?.cancel().catch(() => undefined);
        if (next.origin !== current.origin) {
          const { authorization: _authorization, cookie: _cookie, ...safeHeaders } = headers;
          headers = safeHeaders;
        }
        current = next;
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw new FetchUrlError('network', `Remote server returned HTTP ${response.status}`);
      }
      const contentType = mediaType(response);
      if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
        await response.body?.cancel().catch(() => undefined);
        throw new FetchUrlError(
          'unsupported_content_type',
          `Unsupported content type: ${contentType || '(missing)'}`,
        );
      }
      const downloaded = await readWithTruncation(response, maxBytes, options.signal, bodyTimeoutMs);
      const raw = downloaded.bytes.toString('utf8');
      const blocked = matchingBlockedMarker(raw);
      if (blocked) {
        throw new FetchUrlError('blocked', `Page was blocked by anti-bot verification (${blocked})`);
      }
      const extracted =
        contentType === 'text/plain'
          ? { title: '', markdown: cleanMarkdown(raw) }
          : extractHtmlToMarkdown(raw, current.href);
      assertContentSuccess(extracted.markdown, options.minChars ?? DEFAULT_MIN_CHARS);
      const fallbackTitle = decodeURIComponent(
        current.pathname.split('/').filter(Boolean).at(-1) ?? current.hostname,
      );
      return {
        sourceUrl: source.href,
        finalUrl: current.href,
        title: extracted.title || fallbackTitle,
        markdown: extracted.markdown,
        contentType,
        truncated: downloaded.truncated,
      };
    }
  } catch (error) {
    if (error instanceof FetchUrlError) throw error;
    throw new FetchUrlError('network', error instanceof Error ? error.message : String(error), {
      cause: error,
    });
  } finally {
    await ownedAgent?.close().catch(() => undefined);
  }
}
