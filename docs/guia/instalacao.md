# Instalação

A gurIA é um beta pessoal para **Windows**. Ela roda localmente (Next.js + PostgreSQL em Docker) e usa **Codex** ou **Claude** com a sua própria assinatura para os recursos de IA. Ainda não existe instalador: você roda a partir do código.

## Requisitos

- Windows 10 ou 11.
- [Node.js](https://nodejs.org) **22.19 ou superior** (o npm já vem junto).
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) aberto, para o PostgreSQL.
- Para recursos de IA: Codex (login ChatGPT) **ou** Claude Code (login Claude) já instalado e autenticado. Sem isso, planejamento, rede de conceitos e estudo manual continuam funcionando.
- Para transcrição local (opcional): Whisper e FFmpeg instalados e configurados por você.
- Para importar cursos com PDF, DOCX ou PPTX: Python 3.12 e o conversor MarkItDown (veja [Importar cursos](#importar-cursos-python-e-markitdown)).

## Passo a passo

Use aspas nos caminhos que tiverem espaço ou acento.

```powershell
git clone https://github.com/lgsMangolt/gurIA.git
cd "gurIA"
npm ci
Copy-Item .env.example .env.local
```

O `npm ci` instala exatamente as versões do `package-lock.json` e leva cerca de um minuto. Um aviso sobre *install scripts* do `esbuild` é esperado e não precisa de ação.

O `.env.local` copiado já vem pronto para a instalação pessoal, com estas três linhas ativas:

```ini
DATABASE_URL=postgres://openmaic:openmaic-dev@127.0.0.1:5440/openmaic
OWNER_SINGLE_USER=true
GURIA_LOCAL=true
```

- `DATABASE_URL` aponta para o PostgreSQL que o próximo comando sobe, na porta 5440. Os nomes `openmaic` do banco e do usuário vêm da versão anterior e continuam valendo.
- `OWNER_SINGLE_USER=true` faz a instalação ter um único proprietário local, sem login.
- `GURIA_LOCAL=true` ativa o modo pessoal de estudo: o servidor só atende a própria máquina. O nome antigo, `OPENMAIC_STUDY_LOCAL`, continua aceito; se as duas existirem, vale `GURIA_LOCAL`.

Suba o banco e o app:

```powershell
npm run db:up
npm run dev
```

Abra <http://127.0.0.1:3033/study>. A primeira compilação de cada página pode levar alguns minutos. A porta 3000, que é o padrão do Next, costuma estar ocupada por outros programas; por isso a gurIA usa a 3033 e liga só em `127.0.0.1`.

Para parar o banco depois: `npm run db:down` (os dados ficam no volume do Docker).

> **Não compartilhe `.env.local`.** Ele pode conter credenciais.

## Importar cursos: Python e MarkItDown

A gurIA lê PDFs, documentos do Word (DOCX) e apresentações (PPTX) dos cursos importados com o **MarkItDown 0.1.8**, da Microsoft (licença MIT), que roda em Python no seu computador, sem IA e sem internet. Legendas (SRT/VTT) não precisam dele.

1. Instale o [Python 3.12](https://www.python.org/downloads/) (marque "Add python.exe to PATH" e o lançador `py`).
2. Na pasta da gurIA, rode:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-markitdown.ps1
```

O script cria um ambiente Python só para a gurIA em `%LOCALAPPDATA%\CognitiveStudyHubTools\markitdown` e instala o conversor. Pode rodar de novo para reparar. Sem ele, a importação continua funcionando para legendas, e os documentos aparecem com o aviso de que falta o conversor.

PDFs escaneados (só imagem, sem texto) ainda não são lidos: a gurIA marca a aula como "escaneado".

## Importar do YouTube: yt-dlp

Para importar um vídeo ou uma playlist do YouTube, a gurIA usa o [yt-dlp](https://github.com/yt-dlp/yt-dlp) (gratuito) só para ler a lista de vídeos e as legendas; o vídeo nunca é baixado. Vídeos sem legenda entram como "sem texto".

1. Baixe o `yt-dlp.exe` da página de [versões do yt-dlp](https://github.com/yt-dlp/yt-dlp/releases/latest).
2. Coloque o arquivo em `%LOCALAPPDATA%\CognitiveStudyHubTools\yt-dlp\yt-dlp.exe` (crie a pasta `yt-dlp` se não existir).

Cursos da Udemy não são baixados pela gurIA: importe só os arquivos que você já tem (legendas, PDFs e slides liberados pelo instrutor).

## Escolhendo a IA

Em **Configurações**, escolha entre Codex e Claude. O app consulta conta e limites antes de gerar e **nunca troca de provedor sozinho**. Veja [estudos.md](estudos.md) para os detalhes de custo e privacidade.

## Testes

```powershell
npm test
npm run typecheck
npm run build
```

Para ver a gurIA com dados fictícios sem tocar nos seus (banco 5441, app 3034): `npm run demo`. Alguns scripts `scripts/study-*.mjs` chamam IA de verdade e consomem a cota da assinatura; use dados sintéticos e um banco isolado.

## Problemas comuns

- **`npm run db:up` falha:** confirme que o Docker Desktop está aberto.
- **Porta 5440 ocupada:** escolha outra no terminal antes de subir o banco, por exemplo `$env:OPENMAIC_DB_PORT = '5442'; npm run db:up`, e use a mesma porta no `DATABASE_URL` do `.env.local`.
- **Porta 3033 ocupada:** rode o Next direto com outra porta: `npx next dev --webpack --hostname 127.0.0.1 --port 3035`, e abra `http://127.0.0.1:3035/study`.
- **O servidor mostra `DATABASE_URL não está definida`:** a variável está comentada ou ausente em `.env.local`. Confira o arquivo e rode `npm run db:up`.
- **Erro de banco ao abrir `/study`:** confira se `DATABASE_URL` usa a mesma porta do banco.
