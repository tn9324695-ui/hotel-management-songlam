param(
    [string]$Server = 'lpc:.\SQLEXPRESS',
    [ValidatePattern('^[A-Za-z][A-Za-z0-9_]{0,90}$')]
    [string]$Database = 'SongLamPms_Design',
    [switch]$TrustServerCertificate
)
$ErrorActionPreference = 'Stop'
$sqlcmd = (Get-Command sqlcmd -ErrorAction Stop).Source
$connectionArgs = @('-S', $Server, '-E', '-b', '-l', '10', '-f', '65001')
if ($TrustServerCertificate) { $connectionArgs += '-C' }
if ($Database -in @('master', 'model', 'msdb', 'tempdb')) { throw 'Choose a new application database.' }
# Validated identifier, no free-form SQL interpolation; refuse every existing database.
$createSql = "IF DB_ID(N'$Database') IS NOT NULL THROW 51000, 'Database already exists; installation stopped.', 1; CREATE DATABASE [$Database] COLLATE Vietnamese_100_CI_AS;"
& $sqlcmd @connectionArgs -d master -Q $createSql
if ($LASTEXITCODE -ne 0) { throw 'Database creation failed. Existing databases were not modified.' }
$scriptNames = @('001_schema.sql', '002_views_and_inventory.sql', '003_reference_seed.sql',
    '004_business_contract.sql', '005_business_validation.sql', '006_command_gateway.sql', '007_enforce_access.sql', '008_cancellation_reason.sql')
# 004..007 must share one sqlcmd connection: 004 begins and 007 commits the migration.
$mergedSqlFile = [System.IO.Path]::GetTempFileName()
try {
    $sqlText = ($scriptNames | ForEach-Object { [System.IO.File]::ReadAllText((Join-Path $PSScriptRoot $_)) }) -join "`r`nGO`r`n"
    [System.IO.File]::WriteAllText($mergedSqlFile,$sqlText,(New-Object System.Text.UTF8Encoding($false)))
    & $sqlcmd @connectionArgs -d $Database -i $mergedSqlFile
    if ($LASTEXITCODE -ne 0) { throw 'Failed migration rolled back; database and earlier completed versions retained for inspection.' }
} finally {
    Remove-Item -LiteralPath $mergedSqlFile -ErrorAction SilentlyContinue
}
Write-Output "Installed $Database on $Server. No operational data or login accounts were seeded."
