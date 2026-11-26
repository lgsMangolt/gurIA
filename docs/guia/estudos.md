# Guia de estudos da gurIA (beta 0.2.0)

O que existe hoje, como a IA e os dados são tratados e quais são os limites.

## O que está implementado

- **Estudos guiados:** escolha um tema, responda perguntas sobre seus objetivos e revise a preparação (conteúdo, exemplo, tarefa e uma pergunta por conceito) antes de salvar. O texto é preparação por IA, sem pesquisa externa.
- **Rede de conhecimento 2D e 3D:** busca, filtro por curso, foco em vizinhos, anotações e evidências. O tamanho representa conteúdo e a cor representa o estado de aprendizagem: cinza (ainda não praticado), azul (em aprendizagem), âmbar (revisão pendente) e verde (domínio em dia).
- **Aulas e materiais:** importe áudio ou vídeo (até 200 MB) ou capture aba/tela em segmentos. A transcrição é local (Whisper) ou vem de uma legenda SRT/VTT. Só a transcrição e quatro imagens amostradas por bloco vão à IA escolhida; o vídeo completo fica no seu computador. Você revisa e aprova os conceitos antes de salvar, e aprovar não concede domínio.
- **Prática e revisão:** o botão **Revisar** (no conceito, no mapa, no estudo e no curso) abre a aba Praticar com os conceitos já marcados: **Revisão espaçada** se algum está vencido, **Rápido** se não. A sessão só começa quando você clica em começar. Há também avaliação de aplicação e aprofundamento editável. As perguntas de escolha são corrigidas localmente.
- **Plano de estudos:** disponibilidade por dia, aulas, exercícios e revisões. O tempo real é registrado separadamente do conteúdo concluído, o ritmo das últimas sessões ajusta as previsões, e revisões vencidas e erros recentes mudam a prioridade. Energia ajusta o dia, mas não aumenta a carga.
- **Link público:** leitura de uma página pública com extração pela IA escolhida. Você confere a fonte; páginas com login ficam para preenchimento manual.
- **Exportação e restauração** de conceitos, cursos, plano e revisões em JSON.

## Importar um curso

Em **Aulas e materiais → Cursos importados**, o botão **Importar curso** recebe um curso que você já tem e o transforma num roteiro de aulas. Importar não usa IA nem cota.

**De onde o curso pode vir:**

- **Pasta ou arquivos soltos:** legendas (SRT/VTT), PDF, DOCX, PPTX, vídeo e áudio. Arquivos com o mesmo nome viram uma aula só, em ordem natural (2 antes de 10).
- **zip:** a gurIA extrai o pacote na pasta de dados dela. O pacote offline do MIT OpenCourseWare é reconhecido: cada vídeo vira uma aula com a legenda e cada PDF de material vira uma aula.
- **YouTube:** link de vídeo ou playlist. A gurIA lê só a lista e as legendas (as manuais primeiro); o vídeo não é baixado. Precisa do yt-dlp (veja [instalacao.md](instalacao.md#importar-do-youtube-yt-dlp)).
- **Udemy:** a gurIA não baixa nada da Udemy nem contorna proteção contra cópia. Importe só os arquivos que você já tem: legendas, PDFs e slides que o instrutor libera.

PDF, DOCX e PPTX são lidos pelo MarkItDown, no seu computador (veja [instalacao.md](instalacao.md#importar-cursos-python-e-markitdown)). PDF escaneado (só imagem) ainda não é lido e aparece como "PDF escaneado".

**Roteiro.** Você pode renomear, mover, juntar e remover aulas. As aulas entram no plano de estudos com a duração do vídeo ou da legenda; sem ela, a duração é estimada pelo tamanho do texto (marcada com ~). Reimportar a mesma fonte mantém suas edições e só acrescenta aulas novas no fim. A licença declarada pelo curso aparece no roteiro e na apostila: ela continua valendo, e a maioria dos cursos só permite uso pessoal.

**Processar sob demanda.** Cada aula é processada com a IA escolhida só quando você clica em **Processar esta aula**, depois de ver quantos pedidos e quantos caracteres vão ser enviados. A IA devolve, em português, o resumo da aula, conceitos e exercícios (escolha, ligar, escrita e, quando faz sentido, desenho), preservando os termos do original (caracteres, código, fórmulas). Vídeo ou áudio local sem legenda é transcrito antes pelo Whisper, no seu computador. **Processar o resto** mostra a estimativa de todas as aulas pendentes e processa uma por vez; se a cota acabar, a fila para e o resto fica para depois.

**Revisão.** Cada aula processada espera a sua revisão: você escolhe os conceitos, ajusta nome e resumo e aprova. Só o aprovado entra na rede e no Praticar, e aprovar não conta como domínio.

**Apostila.** **Abrir apostila** monta um documento do curso com capa, sumário (as aulas ainda não processadas aparecem como pendentes), resumo, conceitos e exercícios de cada aula e o gabarito no fim. **Exportar PDF** usa o "salvar como PDF" do navegador.

## Domínio de um conceito

Um conceito é considerado dominado quando você faz **duas demonstrações sem sua ajuda** (ligar, desenhar ou escrever; cada uma conta se acertar, sem dica nem nova tentativa logo após ver o feedback), com pelo menos **3 dias** de intervalo entre elas. Acertos só em múltipla escolha ajudam, mas não bastam. Um erro numa revisão espaçada devolve o conceito a "em estudo", e então são necessárias duas demonstrações novas. É um indicador de estudo, não uma certificação. Gerar, abrir ou ler conteúdo não concede domínio.

## A aba Praticar

Em **Praticar** você escolhe um dos quatro modos (opcionalmente os conceitos) e começa uma sessão.

Os quizzes antigos (das aulas de revisão da versão anterior) foram migrados: cada pergunta virou um exercício de escolha no conceito correspondente, então aparecem aqui junto com os outros exercícios.

1. A cada exercício, marque primeiro sua **confiança** (chutando, mais ou menos ou tenho certeza). Isso ajuda a calibrar o que você acha que sabe.
2. Responda: `escolha`, `ligar` (clique num item da esquerda e depois no da direita), `escrita` ou `desenho` (caneta, linha, retângulo, elipse e texto, com desfazer e limpar). Se preferir, use **Pular este item**.
3. Nos modos com feedback imediato você vê o resultado, a explicação e, nas respostas corrigidas pela IA, a nota por critério. Na **Prova** só aparece "Resposta registrada", e o resultado vem ao encerrar.
4. Se você recarregar a página, a sessão ativa continua de onde parou. O cronômetro da Prova usa o relógio do servidor, então um relógio errado no seu computador não muda o prazo.

**Antes de gastar sua cota de IA o app pede uma confirmação de custo nos casos mais caros:** o desenho só é enviado depois de "Confirmar e enviar", e **Corrigir agora** (no resumo da Prova) e **Corrigir pendentes** mostram quantos textos e desenhos serão enviados.

Em **Respostas pendentes** (na mesma aba) ficam as respostas que a IA ainda não corrigiu. Você pode reenviar, descartar ou corrigir todas de uma vez; as de uma Prova ainda ativa aguardam o fim dela. O plano de estudos também traz o botão **Praticar (modo sugerido)** nas tarefas de revisão e de prática.

A resposta escrita fora da Prova é enviada à IA assim que você clica em Responder, sem essa confirmação. Encerrar uma Prova antes do fim também pede confirmação.

As respostas e as imagens pendentes ficam guardadas no servidor local (o botão de backup em Configurações as inclui; importar um backup restaura seus conceitos e planos, mas não restaura respostas pendentes nem sessões): a tela só recebe o estado delas. Note que os acertos e erros de uma Prova ativa já ficam gravados no seu histórico de tentativas, mesmo que a tela não os mostre até o fim.

## Modos de estudo

Você começa uma **sessão** escolhendo um modo. O **modo é definido pela sessão**, no servidor: cada resposta herda o modo e a sessão, e o app não aceita outro modo por resposta, porque o modo decide o peso da resposta no domínio. Só uma sessão fica ativa por vez, e uma sessão esquecida aberta expira sozinha depois de 12 horas.

| Modo | Duração | Formatos | Feedback | Domínio |
|---|---|---|---|---|
| **Rápido** | 15 a 20 min, até 10 itens | escolha, ligar | na hora | peso baixo: não conta como demonstração |
| **Aprofundar** | livre, até 6 itens | desenho, ligar, escrita | na hora, com explicação | peso alto |
| **Prova** | com **prazo** | escolha, escrita | só no final | peso alto |
| **Revisão espaçada** | curta, até 8 itens | escolha (ou escrita) | na hora | atualiza o intervalo; um erro devolve o conceito a "em estudo" |

- Na **Prova** você escolhe de 1 a 10 conceitos. O tempo é calculado pelo tipo de exercício, entre 10 e 90 minutos. O cronômetro na tela é só um aviso: quem decide é o servidor, que registra início e fim e **recusa respostas depois do prazo mais 1 minuto de tolerância**. Nenhum resultado aparece antes de você encerrar, e a correção por IA das respostas escritas é feita em lote, só quando você pedir.
- Cada exercício é respondido uma vez por sessão. Para tentar de novo, abra outra sessão.
- A Revisão espaçada só traz conceitos vencidos ou com erro recente. O planejador sugere o modo de cada tarefa: revisão vira Revisão espaçada e prática vira Aprofundar.

## Correção por IA e respostas pendentes

- `escolha` e `ligar` são corrigidas na hora, no seu computador, sem gastar cota.
- `escrita` e `desenho` são corrigidas pela IA que você escolheu (Codex ou Claude), com uma nota por critério da rubrica. A nota final é calculada pelo app a partir dos pesos da rubrica, e a IA só avalia cada critério.
- A IA só é chamada quando você envia (ou reenvia). Se a cota acabar ou a IA falhar, a resposta fica salva como **pendente de correção** e você reenvia depois. Depois de 3 falhas, ou se o login for recusado, ela passa a **falhou**; reenviar volta o contador a zero.
- A Prova guarda as respostas e corrige **em lote** no fim, com no máximo 12 por vez. O lote para na primeira falha de cota, de login, de modelo ou de disponibilidade da IA e deixa o resto pendente. Respostas que você não quer mais corrigir podem ser descartadas.
- O app **nunca troca de provedor** sozinho: cada correção usa exatamente a IA escolhida em Configurações.
- O desenho vai como imagem PNG, JPEG ou WebP de até 1,5 MB, e a imagem é apagada depois da correção. Há no máximo 10 desenhos pendentes ao mesmo tempo.

## IA e custo

Só **Codex/ChatGPT** e **Claude** com assinatura, escolhidos em Configurações. Nunca há troca automática entre serviços.

- **Codex:** o app consulta conta, modelos e limites antes de gerar. Conta com créditos extras, cota desconhecida ou uso a partir de 95% pausa a análise.
- **Claude:** usa o Claude Code já instalado, com login OAuth. Consulta o uso antes de gerar e exige o uso extra desativado. Chaves de API e provedores alternativos ficam fora.
- Cada material fica vinculado ao serviço e ao modelo originais, inclusive na fila e ao retomar.

A análise consome a cota incluída na assinatura. Transcrição e avaliação por IA podem errar.

## Dados e privacidade

- Os dados de estudo ficam no PostgreSQL local. Faça backup do volume do banco e da pasta de mídia: o JSON exportado não contém vídeos.
- Materiais temporários expiram em 24 horas; só os clipes aprovados permanecem.
- O servidor inicia apenas em loopback e recusa origens externas. Não publique esta configuração na rede.
- O app pede conteúdo próprio ou autorizado antes de processar um material. Anotar uma aula não dá licença para gravar, enviar a terceiros ou redistribuir o curso.
- Pedidos de IA são processados pelo serviço escolhido. Isto não é uma declaração de conformidade com a LGPD: publicação, monetização ou uso em outra jurisdição exigem nova análise.

## Melhoria local do ensino

A gurIA compara duas variantes das perguntas iniciais de um estudo, com avaliações opcionais suas. É uma preferência, não prova de aprendizagem. Em Configurações você consulta os totais e apaga os registros.

## Limites conhecidos

- Beta pessoal para Windows, sem instalador independente.
- Colaboração e multiusuário não existem.
- O histórico da conversa com IA é temporário na aba do navegador e o fluxo ainda precisa de validação completa.
- Não há extração automática de plataformas com login. Datas e ritmo são estimativas locais.
