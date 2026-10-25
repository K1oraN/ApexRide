# Apex Ride - ETAPA 03 - Configuracao OPT-IN para ambiente local.
# Rode apenas na raiz do projeto, apos ler docs/ETAPA_03_EXPLORAR_E_ROTAS.md.
# Nao depende de Docker, nao altera DATABASE_URL e nao executa migracoes.
param(
  [switch]$UsarOsrmDemo,
  [switch]$AtivarMapTilerSeHouverChave
)

$ErrorActionPreference = 'Stop'
$raiz = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
# Ao ser copiado para a raiz do projeto, este script mora em D:\Projetos\ApexRide\scripts.
$envPath = Join-Path $raiz '.env'
if (-not (Test-Path -LiteralPath $envPath)) {
  throw 'Arquivo .env não encontrado na raiz do Apex Ride.'
}

$conteudo = [System.IO.File]::ReadAllText($envPath)
$backupDir = Join-Path $raiz '.local\backups-env'
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
$backupPath = Join-Path $backupDir ('.env-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.bak')
Copy-Item -LiteralPath $envPath -Destination $backupPath

function Definir-Env([string]$nome, [string]$valor) {
  $padrao = '(?m)^' + [regex]::Escape($nome) + '=.*(?:\r?\n|$)'
  $novaLinha = "$nome=$valor`r`n"
  if ([regex]::IsMatch($script:conteudo, $padrao)) {
    $script:conteudo = [regex]::Replace($script:conteudo, $padrao, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $novaLinha }, 1)
  } else {
    $script:conteudo = $script:conteudo.TrimEnd("`r", "`n") + "`r`n" + $novaLinha
  }
}

if ($UsarOsrmDemo) {
  Definir-Env 'ROUTING_OSRM_URL' 'https://router.project-osrm.org'
  Definir-Env 'ROUTING_OSRM_PROFILE' 'driving'
  Write-Host 'OSRM demonstrativo selecionado APENAS para testes locais.' -ForegroundColor Yellow
} else {
  Write-Host 'ROUTING_OSRM_URL não alterado. Use -UsarOsrmDemo para testes limitados.'
}

if ($AtivarMapTilerSeHouverChave) {
  $match = [regex]::Match($script:conteudo, '(?m)^GEOCODING_MAPTILER_KEY\s*=\s*(.+?)\s*$')
  $chave = if ($match.Success) { $match.Groups[1].Value.Trim() } else { '' }
  if ($chave -and $chave -notmatch '^(SUA_|COLOQUE_|EXEMPLO|CHANGE_ME)') {
    Definir-Env 'GEOCODING_AUTHORIZED' 'true'
    Write-Host 'Busca de endereços autorizada. A chave deve ser válida na conta MapTiler.' -ForegroundColor Green
  } else {
    Write-Warning 'GEOCODING_MAPTILER_KEY ausente. Não ativei a geocodificação.'
  }
}

if (-not $UsarOsrmDemo -and -not $AtivarMapTilerSeHouverChave) {
  Write-Warning 'Nenhuma configuração foi alterada: forneça pelo menos um parâmetro.'
  exit 0
}

[System.IO.File]::WriteAllText($envPath, $conteudo, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "Backup privado criado em $backupPath" -ForegroundColor DarkGreen
Write-Host 'Reinicie pnpm dev para carregar o .env atualizado.' -ForegroundColor Cyan
Write-Host 'Nunca envie .env nem .local ao GitHub.' -ForegroundColor Cyan
