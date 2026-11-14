# Deploy latest workspace files to staging and run service as daemon
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$taskStage = 'C:\ProgramData\SongLamPmsTest\20261112-modules-3-4'
$taskPrivate = Join-Path $PSScriptRoot 'private\booking012'

# Stop any existing listener on port 8093
$taskListeners = @(Get-NetTCPConnection -LocalPort 8093 -State Listen -ErrorAction SilentlyContinue)
if ($taskListeners.Count -gt 0) {
    $taskCredential = Import-Clixml -LiteralPath (Join-Path $PSScriptRoot 'private\service-account\credential.clixml')
    $taskStopPath = Join-Path $taskStage 'tools\sql\stop-staged-test-service.ps1'
    $taskStopOutput = Join-Path $taskStage 'logs\booking012-stop.json'
    $taskStop = Start-Process powershell.exe -Credential $taskCredential -LoadUserProfile -WindowStyle Hidden -WorkingDirectory $taskStage -ArgumentList @('-NoProfile','-ExecutionPolicy','RemoteSigned','-File',$taskStopPath,'-TaskProcessId',$taskListeners[0].OwningProcess) -RedirectStandardOutput $taskStopOutput -RedirectStandardError (Join-Path $taskStage 'logs\booking012-stop-error.txt') -PassThru
    $taskStop.WaitForExit(10000)
    Start-Sleep -Seconds 1
}

# Sync files to staging
foreach ($taskDirectory in @('backend\src','js','css')) {
    $taskSource = Join-Path $taskRoot $taskDirectory
    Get-ChildItem -LiteralPath $taskSource -File -Recurse | ForEach-Object {
        $taskRelative = $_.FullName.Substring($taskRoot.Length+1)
        $taskTarget = Join-Path $taskStage $taskRelative
        New-Item -ItemType Directory -Path (Split-Path $taskTarget -Parent) -Force | Out-Null
        Copy-Item -LiteralPath $_.FullName -Destination $taskTarget -Force
    }
}
Get-ChildItem -LiteralPath $taskRoot -Filter *.html | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $taskStage $_.Name) -Force
}
if (Test-Path (Join-Path $taskRoot 'favicon.svg')) {
    Copy-Item -LiteralPath (Join-Path $taskRoot 'favicon.svg') -Destination (Join-Path $taskStage 'favicon.svg') -Force
}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'booking-service-entry.mjs') -Destination (Join-Path $taskStage 'tools\sql\service-entry.mjs') -Force
Copy-Item -LiteralPath (Join-Path $taskPrivate 'manifest.json') -Destination (Join-Path $taskStage 'runtime\manifest.json') -Force
Copy-Item -LiteralPath (Join-Path $taskPrivate 'booking-test-release.json') -Destination (Join-Path $taskStage 'runtime\booking-test-release.json') -Force

# Start the node service under service credentials
$taskCredential = Import-Clixml -LiteralPath (Join-Path $PSScriptRoot 'private\service-account\credential.clixml')
$taskStamp = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff')
$taskProcess = Start-Process 'C:\Program Files\nodejs\node.exe' -Credential $taskCredential -LoadUserProfile -WindowStyle Hidden -WorkingDirectory $taskStage -ArgumentList ('"'+(Join-Path $taskStage 'tools\sql\service-entry.mjs')+'"') -RedirectStandardOutput (Join-Path $taskStage ('logs\daemon-'+$taskStamp+'.jsonl')) -RedirectStandardError (Join-Path $taskStage ('logs\daemon-'+$taskStamp+'-error.jsonl')) -PassThru

Write-Host "DAEMON_SERVICE_STARTED: PID=$($taskProcess.Id)"

# Loop indefinitely to keep the process alive as daemon
while (!$taskProcess.HasExited) {
    Start-Sleep -Seconds 5
}
Write-Host "DAEMON_SERVICE_EXITED: Code=$($taskProcess.ExitCode)"
