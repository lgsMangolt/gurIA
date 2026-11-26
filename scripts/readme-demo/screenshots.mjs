// Gera os screenshots do README a partir da demo isolada (porta 3034, dados sintéticos).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const base = 'http://127.0.0.1:3034';
if (!base.startsWith('http://127.0.0.1:3034'))
  throw new Error('Só a demo isolada pode ser fotografada.');
const out = path.join(root, 'docs', 'screenshots');
fs.mkdirSync(out, { recursive: true });
const PERSONAL = /C:\\Users|AppData|@[a-z0-9.-]+\.[a-z]+/i;

// Destino TEMPORÁRIO para a tela de Skills: um repositório git vazio, removido no final.
// O caminho nunca aparece nas imagens (a foto da tela de Skills começa na revisão, abaixo do destino).
const skillsRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'guria-shots-skills-'));
const git = (...args) => execFileSync('git', args, { cwd: skillsRepo, windowsHide: true });
git('init', '-q', '-b', 'main');
git('config', 'user.name', 'Demo');
git('config', 'user.email', 'demo@example.test');
const headers = { 'Content-Type': 'application/json', Origin: base };
const configured = await fetch(base + '/api/study/skill-config', {
  method: 'PUT',
  headers,
  body: JSON.stringify({ mode: 'separate', repoPath: skillsRepo }),
});
if (!configured.ok) throw new Error('Não foi possível configurar o destino temporário das skills.');

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '/study', { timeout: 180000 });
  await page
    .getByRole('button', { name: 'Plano de estudos', exact: true })
    .waitFor({ timeout: 180000 });

  // Esconde o selo "Compiling"/logo do Next em modo dev.
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  const shot = async (name) => {
    // Texto da tela + valores dos campos VISÍVEIS (o caminho do destino mora num campo).
    const text = await page.evaluate(() =>
      [
        document.body.innerText,
        ...[...document.querySelectorAll('input,textarea')]
          .filter((e) => e.offsetParent !== null)
          .map((e) => e.value),
      ].join('\n'),
    );
    if (PERSONAL.test(text))
      throw new Error(`Dado pessoal na tela ${name}: ${text.match(PERSONAL)[0]}`);
    const file = path.join(out, name + '.png');
    await page.screenshot({ path: file });
    console.log(file);
  };
  const section = async (name) => {
    await page.getByRole('button', { name, exact: true }).click();
    await page.getByRole('heading', { name, exact: true }).waitFor();
    await page.waitForTimeout(1500);
  };

  await section('Rede de conhecimento');
  await page.getByLabel('Rede de conhecimento 3D · esferas foscas').waitFor({ timeout: 60000 });
  await page.waitForTimeout(4000);
  await shot('rede-3d');
  await page.getByRole('button', { name: 'Mapa 2D', exact: true }).click();
  await page.waitForTimeout(2000);
  await shot('rede-2d');
  await section('Plano de estudos');
  await shot('plano');
  await section('Aulas e materiais');
  await shot('aulas');
  // Configurações mostra plano/uso da conta real de IA: não entra nos screenshots públicos.
  await page.getByRole('button', { name: 'Estudos', exact: true }).click();
  await page.getByRole('heading', { name: 'O que você quer estudar?' }).waitFor();
  await page.waitForTimeout(1500);
  await shot('estudos');

  // Praticar: sessão Rápido aberta no primeiro exercício, com a confiança marcada.
  await section('Praticar');
  await page.getByRole('radio', { name: /^Rápido/ }).click();
  await page.getByRole('button', { name: 'Começar sessão' }).click();
  await page.getByText(/item 1 de \d+/).waitFor({ timeout: 30000 });
  await page.getByLabel('Mais ou menos').check();
  await page.waitForTimeout(500);
  await shot('praticar');

  // Skills: revisão de uma skill criada pelo modelo (sem IA) com dois conceitos dominados.
  await page.getByRole('button', { name: 'Encerrar sessão' }).click();
  await page.getByRole('button', { name: 'Concluir' }).click();
  await section('Skills');
  await page.getByRole('button', { name: 'Nova skill' }).click();
  await page.getByLabel('Nome da skill').fill('Estatística básica');
  await page.getByLabel('População e amostra', { exact: true }).check();
  await page.getByLabel('Média e mediana', { exact: true }).check();
  await page.getByRole('button', { name: 'Gerar modelo (sem IA)' }).click();
  const review = page.getByRole('heading', { name: /Revisar Estatística básica/ });
  await review.waitFor();
  // O cartão de destino mostra o caminho da pasta (pessoal): sai da foto.
  await page.evaluate(() => {
    const card = document.querySelector('.guria-skills-destination');
    if (card) card.style.display = 'none';
  });
  await review.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -24));
  await page.waitForTimeout(500);
  await shot('skills');
  if (errors.length) throw new Error('Erros na página: ' + errors.join(' | '));
} finally {
  await browser.close();
  fs.rmSync(skillsRepo, { recursive: true, force: true });
}
