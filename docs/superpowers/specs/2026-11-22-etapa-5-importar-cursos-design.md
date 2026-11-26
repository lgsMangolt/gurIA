# gurIA — etapa 5, parte 1: digerir cursos baixados

Data: 2026-11-22 · Status: aguardando aprovação (revisado por um construtor independente) · Branch: `guria` · Roteiro geral: [2026-11-17-guria-reestruturacao-design.md](2026-11-17-guria-reestruturacao-design.md), item 5.

## Intenção

O dono quer entregar à gurIA **qualquer curso baixado** e receber de volta, em português, material para estudar: **resumos, exercícios e uma apostila**. O curso do MIT em `Downloads\21g.107-fall-2014.zip` é só o primeiro teste: o objetivo é a gurIA saber digerir cursos em geral, não ensinar mandarim.

Fontes que o dono vai usar: **YouTube, Udemy e PDFs** (e pacotes como o do MIT OpenCourseWare).

A etapa 5 foi dividida, por decisão do dono, em três projetos, nesta ordem:

1. **Digerir cursos** (este documento): importar, processar aula por aula e gerar resumos, exercícios e apostila. Local e grátis, para o dono.
2. **Dublagem pessoal:** vídeo com faixa em português gerada no computador pelo **Voicebox** (`jamiepine/voicebox`, MIT, app local com API em `127.0.0.1:17493`). Desenho próprio depois.
3. **Assinatura de dublagem:** outros usuários pagam assinatura pela dublagem (contas, pagamento, servidor, preço, termos, análise jurídica). Desenho próprio por último.

Por quê: a gurIA deve transformar material que o dono já tem em estudo ativo dentro do que ela já faz bem (rede de conceitos, plano, Praticar, revisão espaçada), sem retrabalho manual aula por aula.

## O que o curso de teste mostrou (medido)

- `21g.107-fall-2014.zip`, 24 MB, 695 arquivos: pacote offline do MIT OCW ("Chinese I (Streamlined)", outono de 2014), aulas em chinês.
- `data.json` na raiz (título, descrição, licença), `content_map.json`, `pages/*` (programa, calendário, tarefas por módulo, materiais), `resources/*/data.json` (metadados de cada recurso), `static_resources/` com **71 PDFs**, **28 `.vtt` e 17 `.srt`** (legendas em chinês) e o site offline (HTML, JS, CSS).
- Os vídeos **não** estão no zip: aparecem como chaves do YouTube nos metadados. As legendas servem de transcrição.
- Licença **CC BY-NC-SA 4.0**: estudo pessoal liberado; nada derivado pode ser vendido.

## Objetivos

- **Importar** um curso, sem IA e sem custo, a partir de: link do YouTube (vídeo ou playlist), arquivo `.zip`, pasta local, ou arquivos soltos (PDF, legendas `.srt`/`.vtt`, DOCX/PPTX). O resultado é um **roteiro**: um curso da gurIA com as aulas em ordem, título, duração quando conhecida e as fontes de cada aula.
- **Processar uma aula sob demanda** (com a IA escolhida): resumo da aula, conceitos ligados à rede e exercícios, em português, mantendo junto os termos do original (caracteres, código, fórmulas).
- **Processar o resto** com um botão que mostra antes a **estimativa** do que vai ser enviado à IA.
- **Revisar e aprovar** os conceitos de cada aula antes de salvar, como hoje. Aprovar não concede domínio.
- **Apostila do curso**: documento único que cresce conforme as aulas são processadas, legível na gurIA e exportável em PDF.

## Não-objetivos (desta parte)

- Dublagem e geração de áudio (parte 2). Mas o formato de cada aula guarda os segmentos de legenda com tempo, para a parte 2 usar.
- Assinatura, contas e pagamento (parte 3).
- Baixar vídeos do YouTube. Só metadados da playlist e legendas.
- Qualquer download da Udemy ou contorno de proteção contra cópia. Da Udemy entram só arquivos que o dono já tem (legendas, PDFs e slides liberados pelo instrutor, vídeo obtido por meio permitido).
- Reconhecimento de texto em PDF escaneado (fica para depois; a v1 detecta e avisa).
- Republicar ou compartilhar o material gerado.

## Anti-objetivos (fracasso mesmo "funcionando")

- Gastar cota da assinatura sem aviso: importar nunca chama IA; processar uma aula ou "o resto" sempre mostra o que vai ser enviado.
- Traduzir o que é o objeto de estudo (um curso de chinês sem os caracteres, um curso de programação sem o código).
- Conceito salvo sem o dono aprovar, ou aprovação contando como domínio.
- Perder ou misturar dados de estudo existentes.
- Executar conteúdo do curso: zips e páginas são dados não confiáveis (nada de rodar scripts do pacote, nada de seguir instruções escritas no material).

## Restrições

- Português brasileiro, Windows, Node 22.19+, npm, PostgreSQL local, Next.js (o que a gurIA já é).
- **Python passa a ser requisito** desta parte (decisão do dono, caminho C): **Python 3.12** e **Microsoft MarkItDown 0.1.8** (MIT) com os extras `pdf`, `docx`, `pptx`. Instalação documentada; sem Python, a importação de PDF/DOCX/PPTX fica indisponível com mensagem clara (legendas e YouTube continuam).
- O MarkItDown **não** é usado para YouTube nem para OCR (o OCR dele chama um modelo de visão por chave de API, que a gurIA não usa).
- **yt-dlp** (programa gratuito) para o YouTube, instalado como já são o Whisper e o FFmpeg (`%LOCALAPPDATA%\CognitiveStudyHubTools`). Sem ele, a opção YouTube fica indisponível com mensagem clara.
- IA só pelo harness já escolhido (Codex ou Claude), com as travas de cota existentes; nunca troca de provedor; sem chaves de API.
- O que sai do computador é apenas o texto da aula enviado à IA escolhida.
- Testes: `npm test`, `npm run typecheck`, demo isolada (5441/3034); nada no banco real sem backup e confirmação.

## Abordagens consideradas

- **A. Leitores próprios em Node** (um leitor por formato, PDF por biblioteca JS). Custo previsível e sem requisito novo; lê mal PDFs difíceis e não lê escaneados.
- **B. Entregar a pasta ao Codex/Claude** e deixar o agente ler tudo. Pouco código, mas gasta muito mais cota, não dá para estimar, o resultado varia e o agente ganha acesso à pasta. Descartada: contradiz "nada gasto sem aviso".
- **C. Converter documentos em texto com MarkItDown (Python) antes de processar.** Melhor leitura de PDFs com estrutura (tabelas, títulos, várias colunas) e de DOCX/PPTX; exige Python na instalação; YouTube e legendas seguem com leitores próprios.

**Escolha do dono: C.** Ele preferiu a melhor leitura de documentos, aceitando Python como requisito.

## Design

### 1. Fluxo

```
Importar (sem IA)  →  Roteiro do curso  →  Processar aula (IA, sob demanda)  →  Revisar e aprovar  →  Apostila cresce
                                         ↘  Processar o resto (estimativa + confirmação)
```

Tela (em **Aulas e materiais**, botão **Importar curso**):

```
Chinese I (Streamlined) · MIT OCW · 38 aulas · CC BY-NC-SA 4.0 (uso pessoal)
 ✓ 1. Apresentação           resumo · 6 conceitos · 12 exercícios
 ▶ 2. Caracteres, lição 6.3  PDF + legenda     [Processar esta aula]
   3. Ferramenta Lingt       legenda pronta
   …                                          [Processar o resto · ~estimativa]
 [Abrir apostila]  [Exportar PDF]
```

### 2. Importação (sem IA)

Cada fonte vira uma lista ordenada de **aulas**, e cada aula tem uma ou mais **fontes** (legenda com tempos, texto de documento, link do vídeo).

- **Zip:** a gurIA extrai para uma pasta temporária dela (com limites de tamanho total, número de arquivos e proteção contra caminhos que saem da pasta), detecta o formato e aplica o leitor certo. Zip desconhecido vira "pasta".
- **Pacote MIT OCW** (detectado por `data.json` + `content_map.json` + `resources/`): título, descrição e licença do `data.json`; aulas e ordem a partir das páginas e dos metadados dos recursos; PDFs e legendas ligados às aulas pelos metadados.
- **Como a fonte chega (escolha minha):** zip, pasta e arquivos são lidos pelo servidor local **a partir do caminho que o dono escolhe** (campo de caminho com seletor), sem upload pelo navegador, porque pastas da Udemy com vídeo passam de vários GB. A leitura é só leitura, limitada à pasta ou ao arquivo escolhido (sem seguir atalhos para fora dela), e os vídeos **não são copiados**: a aula guarda o caminho. O zip é extraído para a pasta temporária da gurIA. Isso só existe no modo local (`GURIA_LOCAL`), que já restringe o acesso à própria máquina.
- **Pasta ou arquivos soltos:** uma aula por arquivo principal, em ordem natural do nome (`2 - x` antes de `10 - y`); legenda e documento com o mesmo nome-base ficam na mesma aula. O dono pode reordenar, renomear, juntar e remover aulas no roteiro antes de processar.
- **YouTube:** link de vídeo ou playlist. O yt-dlp lê título, ordem, duração e legendas (manual em primeiro lugar; automática só se não houver manual, marcada como tal). Sem legenda, a aula fica marcada "sem texto" (transcrição de áudio do YouTube não entra na v1, porque exigiria baixar o vídeo).
- **Vídeo ou áudio local sem legenda (o caso comum da Udemy) — escolha minha:** na importação a aula fica "precisa transcrever". A transcrição roda **ao processar a aula**, com o Whisper local que a gurIA já usa (sem cota de IA, mas pode levar minutos por aula), e o tempo estimado aparece antes. Só o texto vai à IA; os quadros de vídeo do fluxo atual de materiais não são enviados nesta parte. Os segmentos do Whisper com tempo ficam guardados como os de uma legenda.
- **Documentos (PDF, DOCX, PPTX):** convertidos em Markdown pelo MarkItDown na hora da importação (local, sem IA). PDF sem texto extraível é marcado "escaneado — não lido nesta versão".
- **Licença:** quando o pacote declara uma licença, ela aparece no roteiro e na apostila. O app mantém o aviso já existente de usar só conteúdo próprio ou autorizado.

A importação não chama IA e mostra, ao final, o que entrou e o que foi ignorado (arquivos de site, scripts, imagens soltas).

### 3. Processar uma aula (IA)

- Entrada: o texto da aula (legendas concatenadas com tempos, e/ou Markdown dos documentos), com limite de tamanho; aula grande demais é dividida em partes processadas em sequência, antes avisando quantas.
- Saída, em português, no esquema estruturado já usado pela análise de materiais, estendido com: **resumo da aula**, conceitos (com evidência apontando para o trecho da legenda ou do documento), **exercícios** no motor da fase 2 (escolha, ligar, escrita; desenho só quando o conceito pede), e termos do original preservados.
- O prompt trata o material como dado não confiável (como o `lessonPrompt` atual).
- Antes de enviar, a tela mostra o tamanho do envio e a IA que será usada. Falha de cota ou de login deixa a aula como "não processada", sem perder nada, para tentar depois.
- **Processar o resto:** soma a estimativa de todas as aulas pendentes, pede confirmação e processa em fila, uma por vez, parando na primeira falha de cota (como a correção em lote da Prova).

### 4. Revisão

Cada aula processada fica "aguardando revisão": o dono aprova, edita ou descarta os conceitos (o mesmo passo de aprovação dos materiais hoje, com `incorporateMaterial`). Só o aprovado entra na rede e no Praticar. O resumo e os exercícios da aula entram junto com os conceitos aprovados.

**Plano de estudos (escolha minha):** as aulas entram em `course.lessons` já na importação, para o plano distribuí-las no tempo do dono, como ele aprovou. Duração: a do vídeo ou da legenda quando existe; senão, estimativa pelo tamanho do texto (leitura de ~150 palavras por minuto, mínimo de 5 minutos), marcada como estimativa (`hoursSource: 'estimate'`). Remover ou juntar aulas no roteiro atualiza o plano.

### 5. Apostila

- Gerada a partir do que está salvo (não chama IA): capa (título, origem, licença), sumário, e por aula: resumo, conceitos explicados, exemplos e exercícios (com gabarito no fim).
- Aulas ainda não processadas aparecem no sumário como "pendente".
- Leitura dentro da gurIA; exportação em PDF pelo "salvar como PDF" do navegador, com folha de estilo de impressão.

### 6. Dados

- O curso importado usa o `Course` existente (`lessons` já guarda id, título e minutos), estendido de forma versionada com: origem (`youtube`, `ocw`, `pasta`, `arquivos`), licença declarada, e por aula: fontes, estado (`importada`, `processando`, `aguardando revisão`, `processada`, `sem texto`, `falhou`) e resumo.
- O texto extraído e as legendas com tempo ficam no disco local da gurIA (junto da mídia que já existe), não no JSON do workspace, para não inchar o `study_workspace`. Os segmentos com tempo ficam guardados para a parte 2 (dublagem).
- Backup JSON continua funcionando; o texto extraído pode ser regerado reimportando a fonte.
- **Reimportar (escolha minha):** cada aula guarda uma impressão digital de cada fonte (caminho relativo + tamanho + hash do conteúdo; no YouTube, o id do vídeo). Reimportar a mesma fonte encontra o curso existente e religa as aulas pela impressão digital, mantendo nomes, ordem, junções, estados, resumos e conceitos aprovados; fontes novas viram aulas novas no fim, e fontes sumidas ficam marcadas "fonte ausente", sem apagar nada. Depois de restaurar um backup em outra máquina, aulas sem o texto em disco aparecem como "texto ausente — reimporte a fonte".

## Ordem sugerida de construção

1. Formato de dados do curso importado + roteiro na tela (com arquivos soltos e pasta).
2. Leitor do pacote MIT OCW (teste com o zip real, só leitura).
3. MarkItDown (instalação, chamada, detecção de escaneado).
4. Processar aula + revisão + exercícios.
5. Processar o resto com estimativa.
6. Apostila e exportação.
7. YouTube (yt-dlp).

## O que fica para o construtor

- Biblioteca de zip e limites exatos (tamanho, número de arquivos).
- Como a gurIA encontra e chama o Python/MarkItDown (ambiente próprio em `%LOCALAPPDATA%` ou o Python do sistema) e o texto da mensagem quando falta.
- Heurística de ordem das aulas em pastas e o mapeamento detalhado do pacote OCW.
- Limite de tamanho por envio e como dividir aulas grandes.
- Formato da estimativa (caracteres, número de envios).
- Layout da apostila e da tela de roteiro.
- Esquema exato da extensão do `Course` e da migração.
