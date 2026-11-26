# Praticar logo após processar uma aula — desenho curto

Data: 2026-11-24 · Status: aprovado pelo dono no chat · Branch: `guria`

**Por quê:** na simulação de retenção (100 perfis, 3 meses), ninguém praticou no mês 1: o valor que segura a pessoa (exercício e revisão) só chegava um mês depois de instalar. Levar a pessoa ao Praticar no momento em que ela acabou de aprovar os conceitos de uma aula.

**Objetivo:**
- Ao aprovar os conceitos de uma aula importada, mostrar um aviso curto: "Praticar agora · N conceitos, cerca de M min", com **Praticar agora** e **Depois**. Só aparece se algum conceito aprovado tem exercício.
- No roteiro, cada aula processada ganha **Praticar esta aula**.
- Ambos abrem a aba Praticar no modo **Rápido**, com os conceitos da aula já marcados; a sessão só começa quando o aluno clica (como o Revisar faz hoje).

**Não-objetivos:** começar a sessão sozinho; mudar o Praticar; lembretes (item 2, separado).

**Anti-objetivo:** abrir como "Revisão espaçada" conceitos recém-aprovados (o `reviewTarget` atual faria isso, porque `due = 0` conta como vencido).

**Abordagens:** (a) aviso ao aprovar + botão no roteiro — **escolhida**; (b) pular direto para o Praticar ao aprovar — atrapalha quem revisa várias aulas seguidas; (c) só o botão no roteiro — perde o momento de maior interesse.

**Decisões do construtor (minhas):** função pura `lessonPracticeTarget(concepts, lessonId)` em `lib/study/ui/navigation.ts` → `{ mode: 'rapido', conceptIds }` ou `null`; minutos estimados = 1 por conceito, no mínimo 3 (aproximação exibida como "cerca de"); o aviso fica no próprio diálogo de revisão, que passa a mostrar o aviso em vez de fechar.
