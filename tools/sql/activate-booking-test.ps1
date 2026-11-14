param([Parameter(Mandatory=$true)][ValidateSet('USER-20261112-REAL-PRICING-CUSTOMER-BOOKING')][string]$ApprovalReference)
$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$taskStage='C:\ProgramData\SongLamPmsTest\20261112-modules-3-4'
if([Security.Principal.WindowsIdentity]::GetCurrent().Name -ine 'DESKTOP-9EPI86K\Thang DZ'){throw 'OPERATOR_REQUIRED'}
$taskPrivate=Join-Path $PSScriptRoot 'private\booking012'
$taskPlan=Get-Content -LiteralPath (Join-Path $taskPrivate 'booking-test-release.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if($taskPlan.approvalReference -ne $ApprovalReference -or $taskPlan.target.database -ne 'SongLamPms_Design' -or $taskPlan.target.server -ne '.\SQLEXPRESS' -or $taskPlan.operationalCutover -ne $false){throw 'SCOPED_TEST_APPROVAL_REQUIRED'}
$taskCredential=Import-Clixml -LiteralPath (Join-Path $PSScriptRoot 'private\service-account\credential.clixml')
if($taskCredential.UserName -ine 'DESKTOP-9EPI86K\songlam_pms_test'){throw 'DEDICATED_SERVICE_REQUIRED'}
$taskListeners=@(Get-NetTCPConnection -LocalPort 8093 -State Listen -ErrorAction SilentlyContinue)
if($taskListeners.Count -gt 1){throw 'UNEXPECTED_LISTENERS'}
if($taskListeners.Count -eq 1){
 $taskStopPath=Join-Path $taskStage 'tools\sql\stop-staged-test-service.ps1'
 $taskStopOutput=Join-Path $taskStage 'logs\booking012-stop.json'
 $taskStop=Start-Process powershell.exe -Credential $taskCredential -LoadUserProfile -WindowStyle Hidden -WorkingDirectory $taskStage -ArgumentList @('-NoProfile','-ExecutionPolicy','RemoteSigned','-File',$taskStopPath,'-TaskProcessId',$taskListeners[0].OwningProcess) -RedirectStandardOutput $taskStopOutput -RedirectStandardError (Join-Path $taskStage 'logs\booking012-stop-error.txt') -PassThru
 if(!$taskStop.WaitForExit(15000)){throw 'STOP_TIMEOUT'}
 if((Get-Content -LiteralPath $taskStopOutput -Raw | ConvertFrom-Json).status -ne 'STAGED_TEST_LISTENER_STOPPED' -or (Get-NetTCPConnection -LocalPort 8093 -State Listen -ErrorAction SilentlyContinue)){throw 'EXACT_SERVICE_STOP_NOT_CONFIRMED'}
}
# Copy application source only. No .git, fixture providers, .env or private files.
foreach($taskDirectory in @('backend\src','js','css')){
 $taskSource=Join-Path $taskRoot $taskDirectory
 Get-ChildItem -LiteralPath $taskSource -File -Recurse | ForEach-Object {
  $taskRelative=$_.FullName.Substring($taskRoot.Length+1)
  $taskTarget=Join-Path $taskStage $taskRelative
  New-Item -ItemType Directory -Path (Split-Path $taskTarget -Parent) -Force | Out-Null
  Copy-Item -LiteralPath $_.FullName -Destination $taskTarget -Force
 }
}
Get-ChildItem -LiteralPath $taskRoot -Filter *.html | ForEach-Object {
 Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $taskStage $_.Name) -Force
}
if(Test-Path (Join-Path $taskRoot 'favicon.svg')){
 Copy-Item -LiteralPath (Join-Path $taskRoot 'favicon.svg') -Destination (Join-Path $taskStage 'favicon.svg') -Force
}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'booking-service-entry.mjs') -Destination (Join-Path $taskStage 'tools\sql\service-entry.mjs') -Force
Copy-Item -LiteralPath (Join-Path $taskPrivate 'manifest.json') -Destination (Join-Path $taskStage 'runtime\manifest.json') -Force
Copy-Item -LiteralPath (Join-Path $taskPrivate 'booking-test-release.json') -Destination (Join-Path $taskStage 'runtime\booking-test-release.json') -Force
$taskStamp=[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff')
$taskProcess=Start-Process 'C:\Program Files\nodejs\node.exe' -Credential $taskCredential -LoadUserProfile -WindowStyle Hidden -WorkingDirectory $taskStage -ArgumentList ('"'+(Join-Path $taskStage 'tools\sql\service-entry.mjs')+'"') -RedirectStandardOutput (Join-Path $taskStage ('logs\booking012-'+$taskStamp+'.jsonl')) -RedirectStandardError (Join-Path $taskStage ('logs\booking012-'+$taskStamp+'-error.jsonl')) -PassThru
@{status='SCOPED_TEST_STARTED_VERIFY_REQUIRED';processId=$taskProcess.Id;url='http://127.0.0.1:8093/login.html';operationalCutover=$false} | ConvertTo-Json -Compress
