// Roteiro e2e da aba Praticar na demo isolada (porta 3034, dados sintéticos, sem IA real).
// Pré-requisito: `node scripts/readme-demo/up.mjs`. Uso: `node scripts/practice-e2e.mjs`.
// As capturas vão para a pasta temporária (ou E2E_OUT); nunca para docs/.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';

const base = 'http://127.0.0.1:3034';
if (!base.startsWith('http://127.0.0.1:3034')) throw new Error('Só a demo isolada pode ser usada.');
const out = process.env.E2E_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'guria-e2e-'));
const FORBIDDEN =
  /\/api\/study\/(session-grade|exercise-regrade|exercise-grade-batch|grade|deepen|chat)\b/;

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const results = [];
const errors = [];
const forbiddenCalls = [];
const answers = [];
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
const text = () => page.evaluate(() => document.body.innerText);
const openPractice = async () => {
  await page.getByRole('button', { name: 'Praticar', exact: true }).click();
  await page.getByRole('heading', { name: 'Praticar', exact: true }).waitFor();
};
const chooseMode = (title) => page.getByRole('radio', { name: new RegExp('^' + title) }).click();
const start = async () => {
  await page.getByRole('button', { name: 'Começar sessão' }).click();
  await page.getByText(/item \d+ de \d+/).waitFor({ timeout: 20000 });
};
const concept = async (label) => {
  const details = page.locator('details', {
    has: page.locator('summary', { hasText: 'Conceitos' }),
  });
  if (!(await details.evaluate((d) => d.open)))
    await page.locator('summary', { hasText: 'Conceitos' }).click();
  await page.getByLabel(label, { exact: true }).check();
};
const confidence = () => page.getByLabel('Mais ou menos').check();
/** Responde o item atual conforme o tipo, sem usar IA (só escolha, ligar e escrita da Prova). */
async function answerCurrent({ allowWriting = false } = {}) {
  await confidence();
  if (await page.locator('.guria-practice-writing textarea').count()) {
    if (!allowWriting) throw new Error('escrita fora da Prova chamaria a IA');
    await page
      .locator('.guria-practice-writing textarea')
      .fill('Resposta de teste com bem mais de vinte caracteres.');
  } else if (await page.locator('.guria-practice-match').count()) {
    const lefts = await page.locator('ul[aria-label="Itens"] button').count();
    for (let i = 0; i < lefts; i++) {
      await page.locator('ul[aria-label="Itens"] button').nth(i).click();
      await page
        .locator('ul[aria-label="Correspondências"] button:not(:has(.guria-practice-linked))')
        .first()
        .click();
    }
  } else {
    await page
      .locator('input[type=radio][name^="choice-"], input[type=checkbox][name^="choice-"]')
      .first()
      .check();
  }
  await page.getByRole('button', { name: 'Responder' }).click();
}

try {
  page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: 'pt-BR' });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  page.on('response', (r) => {
    if (r.status() >= 400)
      errors.push(`${r.status()} ${r.request().method()} ${r.url()}`);
  });
  page.on('request', (r) => {
    if (FORBIDDEN.test(r.url()) || (/\/api\/study\/jobs/.test(r.url()) && r.method() !== 'GET'))
      forbiddenCalls.push(r.method() + ' ' + r.url());
    if (/\/api\/study\/session-answer/.test(r.url()) && r.method() === 'POST')
      answers.push(r.postData());
  });
  await page.goto(base + '/study', { timeout: 180000 });
  await page.getByRole('button', { name: 'Praticar', exact: true }).waitFor({ timeout: 180000 });
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });

  await step('1. Praticar mostra os quatro modos', async () => {
    await openPractice();
    for (const title of ['Rápido', 'Aprofundar', 'Prova', 'Revisão espaçada'])
      await page.getByRole('radio', { name: new RegExp('^' + title) }).waitFor();
    await page.screenshot({ path: path.join(out, '1-modos.png') });
  });

  await step('2. Rápido: confiança, escolha e ligar com feedback imediato, e resumo', async () => {
    await chooseMode('Rápido');
    await start();
    const first = await text();
    if (!/item 1 de \d+/.test(first)) throw new Error('primeiro item esperado');
    await answerCurrent();
    await page.getByText(/Nota: \d+%/).waitFor();
    await page.screenshot({ path: path.join(out, '2-feedback.png') });
  });

  await step('3. Recarregar no meio retoma a sessão sem repetir o item', async () => {
    await page.reload();
    await page.getByRole('button', { name: 'Praticar', exact: true }).click();
    await page.getByText(/item 2 de \d+/).waitFor({ timeout: 20000 });
    let guard = 0;
    while (
      !(await page.getByRole('heading', { name: /Resumo da sessão/ }).count()) &&
      guard++ < 12
    ) {
      if (await page.getByRole('button', { name: 'Responder' }).count()) {
        await answerCurrent();
        await page.getByRole('button', { name: 'Próximo' }).click();
      } else await page.waitForTimeout(300);
    }
    await page.getByRole('heading', { name: /Resumo da sessão/ }).waitFor({ timeout: 20000 });
    await page.getByRole('button', { name: 'Concluir' }).click();
  });

  await step(
    '4. Prova: sem resultado durante a sessão, resumo e aviso de custo, sem corrigir',
    async () => {
      await chooseMode('Prova');
      await concept('População e amostra');
      await concept('Variância');
      await start();
      await page.getByText(/Tempo restante/).waitFor();
      let guard = 0;
      while (
        !(await page.getByRole('heading', { name: /Resumo da sessão/ }).count()) &&
        guard++ < 6
      ) {
        if (await page.getByRole('button', { name: 'Responder' }).count()) {
          await answerCurrent({ allowWriting: true });
          await page.getByText('Resposta registrada.').first().waitFor();
          const body = await text();
          if (/Correto\.|Ainda não\.|Nota: \d+%/.test(body))
            throw new Error('resultado apareceu na Prova ativa');
          await page.getByRole('button', { name: 'Próximo' }).click();
        } else await page.waitForTimeout(300);
      }
      await page.getByRole('heading', { name: /Resumo da sessão/ }).waitFor({ timeout: 20000 });
      await page.getByText(/Serão enviados à IA escolhida: 1 texto/).waitFor();
      await page.getByRole('button', { name: 'Corrigir agora' }).waitFor();
      await page.screenshot({ path: path.join(out, '4-prova-resumo.png') });
      await page.getByRole('button', { name: 'Concluir' }).click();
    },
  );

  await step(
    '5. Desenho: em branco não envia; envio pede confirmação de custo e pode ser cancelado',
    async () => {
      await chooseMode('Aprofundar');
      await concept('Desvio padrão');
      await start();
      const send = page.getByRole('button', { name: 'Responder' });
      if (!(await send.isDisabled()))
        throw new Error('Responder deveria estar desabilitado com o canvas em branco');
      const canvas = page.locator('canvas.guria-practice-canvas');
      const box = await canvas.boundingBox();
      await page.mouse.move(box.x + 100, box.y + 100);
      await page.mouse.down();
      await page.mouse.move(box.x + 250, box.y + 180, { steps: 8 });
      await page.mouse.up();
      await page.getByRole('button', { name: 'Retângulo' }).click();
      await page.mouse.move(box.x + 300, box.y + 120);
      await page.mouse.down();
      await page.mouse.move(box.x + 420, box.y + 240, { steps: 5 });
      await page.mouse.up();
      await page.getByRole('button', { name: 'Desfazer' }).click();
      await confidence();
      if (await send.isDisabled())
        throw new Error('Responder deveria habilitar depois de desenhar');
      const before = answers.length;
      await send.click();
      await page.getByText('Este desenho será enviado à IA escolhida').waitFor();
      await page.screenshot({ path: path.join(out, '5-custo.png') });
      await page.getByRole('button', { name: 'Cancelar' }).click();
      if (answers.length !== before) throw new Error('o desenho foi enviado sem confirmação');
      await page.getByRole('button', { name: 'Encerrar sessão' }).click();
      await page.getByRole('heading', { name: /Resumo da sessão/ }).waitFor();
      await page.getByRole('button', { name: 'Concluir' }).click();
    },
  );

  await step('6. Respostas pendentes aparecem na aba', async () => {
    await page.getByRole('heading', { name: 'Respostas pendentes' }).waitFor();
    await page.getByText(/\d+ respostas? aguardando correção/).waitFor();
    await page.getByRole('button', { name: 'Corrigir pendentes' }).waitFor();
    await page.getByRole('button', { name: 'Descartar' }).first().waitFor();
  });

  await step('7. Tela estreita (390 px) sem rolagem horizontal', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    if (overflow > 2) throw new Error('rolagem horizontal de ' + overflow + 'px');
    await page.getByRole('radio', { name: /^Prova/ }).waitFor();
    await page.screenshot({ path: path.join(out, '7-mobile.png') });
  });

  await step('8. Nenhuma chamada de correção por IA e nenhum erro de console', async () => {
    if (forbiddenCalls.length) throw new Error('chamadas proibidas: ' + forbiddenCalls.join(', '));
    if (errors.length) throw new Error('erros: ' + errors.slice(0, 3).join(' | '));
  });
} finally {
  await browser.close();
}
const failed = results.filter(([, ok]) => !ok);
console.log(
  `\n${results.length - failed.length}/${results.length} passos aprovados. Capturas em ${out}`,
);
process.exit(failed.length ? 1 : 0);
