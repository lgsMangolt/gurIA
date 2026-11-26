// Roteiro e2e da aba Skills na demo isolada (porta 3034, dados sintéticos, sem IA e sem push).
// Pré-requisito: `node scripts/readme-demo/up.mjs`. Uso: `node scripts/skills-e2e.mjs`.
// Cria um repositório git TEMPORÁRIO como destino e o remove no final. Capturas: pasta temporária.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';

const base = 'http://127.0.0.1:3034';
if (!base.startsWith('http://127.0.0.1:3034')) throw new Error('Só a demo isolada pode ser usada.');
const out = process.env.E2E_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'guria-skills-e2e-'));
const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'guria-skills-repo-'));
const git = (...args) =>
  execFileSync('git', args, { cwd: repo, encoding: 'utf8', windowsHide: true }).trim();
git('init', '-q', '-b', 'main');
git('config', 'user.name', 'Teste e2e');
git('config', 'user.email', 'e2e@example.test');

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
const api = (route, body, method = body ? 'POST' : 'GET') =>
  fetch(base + '/api/study/' + route, {
    method,
    headers: H,
    body: body ? JSON.stringify(body) : undefined,
  });
const openSkills = async () => {
  await page.getByRole('button', { name: 'Skills', exact: true }).click();
  await page.getByRole('heading', { name: 'Skills', exact: true }).waitFor();
};
const body = () => page.evaluate(() => document.body.innerText);
const editor = () => page.getByLabel('SKILL.md (você pode editar)');

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: 'pt-BR' });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  page.on('response', (r) => {
    if (
      r.status() >= 400 &&
      r.status() !== 409 &&
      r.status() !== 422
    )
      errors.push(`${r.status()} ${r.request().method()} ${r.url()}`);
  });
  page.on('request', (r) => {
    if (/\/api\/study\/skill-push$/.test(r.url()) && r.method() === 'POST')
      forbidden.push('skill-push');
    if (/\/api\/study\/skill-preview$/.test(r.url()) && /"mode":"ai"/.test(r.postData() ?? ''))
      forbidden.push('skill-preview com IA');
    if (
      /\/api\/study\/(session-grade|exercise-regrade|exercise-grade-batch|grade|deepen|chat)\b/.test(
        r.url(),
      )
    )
      forbidden.push('IA: ' + r.url());
  });
  await page.goto(base + '/study', { timeout: 180000 });
  await page.getByRole('button', { name: 'Skills', exact: true }).waitFor({ timeout: 180000 });
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });

  await step('1. A aba Skills pede o destino', async () => {
    await openSkills();
    await page.getByRole('heading', { name: 'Onde guardar as skills' }).waitFor();
  });

  await step('2. Configurar o destino em um repositório separado', async () => {
    await page.getByLabel('Caminho completo da pasta do repositório').fill(repo);
    await page.getByRole('button', { name: 'Salvar destino' }).click();
    await page.getByText('✓ a pasta é um repositório').waitFor();
    await page.getByText('✓ identidade do git configurada').waitFor();
    await page.getByRole('heading', { name: 'Suas skills' }).waitFor();
    await page.screenshot({ path: path.join(out, '2-destino.png') });
  });

  await step('3. Criar uma skill com 2 conceitos pelo modelo, sem IA', async () => {
    await page.getByRole('button', { name: 'Nova skill' }).click();
    await page.getByLabel('Nome da skill').fill('Estatística básica');
    await page.getByLabel('População e amostra', { exact: true }).check();
    await page.getByLabel('Média e mediana', { exact: true }).check();
    await page.getByRole('button', { name: 'Gerar modelo (sem IA)' }).click();
    await page.getByRole('heading', { name: /Revisar Estatística básica · v1/ }).waitFor();
  });

  await step('4. A revisão mostra o SKILL.md e o diff, sem avisos', async () => {
    const md = await editor().inputValue();
    if (!md.includes('name: estatistica-basica')) throw new Error('name do frontmatter ausente');
    await page.getByText('+2 conceitos').waitFor();
    if ((await body()).includes('Avisos')) throw new Error('não deveria haver avisos');
    if (await page.getByRole('button', { name: 'Salvar e criar commit' }).isDisabled())
      throw new Error('salvar deveria estar habilitado');
    await page.screenshot({ path: path.join(out, '4-revisao.png') });
  });

  await step('5. Aviso exige confirmação; chave bloqueia sem saída', async () => {
    const original = await editor().inputValue();
    const save = page.getByRole('button', { name: 'Salvar e criar commit' });
    await editor().fill(original + '\nContato: fulano@exemplo.com\n');
    await page.getByText('E-mail', { exact: false }).first().waitFor();
    if (!(await save.isDisabled())) throw new Error('aviso sem confirmação não pode salvar');
    await page.getByLabel(/Li os avisos/).check();
    if (await save.isDisabled()) throw new Error('com confirmação deveria salvar');
    await editor().fill(original + '\nchave ghp_' + 'a'.repeat(36) + '\n');
    await page.getByText('Chave ou token').first().waitFor();
    if (!(await save.isDisabled())) throw new Error('chave não pode salvar');
    if (await page.getByLabel(/Li os avisos/).count())
      throw new Error('chave não pode ter confirmação');
    await editor().fill(original.replace('## Quando usar', 'PARÁGRAFO DO DONO.\n\n## Quando usar'));
    if (await save.isDisabled()) throw new Error('texto limpo deveria salvar');
  });

  await step('6. Salvar cria um único commit só com os arquivos da skill', async () => {
    await page.getByRole('button', { name: 'Salvar e criar commit' }).click();
    await page.getByRole('heading', { name: 'Suas skills' }).waitFor();
    await page.getByText(/v1 · 2 conceitos/).waitFor();
    if (git('rev-list', '--count', 'HEAD') !== '1') throw new Error('esperava 1 commit');
    const files = git('show', '--name-only', '--pretty=format:%s', 'HEAD').split('\n');
    if (!/^skill\(estatistica-basica\): v1/.test(files[0]))
      throw new Error('mensagem inesperada: ' + files[0]);
    for (const f of [
      'README.md',
      'estatistica-basica/SKILL.md',
      'estatistica-basica/README.md',
      'estatistica-basica/.guria/manifest.json',
    ])
      if (!files.includes(f)) throw new Error('faltou ' + f);
    await page.screenshot({ path: path.join(out, '6-lista.png') });
  });

  await step(
    '7. Melhorar: o conceito que perdeu o domínio sai e o texto do dono fica',
    async () => {
      const ws = await (await api('workspace')).json();
      const c1 = ws.data.concepts.find((c) => c.id === 'c1');
      c1.attempts.push({
        at: Date.now(),
        correct: false,
        kind: 'choice',
        score: 0,
        helped: false,
        mode: 'revisao',
      });
      const put = await api('workspace', { revision: ws.revision, data: ws.data }, 'PUT');
      if (!put.ok) throw new Error('não foi possível alterar o domínio na demo');
      await page.reload();
      await openSkills();
      await page.getByRole('button', { name: 'Melhorar' }).click();
      await page.getByText(/1 conceito saiu do domínio e será removido/).waitFor();
      await page.getByRole('button', { name: 'Gerar modelo (sem IA)' }).click();
      await page.getByRole('heading', { name: /Revisar Estatística básica · v2/ }).waitFor();
      await page.getByText('−1').first().waitFor();
      const md = await editor().inputValue();
      if (!md.includes('PARÁGRAFO DO DONO.')) throw new Error('o texto do dono foi perdido');
      if (md.includes('[População e amostra]'))
        throw new Error('o conceito removido continua na skill');
      await page.screenshot({ path: path.join(out, '7-melhoria.png') });
      await page.getByRole('button', { name: 'Salvar e criar commit' }).click();
      await page.getByRole('heading', { name: 'Suas skills' }).waitFor();
      if (git('rev-list', '--count', 'HEAD') !== '2') throw new Error('esperava 2 commits');
      if (!/^skill\(estatistica-basica\): v2/.test(git('log', '-1', '--format=%s')))
        throw new Error('commit v2 ausente');
    },
  );

  await step('8. Publicar: sem remoto, nenhum envio acontece', async () => {
    await page.getByRole('heading', { name: 'Publicar no GitHub' }).waitFor();
    await page.getByText(/Nenhum remoto configurado/).waitFor();
    await page.getByText('A gurIA nunca publica sozinha').waitFor();
    if (await page.getByRole('button', { name: /Enviar ao GitHub/ }).count())
      throw new Error('não deveria oferecer envio');
  });

  await step('9. Tela estreita (390 px) sem rolagem horizontal', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    if (overflow > 2) throw new Error('rolagem horizontal de ' + overflow + 'px');
    await page.screenshot({ path: path.join(out, '9-mobile.png') });
  });

  await step('10. Sem erros de console, sem IA e sem envio', async () => {
    if (forbidden.length) throw new Error('chamadas proibidas: ' + forbidden.join(', '));
    if (errors.length) throw new Error('erros: ' + errors.slice(0, 3).join(' | '));
  });
} finally {
  await browser.close();
  fs.rmSync(repo, { recursive: true, force: true });
}
const failed = results.filter(([, ok]) => !ok);
console.log(
  `\n${results.length - failed.length}/${results.length} passos aprovados. Capturas em ${out}`,
);
process.exit(failed.length ? 1 : 0);
