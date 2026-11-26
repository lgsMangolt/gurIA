# Instala o conversor de documentos da gurIA (Microsoft MarkItDown 0.1.8, licença MIT)
# num ambiente Python próprio, fora do projeto:
#   %LOCALAPPDATA%\CognitiveStudyHubTools\markitdown
# Requisito: Python 3.12 (https://www.python.org/downloads/). Pode rodar de novo sem problema.
$ErrorActionPreference = 'Stop'
$target = Join-Path $env:LOCALAPPDATA 'CognitiveStudyHubTools\markitdown'
$exe = Join-Path $target 'Scripts\markitdown.exe'

if (-not (Get-Command py -ErrorAction SilentlyContinue)) {
    throw 'Python não encontrado. Instale o Python 3.12 (python.org) e rode este script de novo.'
}
& py -3.12 --version | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw 'O Python 3.12 não está instalado. Instale-o (python.org) e rode este script de novo.'
}

if (-not (Test-Path (Join-Path $target 'Scripts\python.exe'))) {
    Write-Host "Criando o ambiente em $target ..."
    & py -3.12 -m venv $target
    if ($LASTEXITCODE -ne 0) { throw 'Não foi possível criar o ambiente Python.' }
}

$python = Join-Path $target 'Scripts\python.exe'
Write-Host 'Instalando o MarkItDown 0.1.8 (PDF, DOCX e PPTX) ...'
& $python -m pip install --disable-pip-version-check --quiet 'markitdown[pdf,docx,pptx]==0.1.8'
if ($LASTEXITCODE -ne 0) { throw 'A instalação do MarkItDown falhou. Confira a internet e tente de novo.' }

& $exe --version
if ($LASTEXITCODE -ne 0) { throw 'O MarkItDown foi instalado, mas não respondeu.' }
Write-Host 'Pronto: a gurIA já consegue importar PDF, DOCX e PPTX.'
