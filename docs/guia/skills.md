# Skills geradas pela gurIA

Uma **skill** é uma pasta de texto que um agente de IA (Claude Code ou Codex) pode carregar para usar o que você já domina. A gurIA gera skills a partir dos seus conceitos **dominados sem ajuda**, deixa você revisar tudo, guarda cada versão em um commit e só publica no GitHub quando você confirma.

## O que entra em uma skill

- Só conceitos **dominados**: duas demonstrações sem a sua ajuda, com pelo menos 3 dias de intervalo, e a última resposta certa (veja [a regra de domínio](estudos.md#domínio-de-um-conceito)).
- Conceitos em estudo ou com erro recente ficam de fora. Um conceito que perde o domínio (por exemplo, por um erro em Revisão espaçada) **sai da próxima versão**.
- Do conceito vão só o resumo, a anotação e o texto das evidências. Links de vídeo, caminhos do seu computador e dados de curso não entram.
- Suas respostas escritas só entram se você marcar **"incluir meus exemplos de resposta"** (desligado por padrão).

Cada skill tem esta estrutura:

```text
minha-skill/
  SKILL.md                 nome, descrição e instruções para o agente
  README.md                o que é, instalação e dependências
  references/<conceito>.md um arquivo por conceito
  .guria/manifest.json     versão e o estado de cada conceito (usado nas melhorias)
```

As skills da gurIA são só texto: não têm scripts nem dependências além do Claude Code ou do Codex.

## Onde ficam

Na aba **Skills** você escolhe o destino:

- **Repositório separado (recomendado):** uma pasta sua, de preferência um repositório git só para skills, com uma pasta por skill e um `README.md` na raiz com o índice e a instalação.
- **`skills-geradas/` dentro da gurIA:** uma pasta do próprio projeto, separada do código.

A gurIA precisa do `git` instalado e de uma identidade configurada (`git config --global user.name` e `user.email`). Se a pasta ainda não for um repositório, a tela oferece "Iniciar repositório aqui".

## Criar uma skill

1. Escolha o nome, os conceitos e, se quiser, os exemplos de resposta.
2. Clique em **Gerar modelo** (sem IA, sem gastar cota) ou **Redigir com IA** (usa uma chamada da IA que você escolheu, com aviso de uso de cota).
3. **Revise:** edite o `SKILL.md`, veja o diff de cada arquivo e leia os avisos.
4. **Salvar e criar commit:** grava os arquivos e cria **um commit por skill e versão** (`skill(nome): v1 — +3 −0 ~0 conceitos`), só com os arquivos da skill e o `README.md` raiz. Outras alterações que você tenha no repositório não entram.

## Melhorar uma skill

Em **Melhorar**, a gurIA compara os conceitos dominados de hoje com os da versão anterior e mostra o que foi **adicionado, removido ou alterado**. O que você escreveu no `SKILL.md` fora do bloco de conceitos é preservado. Você revisa o diff e salva a nova versão (`v2`, `v3`…). Se nada mudou, a gurIA avisa que não há o que melhorar.

## Privacidade e verificação

Antes de salvar, a gurIA procura no texto:

- **Bloqueia** (não dá para salvar): chaves e tokens (`ghp_…`, `sk-…`, `AKIA…`, chaves privadas, JWT, links com `token=`).
- **Avisa** (você precisa confirmar): e-mails, caminhos do computador, CPF, telefone e frases que parecem dar ordens ao agente ("ignore as instruções anteriores").

O texto de notas e transcrições é material de terceiros: **leia a skill antes de publicar**, principalmente se ela veio de uma transcrição de vídeo.

## Publicar no GitHub

A gurIA **nunca publica sozinha**. O envio só existe para o repositório separado e só depois de você ver na tela o remoto, a branch e os commits que serão enviados e **confirmar aquele remoto exato**, a cada vez:

- o remoto `origin` precisa ser um repositório do GitHub **seu** (não o do OpenMAIC);
- o envio nunca usa `--force`;
- a gurIA não guarda senhas nem tokens: usa o login que o seu `git` já tem.

Para o destino `skills-geradas/` não há envio pela gurIA; publique o repositório do projeto por conta própria.

## Instalar uma skill

Copie a pasta da skill para a pasta de skills do seu agente:

- Claude Code: `~/.claude/skills/<skill>/`
- Codex: `~/.codex/skills/<skill>/`

Para atualizar, copie a pasta de novo depois de uma nova versão.
