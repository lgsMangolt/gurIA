# Aba Entrevista (simulado de entrevista de emprego) — desenho curto

Data: 2026-11-26 · Pedido do dono: "instala, coloca aba no gurIA escrito entrevista e utilize as skills para fazer uma entrevista" · Branch: `guria`

**Por quê:** treinar entrevista de emprego dentro da gurIA, em português, usando duas skills do Claude Code que o dono escolheu: [job-search-os](https://github.com/dbhat93/job-search-os) (MIT, skill `coach`) e [mock-interview](https://github.com/empathetech/mock-interview) (sem licença declarada).

**Objetivo:** aba "Entrevista": o dono descreve a vaga, a IA da assinatura (Claude ou Codex) faz o papel de entrevistador, uma pergunta por vez, e no fim dá um retorno honesto com notas.

**Não-objetivos (v1):** editor de código, SQL ou diagrama do mock-interview; currículo, LinkedIn e negociação do job-search-os; salvar entrevistas no banco; voz.

**Anti-objetivos:** copiar código ou texto do mock-interview para o repositório (sem licença); afrouxar a trava do Claude da gurIA (sem ferramentas, sem skills, sem comandos); gastar cota sem o dono pedir.

## Abordagens
- (A) Ligar as skills de verdade no Claude da gurIA (tirar `--disable-slash-commands`/`--setting-sources ''`). Descartada: dá à IA acesso a ferramentas e arquivos e só funcionaria com o Claude.
- (B) **Escolhida (minha):** as skills ficam instaladas em `~/.claude/skills/`; a gurIA lê, no servidor, os trechos de instrução e os envia como material de referência ao `generate` de sempre. Funciona com Claude e Codex, a trava continua igual, e nada das skills entra no repositório.
- (C) Reescrever o método em português dentro da gurIA. Descartada: o dono pediu para usar as skills.

## Como funciona
- **Turnos da entrevista:** `mock-interview/references/interviewer-persona.md` (persona, ficar no personagem, dicas calibradas) + a seção "Conducting the interview" do `mock-interview/SKILL.md`.
- **Retorno final:** `job-search-os/references/commands/mock.md` (notas em 5 critérios, as 3 mudanças para o próximo simulado) + a seção "The Retro" da persona (Plus / Minus / Delta).
- Tudo respondido em português do Brasil. A vaga e as respostas do candidato vão como dado não confiável.
- Rotas só no modo local: `interview-status` (quais skills estão instaladas), `interview-turn` e `interview-feedback`. Skill ausente → a aba explica como instalar.
- A conversa fica só na aba do navegador (sessionStorage), como a Conversa com IA.

## Decisões do construtor (minhas)
- Pasta das skills: `%USERPROFILE%\.claude\skills` (ou `GURIA_SKILLS_DIR`).
- Formulário: cargo (obrigatório), empresa, tipo (comportamental, técnica conversada, case, mista), nível, descrição da vaga e número de perguntas (padrão 5).
- Cada resposta do entrevistador e o retorno usam 1 pedido da assinatura; a tela diz isso.
