import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractHtmlToMarkdown, fetchPageText, FetchUrlError } from '@/lib/study/web/fetch-page';

const paragraph = 'Este curso de estatística tem carga horária de 40 horas e cobre média, mediana e variância. ';
const html = `<!doctype html><html><head><title>Curso de Estatística</title><script>alert(1)</script></head>
<body><nav><a href="/">Início</a><a href="/cursos">Cursos</a></nav>
<article><h1>Curso de Estatística</h1><p>${paragraph.repeat(4)}</p><p>${paragraph.repeat(3)}</p></article>
<script>window.rastreio = true;</script></body></html>`;

// Um dispatcher qualquer: o fetch de teste não abre conexão de verdade.
const dispatcher = {} as never;
const page = (body: string, init: ResponseInit = {}) =>
  new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, ...init });

describe('extractHtmlToMarkdown', () => {
  it('devolve título e texto limpos, sem script nem menu', () => {
    const out = extractHtmlToMarkdown(html, 'https://exemplo.org/curso');
    expect(out.title).toBe('Curso de Estatística');
    expect(out.markdown).toContain('carga horária de 40 horas');
    expect(out.markdown).not.toMatch(/alert|rastreio|Início/);
  });

  it('HTML vazio devolve texto vazio', () => {
    expect(extractHtmlToMarkdown('', 'https://exemplo.org/')).toEqual({ title: '', markdown: '' });
  });

  // Saída gravada da função antiga do OpenMAIC (lib/web-fetch/builtin-extraction.ts,
  // apagada na fase 4) para as mesmas entradas: a cópia tem de continuar igual.
  it('a saída é igual à que a função antiga do OpenMAIC dava', () => {
    expect(extractHtmlToMarkdown(html, 'https://exemplo.org/a')).toEqual({
      title: 'Curso de Estatística',
      markdown: `${paragraph.repeat(4).trim()}

${paragraph.repeat(3).trim()}`,
    });
    for (const sample of ['<p>curto</p>', '<html><body></body></html>'])
      expect(extractHtmlToMarkdown(sample, 'https://exemplo.org/a')).toEqual({ title: '', markdown: '' });
  });
});

describe('fetchPageText', () => {
  it('baixa e extrai uma página HTML pública', async () => {
    const result = await fetchPageText('https://exemplo.org/curso', {
      dispatcher,
      fetchImpl: async () => page(html),
    });
    expect(result.title).toBe('Curso de Estatística');
    expect(result.markdown).toContain('40 horas');
    expect(result.finalUrl).toBe('https://exemplo.org/curso');
  });

  it('recusa endereço da rede local antes de conectar', async () => {
    let called = false;
    const fetchImpl = async () => {
      called = true;
      return page(html);
    };
    for (const url of ['http://127.0.0.1/', 'http://localhost:3033/api/study/workspace', 'http://10.0.0.1/', 'file:///c:/Windows/win.ini']) {
      await expect(fetchPageText(url, { dispatcher, fetchImpl })).rejects.toThrow();
    }
    expect(called).toBe(false);
  });

  it('recusa um redirecionamento para a rede local', async () => {
    const fetchImpl = async () =>
      new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' } });
    await expect(fetchPageText('https://exemplo.org/curso', { dispatcher, fetchImpl })).rejects.toThrow();
  });

  it('PDF não é lido (a gurIA só lê páginas de texto)', async () => {
    const fetchImpl = async () =>
      new Response('%PDF-1.4', { status: 200, headers: { 'content-type': 'application/pdf' } });
    const err = await fetchPageText('https://exemplo.org/a.pdf', { dispatcher, fetchImpl }).catch((e) => e);
    expect(err).toBeInstanceOf(FetchUrlError);
    expect(err.reason).toBe('unsupported_content_type');
  });

  it('página curta demais ou bloqueada por captcha falha', async () => {
    await expect(
      fetchPageText('https://exemplo.org/', { dispatcher, fetchImpl: async () => page('<p>oi</p>') }),
    ).rejects.toMatchObject({ reason: 'empty' });
    await expect(
      fetchPageText('https://exemplo.org/', {
        dispatcher,
        fetchImpl: async () => page(`<p>Please solve the captcha</p>${html}`),
      }),
    ).rejects.toMatchObject({ reason: 'blocked' });
  });

  it('corta o corpo no limite de bytes', async () => {
    const result = await fetchPageText('https://exemplo.org/curso', {
      dispatcher,
      maxBytes: 100_000,
      fetchImpl: async () => page(html + `<p>${'x'.repeat(200_000)}</p>`),
    });
    expect(result.truncated).toBe(true);
  });
});

it('README e guias não citam a Área Pro', () => {
  const root = path.resolve(__dirname, '..', '..');
  const files = ['README.md', ...fs.readdirSync(path.join(root, 'docs', 'guia')).map((f) => path.join('docs', 'guia', f))];
  for (const file of files) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    expect(text, file).not.toMatch(/área Pro|OPENMAIC_STUDY_PRO_CODEX/i);
  }
});
