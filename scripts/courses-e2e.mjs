// Roteiro e2e de "Importar curso" na demo isolada (porta 3034, dados sintéticos, sem IA).
// Pré-requisito: `npm run demo`. Uso: `npm run e2e:cursos`.
// Copia tests/fixtures/curso-exemplo para uma pasta temporária e a remove no final.
// A aula "processada" usa um resultado fictício gravado em disco (o mesmo arquivo que a IA geraria).
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';

const base = 'http://127.0.0.1:3034';
const OWNER = 'readme-demo';
const out = process.env.E2E_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'guria-cursos-e2e-'));
const course = fs.mkdtempSync(path.join(os.tmpdir(), 'guria-curso-e2e-'));
fs.cpSync(path.join(import.meta.dirname, '..', 'tests', 'fixtures', 'curso-exemplo'), course, {
  recursive: true,
});
const dataRoot = path.join(
  process.env.LOCALAPPDATA || os.homedir(),
  'gurIA',
  'Estudos',
  createHash('sha256').update(OWNER).digest('hex'),
);

const results = [];
const errors = [];
const forbidden = [];
let page;
async function step(name, fn) {
  try {
    await fn();
    results.push([name, true]);
    console.log('OK   ' + name);
  } catch (e) {
    results.push([name, false]);
    console.log('FALHA ' + name + '\n     ' + String(e.message).split('\n')[0]);
    try {
      await page.screenshot({ path: path.join(out, 'falha-' + results.length + '.png') });
    } catch {}
  }
}
const H = { 'Content-Type': 'application/json', Origin: base };
const api = async (route, body, method = body ? 'POST' : 'GET') => {
  const r = await fetch(base + '/api/study/' + route, {
    method,
    headers: H,
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json();
};
const imported = async () => {
  const w = await api('workspace');
  return { w, c: w.data.courses.find((c) => c.importSource === fs.realpathSync.native(course)) };
};
const card = () => page.locator('.guria-course-roadmap').filter({ hasText: path.basename(course) });
const titles = () => card().locator('li strong').allInnerTexts();
const openMaterials = async () => {
  await page.getByRole('button', { name: 'Aulas e materiais', exact: true }).click();
  await page.getByRole('heading', { name: 'Cursos importados' }).waitFor();
};
const importFolder = async () => {
  await page.getByRole('button', { name: 'Importar curso', exact: true }).click();
  await page.getByPlaceholder(/curso\.zip/).fill(course);
  await page.getByText('O material é meu ou tenho autorização').click();
  await page.getByRole('button', { name: 'Importar', exact: true }).click();
  const status = page.getByRole('status').filter({ hasText: /\d+ aulas?/ });
  await status.waitFor();
  const text = await status.innerText();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  return text;
};

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: 'pt-BR' });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  page.on('response', (r) => {
    if (r.status() >= 400 && r.status() !== 409)
      errors.push(`${r.status()} ${r.request().method()} ${r.url()}`);
  });
  page.on('dialog', (d) => d.accept());
  page.on('request', (r) => {
    if (/\/api\/study\/(course-lesson-process|course-process-rest)$/.test(r.url()))
      forbidden.push('processamento com IA: ' + r.url());
    if (
      /\/api\/study\/(session-grade|exercise-regrade|exercise-grade-batch|grade|deepen|chat)\b/.test(
        r.url(),
      )
    )
      forbidden.push('IA: ' + r.url());
  });
  await page.goto(base + '/study', { timeout: 180000 });
  await page
    .getByRole('button', { name: 'Aulas e materiais', exact: true })
    .waitFor({ timeout: 180000 });
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await openMaterials();

  await step('1. Importar a pasta pela tela mostra o relatório', async () => {
    const text = await importFolder();
    if (!/3 aulas · 3 novas · 1 arquivos ignorados/.test(text))
      throw new Error('relatório: ' + text);
  });

  await step('2. Roteiro em ordem natural (1, 2, 10)', async () => {
    await card().waitFor();
    const t = await titles();
    if (t.join('|') !== 'Aula 1 - Abertura|Aula 2 - Exemplos|Aula 10 - Revisão')
      throw new Error('ordem: ' + t.join(' | '));
  });

  await step('3. Renomear a primeira e juntar a 2 com a 10', async () => {
    await card().getByRole('button', { name: 'Renomear' }).first().click();
    await card().getByLabel('Renomear').fill('Abertura do curso');
    await card().getByRole('button', { name: 'Salvar' }).click();
    await card().getByText('Abertura do curso').waitFor();
    await card().getByRole('button', { name: 'Juntar com a próxima' }).nth(1).click();
    await page.waitForFunction(
      () =>
        document.querySelectorAll('.guria-course-roadmap li').length <=
        2 * document.querySelectorAll('.guria-course-roadmap').length,
    );
    const t = await titles();
    if (t.join('|') !== 'Abertura do curso|Aula 2 - Exemplos')
      throw new Error('roteiro: ' + t.join(' | '));
  });

  await step('4. Reimportar mantém a edição e não cria aulas', async () => {
    const text = await importFolder();
    if (!/2 aulas/.test(text) || /novas/.test(text)) throw new Error('relatório: ' + text);
    const t = await titles();
    if (t.join('|') !== 'Abertura do curso|Aula 2 - Exemplos')
      throw new Error('roteiro: ' + t.join(' | '));
  });

  await step('5. A estimativa aparece antes e Cancelar não envia nada', async () => {
    await card().getByRole('button', { name: 'Processar esta aula' }).first().click();
    await page.getByText(/Vai enviar 1 pedido/).waitFor();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();
  });

  await step('6. Revisar a aula (resultado fictício) e aprovar sem domínio', async () => {
    const { w, c } = await imported();
    const lesson = c.lessons[0];
    const dir = path.join(dataRoot, 'courses', c.id, 'results');
    fs.mkdirSync(dir, { recursive: true });
    const id = `${lesson.id}:ideia`;
    fs.writeFileSync(
      path.join(dir, `${lesson.id}.json`),
      JSON.stringify({
        summary: 'Resumo fictício da abertura.',
        concepts: [
          {
            id,
            label: 'Ideia central',
            summary: 'O conceito principal do curso.',
            note: 'Explicação.',
            originalTerms: [],
            evidence: '[00:30] O primeiro conceito é a ideia central.',
            startSeconds: 30,
            endSeconds: 120,
            exercises: [
              {
                type: 'escolha',
                id: `${id}:ex1`,
                prompt: 'Qual é o primeiro conceito?',
                options: ['a ideia central', 'a revisão'],
                answerIndexes: [0],
                explanation: '',
              },
            ],
          },
        ],
        connections: [],
      }),
    );
    const data = structuredClone(w.data);
    data.courses.find((x) => x.id === c.id).lessons[0].status = 'aguardando-revisao';
    await api('workspace', { revision: w.revision, data }, 'PUT');
    await page.reload();
    await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
    await openMaterials();
    await card().getByRole('button', { name: 'Revisar', exact: true }).click();
    await page.getByText('Resumo fictício da abertura.').waitFor();
    await page.getByRole('button', { name: 'Aprovar selecionados' }).click();
    await page.getByText('1 conceito aprovado.').waitFor();
    const after = await imported();
    const concept = after.w.data.concepts.find((x) => x.id === id);
    if (!concept || concept.attempts.length || concept.exercises.length !== 1)
      throw new Error('conceito: ' + JSON.stringify(concept));
    if (after.c.lessons[0].status !== 'processada')
      throw new Error('status: ' + after.c.lessons[0].status);
  });

  await step(
    '6b. Depois de aprovar, oferece Praticar agora e abre o Rápido com a aula marcada',
    async () => {
      await page.getByText('Praticar agora · 1 conceito, cerca de 3 min').waitFor();
      await page.getByRole('button', { name: 'Praticar agora', exact: true }).click();
      // O Praticar mostra "Carregando…" antes do seletor de modo: espera o seletor.
      const modos = page.getByRole('radiogroup', { name: 'Modo de estudo' });
      await modos.waitFor({ timeout: 60000 });
      const rapido = await modos
        .getByRole('radio', { name: /Rápido/ })
        .getAttribute('aria-checked');
      if (rapido !== 'true') throw new Error('modo Rápido não veio selecionado');
      if (!(await page.getByLabel('Ideia central').isChecked()))
        throw new Error('conceito da aula não veio marcado');
      await openMaterials();
      await card().getByRole('button', { name: 'Praticar esta aula' }).waitFor();
    },
  );

  await step('7. Apostila com a aula processada, a pendente e o gabarito', async () => {
    await card().getByRole('button', { name: 'Abrir apostila' }).click();
    const sheet = page.locator('.guria-apostila');
    await sheet.getByText('Gabarito').waitFor();
    const text = await sheet.innerText();
    for (const expected of [
      'Abertura do curso',
      'Aula 2 - Exemplos — pendente',
      'Ideia central',
      '1. a ideia central',
    ])
      if (!text.includes(expected)) throw new Error('faltou: ' + expected);
    await page.screenshot({ path: path.join(out, '7-apostila.png') });
    await sheet.getByRole('button', { name: 'Fechar' }).click();
  });

  await step('8. Tela estreita (390 px) sem rolagem horizontal', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    if (overflow > 2) throw new Error('rolagem horizontal de ' + overflow + 'px');
    await card().scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(out, '8-mobile.png') });
  });

  await step('9. Sem processamento com IA e sem erros de console', async () => {
    if (forbidden.length) throw new Error('chamadas proibidas: ' + forbidden.join(', '));
    if (errors.length) throw new Error('erros: ' + errors.slice(0, 3).join(' | '));
  });
} finally {
  await browser.close();
  fs.rmSync(course, { recursive: true, force: true });
}
const failed = results.filter(([, ok]) => !ok);
console.log(
  `\n${results.length - failed.length}/${results.length} passos aprovados. Capturas em ${out}`,
);
process.exit(failed.length ? 1 : 0);
