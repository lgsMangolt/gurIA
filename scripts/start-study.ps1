param([switch]$NoOpen)
$ErrorActionPreference = 'Stop'
$studyRoot = Split-Path -Parent $PSScriptRoot
$studyUrl = 'http://127.0.0.1:3033'
$dockerDirectory = Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop'
$dockerExe = Join-Path $dockerDirectory 'resources\bin\docker.exe'
$nodeExe = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
Set-Location -LiteralPath $studyRoot
$listener = Get-NetTCPConnection -LocalPort 3033 -State Listen -ErrorAction SilentlyContinue
if (-not $listener) {
    if (-not (Get-Process -Name 'Docker Desktop' -ErrorAction SilentlyContinue)) {
        Start-Process -FilePath (Join-Path $dockerDirectory 'Docker Desktop.exe') -WindowStyle Hidden
    }
    $dockerReady = $false
    for ($i = 0; $i -lt 45; $i++) {
        & $dockerExe info --format '{{.ServerVersion}}' 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { $dockerReady = $true; break }
        Start-Sleep -Seconds 2
    }
    if (-not $dockerReady) { throw 'Abra o Docker Desktop e tente novamente.' }
    $env:OPENMAIC_DB_PORT = '5440'
    & $dockerExe compose -p openmaic-study-db -f docker-compose.db.yml up -d --wait --wait-timeout 90 postgres
    if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel iniciar o banco de estudos.' }
    New-Item -ItemType Directory -Path (Join-Path $studyRoot 'logs') -Force | Out-Null
    Start-Process -FilePath $nodeExe -ArgumentList '--max-old-space-size=6144 node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port 3033' -WorkingDirectory $studyRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $studyRoot 'logs\study-server.log') -RedirectStandardError (Join-Path $studyRoot 'logs\study-server-error.log') | Out-Null
}
for ($i = 0; $i -lt 90; $i++) {
    try {
        $health = Invoke-RestMethod -Uri ($studyUrl + '/api/study/health') -TimeoutSec 5
        if ($health.app -ne 'OpenMAIC Estudos') { throw 'A porta 3033 esta sendo usada por outro aplicativo.' }
        if (-not $NoOpen) { Start-Process ($studyUrl + '/study') }
        Write-Host ('OpenMAIC Estudos: ' + $studyUrl)
        exit 0
    } catch { if ($_.Exception.Message -like '*outro aplicativo*') { throw } }
    Start-Sleep -Seconds 2
}
throw 'A inicializacao demorou. Consulte a pasta logs do OpenMAIC-Estudos.'
