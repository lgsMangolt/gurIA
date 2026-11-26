# Aviso do Windows para revisões vencidas — desenho curto

Data: 2026-11-24 · Status: aprovado pelo dono no chat (abordagem B) · Branch: `guria`

**Por quê:** na simulação de retenção, quem não estava preso a um prazo simplesmente esquecia de abrir a gurIA; sem aviso, a revisão espaçada depende de lembrar sozinho, o que anula o espaçamento.

**Objetivo:** um aviso diário opcional do Windows — "gurIA · 3 conceitos para revisar hoje" — que funciona com o app e o Docker fechados; clicar abre a gurIA.

**Não-objetivos:** e-mail; aviso pelo navegador; lembrete de aulas a processar; qualquer serviço externo.

**Anti-objetivos:** mostrar nomes de conceitos (aparece na tela de bloqueio); ligar sozinho; travar ou atrasar um salvamento; avisar com zero revisões; criar tarefa no Windows sem o dono pedir.

**Abordagens:** (A) tarefa que liga o Docker e lê o banco — pesada e frágil; (B) arquivo-resumo + tarefa agendada lendo o arquivo — **escolhida pelo dono**; (C) programa sempre aberto perto do relógio — processo extra e mais código.

## Como funciona (B)

1. **Arquivo-resumo.** A cada salvamento bem-sucedido (`saveWorkspace`), a gurIA grava `<pasta de dados do dono>/lembrete-revisoes.json` com `{ "versao": 1, "atualizado": <ms>, "vencimentos": [<ms>, …] }`: um vencimento por conceito que tem exercício e já foi praticado (pelo menos uma tentativa). Só datas; nenhum texto de estudo. Falha ao gravar nunca derruba o salvamento.
2. **Script do aviso** `scripts/lembrete-revisoes.ps1 -Arquivo <caminho> [-Abrir <alvo>]` (Windows PowerShell 5.1, sem módulos): lê o arquivo, conta vencimentos ≤ agora; se > 0, mostra um aviso nativo do Windows (API de notificações do próprio Windows) com o título "gurIA" e o texto "N conceito(s) para revisar hoje"; clicar abre `-Abrir` (o atalho `gurIA.lnk` do menu Iniciar, se existir; senão `http://127.0.0.1:3033/study?tab=praticar`). Arquivo ausente ou com erro: sai sem aviso.
3. **Tarefa agendada** "gurIA\\Lembrete de revisões": diária no horário escolhido, roda o script escondido; se o PC estava desligado no horário, roda quando ligar. Criada/removida pela própria gurIA quando o dono liga/desliga em Configurações (só no modo local).
4. **Configurações → "Lembrete de revisões"**: desligado por padrão; ao ligar, escolhe a hora (padrão 19:00); mostra se está ativo e quando roda; botão "Testar agora" mostra o aviso imediatamente (com a contagem real, ou "Nenhuma revisão vencida agora" na tela se zero).

## Decisões do construtor (minhas)
- Conta só conceitos já praticados (os nunca praticados têm `due = 0` e ficariam "vencidos" para sempre).
- Script em PowerShell 5.1 porque vem com todo Windows; a tarefa é criada com `Register-ScheduledTask` (com "executar quando disponível").
- A rota recebe a hora (`HH:MM`, 00:00–23:59) e monta o comando ela mesma; nada do cliente vira linha de comando.
- Nos testes, o executor de comandos é falso; no Windows real, a tarefa só é criada quando o dono ligar na tela.
