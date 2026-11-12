# gurIA — beta 0.2.0

Edição pessoal para Windows, construída sobre o OpenMAIC 1.3.0 (commit
`595a76794e5edd1c789608e067cc05f1fc6a0e39`). O repositório original e o
Cognitive Study Hub instalado são separados e permanecem preservados.

## Abrir

Use o atalho **OpenMAIC Estudos** ou `../Abrir OpenMAIC Estudos.cmd`.
Endereço: <http://127.0.0.1:3033/study>. O Docker Desktop precisa estar disponível.
A primeira compilação de uma página pode levar alguns minutos; esta entrega
é um beta local do Next.js, não um instalador nativo independente.

Banco isolado: projeto Docker `openmaic-study-db`, PostgreSQL em
`127.0.0.1:5440`, volume `openmaic-study-db_openmaic-postgres`.
Materiais/configuração: `%LOCALAPPDATA%\OpenMAIC-Estudos\<proprietário-hash>`.
Os executáveis de Whisper/FFmpeg e o modelo já instalados são reutilizados de
`%LOCALAPPDATA%\CognitiveStudyHubTools`; isso não torna o Cognitive a base do app.
As dependências Node são uma junction para `../OpenMAIC/node_modules`.
Não remova o original enquanto esta instalação estiver usando essa junction.

## O que foi implementado

- Rede de conceitos 2D e projeção 3D com rotação, busca, filtro por curso,
  foco em vizinhos, anotações e evidências. Tamanho representa conteúdo;
  preenchimento representa aprendizagem demonstrada.
- Cursos criados como documentos reais do OpenMAIC, usando sua identidade,
  PostgreSQL, transação e DSL. O mapa usa revisão numérica para impedir que
  uma aba sobrescreva silenciosamente outra.
- Importação de áudio/vídeo até 200 MB e captura segmentada de aba/tela.
  Cada segmento tem contêiner próprio. A captura continua ao trocar de seção.
  A fila fica no disco; falhas são retomáveis. Envios que falharam antes de
  chegar ao servidor ficam na aba com opção de reenviar e aviso ao fechar.
- Whisper local ou legenda SRT/VTT. Envio somente de transcrição e quatro
  imagens amostradas por bloco ao harness escolhido (Codex ou Claude); o vídeo completo não é enviado.
- Revisão em lote, escolha de conceitos, ajuste de clipes e associação a
  conceitos existentes. Aprovação não concede domínio.
- Rodadas de até três perguntas, explicação após resposta, lembrete a cada
  15 minutos, avaliação de aplicação e aprofundamento editável antes de salvar.
- Revisões geradas como cenas de quiz no player do OpenMAIC. Questões de escolha
  são corrigidas localmente, com sincronização das respostas para o mapa.
- Planejamento com disponibilidade por dia, aulas/exercícios/revisões,
  sessões por aula (ou total conhecido), prática e revisão. Registro de tempo
  real e conteúdo concluído separado, incluindo blocos parciais e desfazer.
  O ritmo das últimas 20 sessões de cada atividade ajusta as previsões.
  Revisões vencidas e erros recentes mudam a prioridade, com um único bloco
  para conceitos compartilhados. Energia altera os blocos de hoje e inclui
  pausas no limite diário; não aumenta a carga. Adiar hoje redistribui o restante.
  O plano continua após prazos inviáveis e mostra uma previsão revisada.
- Leitura de link público com o leitor protegido do OpenMAIC e extração pelo
  harness selecionado. O aluno confere a fonte e os dados; horas ausentes ficam desconhecidas.
  Não é uma busca ampla na internet. Páginas com login ou bloqueios têm
  preenchimento manual, sem tentativa de contorno.
- Exportação/restauração de conceitos, cursos, plano e revisões em JSON.

## Conta e custo

Somente as assinaturas confirmadas pelo usuário: **Codex/ChatGPT e Claude Pro**.
Seleção em **IA e transcrição**, com modelo por harness. Análise de materiais,
avaliação, aprofundamento e leitura de link usam essa escolha. Cada material
fica vinculado ao harness/modelo original, inclusive na fila e ao retomar.
Mudar a escolha limpa a autorização do próximo envio. Pedidos feitos por uma
aba com escolha antiga são recusados antes de enviar o conteúdo. Nunca há
fallback automático entre serviços.

- Codex: app-server com login ChatGPT; consulta conta, modelos e limites antes
  de gerar. Conta com créditos extras, cota desconhecida ou uso a partir de
  95% pausa a análise.
- Claude: CLI já instalado, login OAuth Claude Pro, consulta de uso antes de
  gerar e exigência de uso extra desativado. API keys, provedores alternativos,
  ferramentas, hooks, MCPs e instruções de projetos ficam fora da execução.
  Sessões sem persistência; imagens e saída estruturada foram verificadas.
  Sonnet/Opus/Haiku são aliases do CLI, sujeitos à disponibilidade da conta;
  rejeição de modelo não muda para outro. Uma mudança no formato da consulta
  de cota pode bloquear a integração até atualização.
- Copilot e Gemini não estão habilitados, pois o usuário confirmou que não
  possui essas assinaturas. Não houve instalação, login, compra nem geração
  por esses serviços.

O planejamento, a correção das perguntas de escolha e a transcrição rodam
localmente. Geração consome a cota das assinaturas existentes. O app não compra
créditos, não habilita uso extra e não altera o plano da conta. Se a cota/login
não puderem ser confirmados, a geração fica bloqueada; estudos manuais continuam.

As rotas upstream que geram conteúdo por APIs de provedores ficam bloqueadas
neste modo. Os workers upstream de geração/extracão não são iniciados.
A biblioteca/player original continua presente, mas funções que dependem
dessas APIs não ficam disponíveis. O servidor inicia somente em loopback e
recusa origens externas. Esta configuração não deve ser publicada na rede.

## Dados, revisão e limites

Materiais temporários expiram em 24 horas; a limpeza roda com o servidor
aberto e na próxima abertura caso ele estivesse fechado. Somente clipes
aprovados permanecem. Faça backup do volume PostgreSQL e da pasta de mídia:
o JSON exportado sozinho não contém arquivos de vídeo nem as aulas do player.

Transcrição e avaliação por IA podem errar. As imagens são amostradas, portanto
detalhes visuais rápidos podem passar despercebidos. Captura depende do áudio
compartilhado pelo navegador; sem áudio, apenas imagens são analisadas.
Domínio exige acertos em três dias distintos, aplicação e pelo menos 80% de
acertos; é um indicador formativo, não certificação.

A lista de aulas pode ser preenchida manualmente como `título | minutos`,
com soma conferível. Sem a lista, o plano usa o total declarado; sem carga,
não inventa horas. Não há extração automática de uma plataforma com login.
As datas e o ritmo são estimativas locais, não garantias de conclusão. A previsão inclui o trabalho conhecido e a próxima revisão de cada conceito; novas respostas recalculam as revisões, sem presumir acertos futuros.
Colaboração/multiusuário e provedores sem assinatura confirmada permanecem
fora deste beta. Não houve validação com uma aula real do usuário.

## Referência jurídica seletiva — Brasil

Revisão em 02/11/2026 para uso pessoal no Brasil. A exceção de tratamento por
pessoa natural para fins exclusivamente particulares e não econômicos
(LGPD, art. 4º, I) não autoriza concluir que todo fornecedor envolvido está
dispensado da lei. Minimização do art. 6º orientou envio de transcrição/imagens
e retenção limitada. Para a escolha do destino de processamento, o art. 8º orientou autorização específica por harness e ausência de troca automática. [Texto oficial atualizado da LGPD](https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-normaatualizada-pl.html).

A autorização para reprodução do art. 29 e os limites do art. 46 da Lei de
Direitos Autorais devem ser considerados. Anotar uma aula não concede licença
geral para gravar, enviar a terceiros ou redistribuir o curso completo.
O app pede conteúdo próprio/autorizado e confirmação antes do processamento.
[Texto oficial atualizado da LDA](https://www2.camara.leg.br/legin/fed/lei/1998/lei-9610-19-fevereiro-1998-365399-normaatualizada-pl.html).
Não é uma declaração de conformidade jurídica garantida; publicação,
monetização ou uso em outra jurisdição exigem nova análise.

## Verificação e manutenção

`node node_modules/vitest/vitest.mjs run --config vitest.study.config.ts`
executa os testes do domínio e da barreira de assinatura.
`node node_modules/typescript/bin/tsc -p tsconfig.study.json --noEmit`
verifica as alterações de estudo e suas dependências.
Os scripts `study-e2e.mjs` e `study-capture-smoke.mjs` validam o fluxo e a captura;
o primeiro usa a cota do Codex e um áudio sintético, e restaura o mapa ao terminar.
Resultados locais e imagens ficam em `logs/study`.

Validação inicial do beta: 11 testes automatizados aprovados; verificação de
tipos sem erros; áudio sintético transcrito pelo Whisper e analisado pelo
Codex real; aprovação, reprodução de clipes e resposta no mapa verificadas.
O player nativo foi validado separadamente com as perguntas desse mesmo
resultado, incluindo sincronização da resposta. Captura simulada gerou dois
segmentos decodificáveis com áudio e continuou ao trocar de seção. Abertura
pelo atalho, conexão ChatGPT e disponibilidade do Whisper foram verificadas
após reiniciar o servidor. Não se usou uma aula real do usuário.

As correções upstream desta cópia são limitadas à compilação Webpack,
inicialização no modo pessoal, acesso local e integração de quiz. Não se
declara resolvido o conjunto de problemas upstream em fluxos multiusuário,
transferência de proprietário, SSE ou edição concorrente de cenas.

## Atualização de harness e planejamento adaptativo — 02/11/2026

A validação desta atualização está registrada nos testes `tests/study` e no
script `scripts/study-adaptive-smoke.mjs` (fixtures interceptadas no navegador,
sem mudar o banco do usuário). O script `study-harness-probe.ts` apenas consulta
conexão/cota por padrão; `--generate` executa explicitamente uma geração pela
assinatura com a imagem sintética de teste, consumindo cota incluída.

Referências técnicas consultadas:
- [Claude Code CLI](https://code.claude.com/docs/en/cli-reference)
- [Claude Code configurações](https://code.claude.com/docs/en/settings)
- [Claude Code custos e limites](https://code.claude.com/docs/en/costs)

Resultado final da atualização: **39 testes automatizados aprovados**, TypeScript
sem erros, 10 verificações de navegador sem erros JavaScript, captura simulada
com dois segmentos independentes e continuidade ao trocar de seção. Claude Pro
reconheceu uma imagem sintética e retornou o JSON solicitado em uma geração real
pela cota incluída. Após reiniciar pelo launcher, Codex/ChatGPT, Claude Pro e
Whisper local foram confirmados disponíveis. A seleção anterior do Codex foi
preservada. O OpenMAIC original segue sem alterações.

## Primer e identidade visual — 02/11/2026

Tokens oficiais de `@primer/primitives` 11.10.0 e ícones GitHub Octicons
servidos localmente, com as licenças MIT em `app/study/primer` e
`public/study/icons`. Componentes existentes adaptados ao Primer (não uma
migração para o pacote React). As variáveis são limitadas a `.study-shell`;
a biblioteca original do OpenMAIC não recebe esse tema.

Identidade: clara, organizada, acolhedora; evitar ornamentação. Superfícies
neutras, azul para links/foco e verde para a ação principal. Tipografia de
sistema e escala de espaço de 4px. Movimento reduzido respeitado.
Fonte de verdade: tokens oficiais em `app/study/primer/tokens.css` e aliases
semânticos em `app/study/study.css`.

[Guia visual local](http://127.0.0.1:3033/study/brand-kit.html) contém paleta,
contraste calculado, tipografia, botões/estados, cartão e modelos SVG de post
1080×1080 e thumbnail 1280×720. O JSON para reutilização em site/vídeo é uma
fotografia dos tokens desta versão: `public/study/design-tokens.json`.
Ao mudar a identidade, atualize também os exports e exemplos.
Nenhuma CDN, fonte remota, API paga ou geração de IA é usada pelo tema.

Referências: [Primer Product UI](https://primer.style/product/),
[Button](https://primer.style/product/components/button/),
[NavList](https://primer.style/product/components/nav-list/).

## gurIA — rebranding e quatro layouts, 02/11/2026

Identidade: gurIA, “Aprenda conectando ideias.” Símbolo vetorial próprio de quatro
pontos conectados; clara, curiosa e acolhedora. Nome como proposta criativa local;
não foi feita análise de disponibilidade de marca no INPI.

Galeria: `/study/layouts.html`. Órbita (sidebar espaçosa, mapa), Atlas (navegação
superior, área compacta), Caderno (coluna editorial e papel quente), Foco (trilho
compacto e tema escuro). Todos usam os mesmos componentes funcionais e dados;
seletor no cabeçalho, preferência em localStorage, com URL `?layout=...`.
Nenhum material ou preferência de conta é enviado ao trocar o layout.

Tokens semânticos em `app/study/nexo-layouts.css`, export de referência
`public/study/design-tokens.json`, símbolo `public/study/nexo-mark.svg`.
Guia, post 1080×1080 e thumbnail 1280×720 em `public/study` atualizados.
Prévia da galeria usa dados fictícios interceptados pelo script de teste;
abrir o app carrega o workspace real. Backend, volume e compatibilidade
com os atalhos OpenMAIC Estudos existentes são preservados.

A consulta seletiva brasileira de interface/acessibilidade retornou seleção
insuficiente no limite usado; não se declarou obrigação legal nem conformidade
nesta mudança visual. Foco visível, labels e movimento reduzido mantidos como
critérios técnicos. Uma eventual publicação exige revisão das fontes oficiais.

Validação do rebranding: quatro layouts em 1440px e 390px, paletas conferidas, preferência preservada após recarregar; galeria sem overflow e com imagens carregadas nos dois tamanhos; 10 fluxos de estudo aprovados e TypeScript sem erros. As prévias são fixtures de demonstração, sem gravação no banco real ou geração por IA.

## Nome definido pelo usuário — 03/11/2026

gur é o nome; a marca é escrita **gurIA**, com IA em destaque e uma brincadeira com “guria”, expressão usada no Sul. Interface, título, galeria, guia e peças atualizados. Identificadores técnicos e a chave local de preferência de layout foram preservados para compatibilidade.

Logo definido em 03/11/2026: modelo 04 — Só a palavra. Assinatura gurIA com IA azul e sublinhado sob gur. SVG claro/escuro e ícone g em public/study/gurIA-*.svg; app, favicon, galeria, guia e peças atualizados.

## Paleta definida pelo usuário — 03/11/2026

Preto e cinza em todos os layouts, logo e exports. A interface escura mantém superfícies em cinza profundo e texto claro. Sem filtros sobre vídeos ou materiais: somente tokens de interface e peças vetoriais da marca foram alterados. Estados conservam texto, preenchimento, borda e foco.

## Estudos como entrada principal — 03/11/2026

A aba inicial é Estudos: tema → perguntas de preferência geradas pela IA
configurada → preparação estruturada → revisão e salvamento. Codex/Claude
continuam com as mesmas barreiras de assinatura/cota e sem fallback pago.
O tema e as respostas são enviados somente após clicar nos botões correspondentes.
A escolha de IA permanece em Configurações; o layout fica no menu Opções.
A entrada vazia mostra apenas a pergunta, campo e ação; a lista só aparece com estudos salvos.

Aprendizados criados por esse fluxo recebem learningType=free. Há filtro
Aprendizados livres em Estudos e no mapa. A preparação inclui conteúdo,
exemplo, tarefa e uma pergunta por conceito; conexões estruturadas alimentam
o diagrama. O aluno pode abrir cada conceito para aprofundar/explorar, testar
conhecimento na interface e praticar quizzes no player OpenMAIC. A carga estimada
é dividida em conteúdo, prática e revisão para o planejador local.
O texto é preparação por IA, sem alegar pesquisa externa ou evidência de aula.

O novo caminho não integra o agente conversacional completo nem geração de
slides narrados do upstream; são perguntas e preparação por JSON nos harnesses
assinados, com leitura na aba e quizzes no player. Não se declara equivalência
com a jornada integral do OpenMAIC.

Validação: 42 testes automatizados; TypeScript sem erros. Script
study-start-smoke.mjs percorreu a jornada com respostas de IA simuladas,
salvamento real transacional no PostgreSQL, mapa com conexões, aprofundamento
acessível, planejamento e quiz de escolha. O fixture foi removido ao terminar,
sem apagar dados de outros estudos. As chamadas de nuvem desse teste foram
interceptadas, sem consumo de cota. O teste não comprova geração real desta
nova jornada com um tema do usuário.

## Abertura desktop — 03/11/2026

Atalho gurIA na Área de Trabalho e Menu Iniciar aponta para desktop/gurIA.exe,
iniciador GUI local compilado com .NET Framework do Windows. Ele executa
scripts/guria-desktop.mjs com o Node já instalado, inicia Docker Desktop,
aguarda PostgreSQL 5440 e o servidor loopback 3033, e abre Edge em modo app,
sem barra de endereço, com perfil exclusivo em %LOCALAPPDATA%/gurIA/Desktop.
O perfil guarda preferências da janela; cursos e conceitos continuam no banco
local existente. Não há instalação de pacotes pagos nem alteração de políticas
de execução do Windows.

Logs: %LOCALAPPDATA%/gurIA/Desktop. O atalho usa public/study/gurIA.ico,
gerado a partir do ícone vetorial escolhido. As dependências locais e esta
pasta são necessárias: não é um pacote autônomo para distribuir a outro PC.
O launcher não inicia junto com o Windows; os serviços são iniciados ao abrir
pelo atalho. Fechar a janela mantém o servidor e banco disponíveis para reabrir.

## Teste real da jornada CS50 — 03/11/2026

Perguntas, preparação, planejamento, diagrama, quiz e aprofundamento validados
pela interface real, com Codex/ChatGPT e modelo configurado. Foram três gerações
reais (sem mocks de IA): perguntas, preparação e aprofundamento. Estudo
“Lógica do CS50: das frases às condições” preservado como aprendizado livre,
com 4 conceitos iniciais, 5 caminhos de aprofundamento e 9 conexões ao final.
O quiz foi testado com erro e acerto e as tentativas automáticas foram removidas
do progresso. Autenticação/cota/créditos passaram pelos guardas existentes.
Relatório e capturas: logs/study/cs50-real/RELATORIO.md.
Não foi testada a geração upstream de slides narrados; este teste cobre o fluxo
implementado na gurIA e suas perguntas locais, não certifica domínio do aluno.

## Cores de referência na rede — 03/11/2026

Exceção solicitada à paleta monocromática: somente estados da rede recebem
cores semânticas. Cinza = sem tentativas; azul = aprendizagem com revisão
futura; âmbar = revisão vencida; verde = domínio demonstrado com revisão em dia.
Revisão pendente tem precedência visual mesmo se o conceito já demonstrou
domínio. Gerar, abrir ou ler conteúdo não concede domínio nem muda o estado.
Legenda, rótulo e descrição acessível acompanham a cor. Paletas próprias para superfícies claras e escuras,
com atualização de vencimento a cada minuto. Nenhum progresso real foi alterado
nos testes: 3 testes de classificação e renderização 2D/3D em Caderno/Foco.

### Modelo escolhido: esferas foscas 3D

A rede agora abre em 3D com cada esfera inteira na cor do estado, iluminação
e material fosco. Arrastar gira, a roda aproxima, clicar abre o conceito;
botões de rotação e rótulos acessíveis permitem uso pelo teclado. A alternativa
2D também preenche o nó inteiro e pode ser escolhida quando WebGL falha.
Three.js local (MIT), sem novo pacote, serviço pago ou chamada de IA.
Verificação com progresso simulado: Caderno/Foco em desktop e Caderno a 390px,
renderização WebGL, rotação, abertura de conceito e alternância 2D/3D sem erros
de página. Capturas: logs/study/matte-network-*.png. Dados reais preservados.

### Verificação do ciclo de aprendizagem — 03/11/2026

Regras: 45 testes existentes passaram; mais 3 testes novos em
tests/study/learning-lifecycle.test.ts confirmam o ciclo novo/aprendizagem/
revisão/domínio, intervalos de 1/3/7/14/30 dias, repetição no mesmo dia sem
domínio e limite de precisão de 80%. Um erro agenda amanhã e, com 3 acertos
em 4 tentativas (75%), retira a classificação de domínio.

Interface: scripts/study-learning-lifecycle-smoke.mjs passou em cinco cenários:
abrir não muda progresso; acerto salva aprendizagem e agenda amanhã; domínio
vencido fica em revisão e acerto restaura verde; erro retira verde; aplicação
aprovada no terceiro dia concede domínio; vencimento muda o rótulo do mapa
automaticamente no próximo ciclo de atualização de 1 minuto. O primeiro cenário
também recarrega a página para confirmar a leitura do estado salvo simulado.
Nenhum erro de página. Armazenamento e avaliação da IA interceptados no teste:
não retesta persistência real do banco nem qualidade da avaliação do Codex.
Nenhum progresso real alterado, nenhuma chamada paga ou consumo de cota da IA.

### Verificação real com Codex e PostgreSQL — 03/11/2026

Após os testes simulados, o ciclo passou com avaliação real do Codex
GPT-6.1-Sol (nota 0,9), requisições reais do app e conferência direta no banco:
aplicação, recarregamento, erro, vencimento e recuperação do domínio.
Tentativas de dias anteriores e relógio controlados somente no conceito de
teste. Conceito removido; hash dos dados completos anteriores preservado.
GPT-6-Astra apresentou timeout de cinco minutos na primeira tentativa;
o teste bem-sucedido usou temporariamente Sol e restaurou Astra ao terminar.
Sem cobrança adicional, com consumo da cota normal incluída no Codex.
Detalhes e limites: logs/study/lifecycle-real/RELATORIO.md.

### Fluxo completo com Luna — 03/11/2026

Passou com GPT-6-Luna da assinatura Codex e PostgreSQL reais, sem mocks:
3 perguntas iniciais, 3 partes de estudo, leitura/filtro livre, planejamento,
diagrama, quiz com erro e acerto, aprofundamento incorporado (8 conceitos,
7 conexões), avaliação de aplicação (0,9), domínio, vencimento e recuperação.
Histórico de dias e relógio controlados somente no conceito de teste.
Todos os dados temporários removidos; SHA-256 do workspace anterior igual
ao final. A exclusão HTTP geral é bloqueada neste modo; o documento de teste
foi removido por transação PostgreSQL restrita, com identidade conferida.
Luna permanece selecionado. Apenas cota incluída utilizada.
Relatório: logs/study/luna-full/RELATORIO.md.

## Melhoria local do ensino — Harness2

O gurIA compara duas variantes das perguntas iniciais e do retorno no quiz.
A alternativa de perguntas solicita aplicações e dificuldades distintas;
a de retorno oferece, após a resposta, a opção de rever o resumo do conceito.
Não altera gabaritos, cálculos de domínio ou a seleção da IA, e não dispara
chamadas adicionais. As avaliações são opcionais e só são registradas quando
selecionadas pelo usuário: identificação aleatória, variante, categoria e
sinal positivo/negativo, até 200 eventos no workspace do proprietário. O
mesmo voto não é contado duas vezes enquanto estiver na janela. Em
Configurações é possível consultar os totais e apagar os registros.

As versões são alternadas conforme avaliações recebidas. A alternativa é
selecionada quando possui pelo menos 10 avaliações em cada versão e uma
proporção positiva 20 pontos percentuais maior; avaliações posteriores podem
reverter essa escolha. É uma heurística de preferência, não prova estatística,
correção da resposta ou ganho de aprendizagem. As tarefas, assuntos e modelos
podem ser diferentes entre avaliações. O histórico é limitado e não inclui o
texto das perguntas nem respostas. Resetar reinicia a comparação; dados de
progresso e estudos são mantidos. Dados anteriores são carregados com histórico
vazio. Alterar ou exportar o workspace inclui estes sinais, mas não cria nova
transmissão automática a prestadores de IA.

O Brasil é o contexto do beta pessoal descrito acima. A consulta seletiva à
[LGPD, arts. 4º e 6º](https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-normaatualizada-pl.html)
foi conferida em 08/11/2026; a exceção de uso particular não pode ser estendida
a fornecedores sem análise. A implementação limita dados novos por decisão de
projeto e não declara conformidade garantida. Distribuição ou mudança de
jurisdição requer revisão.
