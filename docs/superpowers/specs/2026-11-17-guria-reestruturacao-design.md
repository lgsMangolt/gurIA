# gurIA — reestruturação: README, modos de estudo, exercícios, skills e saída do OpenMAIC

Data: 2026-11-17 · Status: aguardando aprovação · Projeto: `OpenMAIC-Estudos` (branch de trabalho nova, a partir de `codex/openmaic-study-local`)

## Intenção

A gurIA (beta 0.2.0) é um espaço pessoal de estudo em português que hoje roda sobre o OpenMAIC. O dono quer: (1) um README de verdade, com screenshots e instalação; (2) tirar o OpenMAIC, inclusive o código; (3) modos de estudo e formatos de exercício mais ricos; (4) transformar o que foi estudado e dominado em **skills** publicáveis no GitHub e melhorá-las depois pela própria gurIA.

Por quê: a gurIA deve ser um produto próprio, instalável por outras pessoas, e o conhecimento dominado deve virar algo reutilizável (skill) em vez de ficar preso no app.

## Objetivos

- README principal com screenshots reais e instalação reproduzível.
- Quatro modos de estudo: **Rápido, Aprofundar, Prova, Revisão espaçada**.
- Motor de exercícios próprio com quatro tipos: **escolha, ligar, desenho, escrita**, com correção por IA e rubrica.
- Geração de skills a partir do que foi **dominado sem ajuda**, com ciclo de melhoria dentro da gurIA.
- Remoção do código e da marca do OpenMAIC, com migração dos quizzes antigos.

## Não-objetivos

- Instalador nativo independente (continua beta local Next.js).
- Novos provedores de IA além de Codex e Claude, nem fallback automático entre eles.
- Publicar no GitHub sem confirmação explícita do dono, a cada vez.
- Modos "Ensinar" e "Projeto" (descartados por ora).

## Anti-objetivos (seria fracasso mesmo "funcionando")

- Perder dados de estudo existentes (conceitos, cursos, planos, revisões).
- Gastar cota da assinatura sem aviso (correção por IA é sob demanda; Prova corrige em lote no fim).
- Skill que ensina o que o aluno não dominou.
- Remover código do OpenMAIC que o módulo de estudo ainda usa.

## Restrições

- Português brasileiro, Windows, Node 22.19+, pnpm 10+, PostgreSQL local (Docker, porta 5440), Next.js.
- A licença MIT do OpenMAIC exige manter o aviso de copyright enquanto houver código derivado. Se todo o código derivado for removido, o aviso pode virar um crédito curto, mas o `LICENSE` original continua no histórico. Decisão final de como creditar é do dono.
- `node_modules` hoje é uma junction para `../OpenMAIC/node_modules`: a instalação precisa passar a ser independente.
- O módulo de estudo hoje usa documentos, identidade, DSL (`@openmaic/dsl`) e o player de quiz do OpenMAIC.
- Correção por IA usa o harness já escolhido (Codex ou Claude), com as travas de cota existentes.

## Abordagens consideradas (exercícios)

- **A. Estender o quiz do OpenMAIC** — rápido, mas aumenta a dependência que se quer remover.
- **B. Motor de exercícios próprio em `lib/study`** — mais trabalho inicial, independente do OpenMAIC. **Escolhida pelo dono.**
- **C. Híbrido** — tipos novos em B, antigos no player do OpenMAIC até a remoção. Fica como etapa de transição dentro de B.

Escolha: **B, com migração dos quizzes antigos.**

## Design

### 1. Modos de estudo

| Modo | Duração | Formatos | Feedback | Conta para domínio |
|---|---|---|---|---|
| Rápido | 15–20 min | escolha, ligar | imediato | peso baixo |
| Aprofundar | livre | desenho, ligar, escrita | imediato, com explicação | peso alto |
| Prova | com tempo | escolha, escrita | só no final, correção em lote | peso alto |
| Revisão espaçada | curto | recuperação curta (escolha ou resposta curta) | imediato | atualiza intervalo |

O modo é escolhido ao iniciar uma sessão e se integra ao planejador existente (`lib/study/planner.ts`): revisões vencidas e erros recentes continuam definindo prioridade.

### 2. Motor de exercícios (`lib/study/exercises`)

- Tipos: `escolha` (única/múltipla), `ligar` (conectar conceitos, montar mapa), `desenho` (canvas simples com traços, formas e texto), `escrita` (resposta livre).
- Cada exercício tem rubrica; `desenho` envia a imagem e `escrita` envia o texto ao harness escolhido; resposta estruturada com nota por critério e feedback.
- Antes de responder, o aluno marca confiança (calibração).
- Pesos de domínio: `escolha` pesa pouco (chute possível); `ligar`, `desenho`, `escrita` pesam mais. Um conceito só vira "dominado" com demonstração sem ajuda.
- Renderização na tela própria da gurIA (`app/study`), sem o player do OpenMAIC.

### 3. Skills

- Estrutura de cada skill: `SKILL.md` (frontmatter `name`/`description`, só conceitos dominados), `README.md`, `references/`, `scripts/` e `requirements.txt` ou `package.json` apenas quando houver código.
- Destino configurável pelo dono: **repositório separado (padrão)** ou pasta `skills-geradas/` dentro do repositório da gurIA (a pasta `skills/` atual é do OpenMAIC). Em repositório separado: `README.md` raiz com índice e instalação, uma pasta por skill, instalação copiando a pasta para `~/.claude/skills/` ou `~/.codex/skills/`.
- Conceitos em estudo ou com erro recente ficam de fora ou marcados "em estudo".
- Melhoria: a gurIA compara o estado do domínio com a última versão da skill, propõe diff e nova versão; o aluno revisa antes de salvar; um commit por skill e versão.
- A gurIA prepara pasta e commit; **enviar ao GitHub exige confirmação explícita a cada vez.**

### 4. README e documentação

- README novo na raiz: o que é, screenshots (rede 2D/3D, estudo guiado, exercícios, planejamento, skills), instalação passo a passo, testes, estado do projeto, crédito curto ao OpenMAIC.
- Screenshots tiradas do app real com dados sintéticos, em `docs/screenshots/`.
- Remover `README-zh.md`, `README.openmaic.md` e `CHANGELOG.md` herdado; mover o que for útil de `ESTUDOS.md` para `docs/`.

### 5. Remoção do OpenMAIC

Em etapas, sempre com `vitest.study.config.ts` e `tsc -p tsconfig.study.json` verdes:

1. Mapear o grafo de importações do módulo de estudo para os módulos do OpenMAIC.
2. Substituir dependências (documentos/DSL, identidade, banco, quiz) por equivalentes próprios, com migração dos dados existentes.
3. Migrar quizzes antigos para o formato `escolha` do motor novo.
4. Apagar módulos não usados (`components/classroom`, `workbench`, geração de slides etc., `packages`, `render-service`, `skills/openmaic`).
5. Tornar `node_modules` independente.

Etapa de maior risco; fica por último.

## Ordem de execução

1. README, docs e screenshots (seguro, rápido).
2. Motor de exercícios e modos.
3. Geração e melhoria de skills.
4. Remoção do OpenMAIC, em etapas.
5. **Nova última etapa (pedida pelo dono em 2026-11-21; parte 1, digerir cursos, concluída em 2026-11-22 — desenho em `2026-11-22-etapa-5-importar-cursos-design.md`; partes 2, dublagem pessoal com o Voicebox, e 3, assinatura de dublagem, pendentes):** importar um curso baixado (o primeiro caso é um curso do MIT), a gurIA estudar o conteúdo e entregar materiais sobre ele (conceitos, resumos, exercícios no motor da fase 2). Opcional, numa versão paga: gerar legendas e até dublar as aulas. Antes de planejar, passa por uma conversa de desenho própria (formato do curso baixado, licença do material, onde a transcrição roda, custo e qual serviço faz a dublagem).

Cada fase tem seu próprio plano de implementação.

## O que fica para o construtor

- Formato exato da rubrica e do esquema de resposta da IA.
- Biblioteca do canvas de desenho.
- Algoritmo de intervalos da revisão espaçada (reaproveitar o do planejador, se servir).
- Esquema de migração de dados na remoção.
- Detalhes de UI.

## Pontos decididos pelo construtor (marcados como escolha minha)

- Pesos de domínio por tipo de exercício.
- Repositório separado como padrão para skills.
- Trabalhar em branch nova sem commitar nem enviar nada sem pedido.

## Esclarecimentos após revisão

Do código (respondido pelo projeto):
- **Dados atuais:** tabela PostgreSQL `study_workspace` (uma linha por proprietário, JSON em `data`, controle de `revision`). Uso single-user local (`resolveSingleUserOwnerId`), sem multiusuário em produção. A migração preserva esse JSON; exercícios novos entram no mesmo `workspace` (campo versionado) e a fase 4 só troca a infraestrutura em volta (pool/provider), com backup/export JSON antes de cada etapa.
- **Identidade:** é single-user local; a substituição é um identificador fixo de proprietário, não autenticação nova.
- **DSL/documentos:** `@openmaic/dsl` e `@openmaic/storage` deixam de ser usados quando cursos e quizzes migrarem para o `workspace` próprio. Não se copia (vendor) código do OpenMAIC; o que for imprescindível e copiado mantém o aviso MIT.

Escolhas do construtor (marcadas, o dono pode corrigir):
- **Correção por IA:** `escolha` é corrigida localmente. `ligar` é local quando há mapa de referência. `desenho` e `escrita` (inclusive resposta curta) usam IA, apenas ao enviar. Aviso de custo antes de enviar desenho. Cota esgotada ou falha: a resposta é salva como "pendente de correção" e pode ser reenviada depois; nunca troca de provedor.
- **Prova:** cronômetro no cliente com aviso; o servidor registra início e fim e rejeita envio após prazo + tolerância. Correção em lote no fim.
- **README (fase 1):** screenshots só do que existe; é atualizado após as fases 2 e 3 com novas imagens.
- **Texto da skill:** gerado por IA a partir de notas, evidências e respostas do aluno, passando sempre por revisão do dono. A "melhoria" compara o estado de domínio atual com o domínio registrado na versão anterior da skill (diff de conceitos adicionados, removidos e alterados).
- **Sessão:** nova entidade persistida (`modo`, início, fim, estado de correção).

## Definição de domínio (aprovada pelo dono; ajustável após testes)

- **Dominado:** acerto em 2 sessões diferentes, com pelo menos 3 dias entre elas, em `ligar`, `desenho` ou `escrita`, sem ajuda.
- **Ajuda** inclui: dica, explicação aberta antes da resposta e nova tentativa logo após ver o feedback. Acertos no modo Rápido ou apenas em `escolha` têm peso baixo e não bastam sozinhos.
- **Perda de status:** erro em revisão espaçada devolve o conceito a "em estudo" e o retira da próxima versão da skill.
- O dono vai testar e pode pedir ajustes nos limites (2 sessões, 3 dias, pesos).
