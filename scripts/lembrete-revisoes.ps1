# Aviso do Windows com a contagem de revisões vencidas da gurIA.
# Lê o resumo gravado pela gurIA a cada salvamento (só datas) e não precisa do app nem do Docker.
# Uso: powershell -NoProfile -WindowStyle Hidden -File lembrete-revisoes.ps1 -Arquivo <resumo> [-Abrir <alvo>] [-Testar]
# Sem revisões vencidas, ou com o arquivo ausente/corrompido, sai sem aviso (com -Testar, escreve o motivo).
param(
  [Parameter(Mandatory = $true)][string]$Arquivo,
  [string]$Abrir = 'http://127.0.0.1:3033/study?tab=praticar',
  [switch]$Testar
)
$ErrorActionPreference = 'Stop'

function Get-Vencidas([string]$Caminho) {
  if (-not (Test-Path -LiteralPath $Caminho)) { return $null }
  try {
    $resumo = [System.IO.File]::ReadAllText($Caminho, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
  } catch { return $null }
  if ($resumo.versao -ne 1) { return $null }
  $agora = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  return @($resumo.vencimentos | Where-Object { [double]$_ -le $agora }).Count
}

$n = Get-Vencidas $Arquivo
if ($null -eq $n) { if ($Testar) { 'sem-resumo' }; exit 0 }
if ($n -le 0) { if ($Testar) { 'nenhuma' }; exit 0 }

$texto = if ($n -eq 1) { '1 conceito para revisar hoje' } else { "$n conceitos para revisar hoje" }
$seguro = [System.Security.SecurityElement]::Escape($Abrir)

[void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
[void][Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml(@"
<toast activationType="protocol" launch="$seguro">
  <visual><binding template="ToastGeneric"><text>gurIA</text><text>$texto</text></binding></visual>
  <actions><action content="Abrir a gurIA" activationType="protocol" arguments="$seguro"/></actions>
</toast>
"@)
$toast = New-Object Windows.UI.Notifications.ToastNotification $xml
$toast.Tag = 'guria-revisoes'
# Identidade do próprio Windows PowerShell: não exige registrar um app novo no sistema.
$app = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($app).Show($toast)
if ($Testar) { "avisado:$n" }
