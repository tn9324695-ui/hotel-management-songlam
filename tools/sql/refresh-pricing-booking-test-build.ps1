# Application code only: no SQL, seed, grants, runtime manifest or epoch changes.
param([Parameter(Mandatory=$true)][ValidateSet('PRICING_BOOKING_CODE_ONLY')][string]$Scope)
$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$taskStage='C:\ProgramData\SongLamPmsTest\20261112-modules-3-4'
if([Security.Principal.WindowsIdentity]::GetCurrent().Name -ine 'DESKTOP-9EPI86K\Thang DZ'){throw 'TEST_SERVICE_OPERATOR_REQUIRED'}
$taskManifest=Join-Path $taskStage 'runtime\manifest.json'
$taskEpoch=Join-Path $taskStage 'runtime\session-epoch.secret'
$taskManifestHash=(Get-FileHash -LiteralPath $taskManifest -Algorithm SHA256).Hash
$taskEpochHash=(Get-FileHash -LiteralPath $taskEpoch -Algorithm SHA256).Hash
$taskConfig=Get-Content -LiteralPath $taskManifest -Raw -Encoding UTF8 | ConvertFrom-Json
if($taskConfig.profile.target.database -ne 'SongLamPms_Design' -or $taskConfig.profile.target.server -ne '.\SQLEXPRESS' -or $taskConfig.profile.environment -ne 'test'){throw 'TEST_TARGET_MISMATCH'}
if((Get-Content -LiteralPath (Join-Path $taskStage 'tools\sql\service-entry.mjs') -Raw) -notmatch "PMS_WRITE_MODE:'frozen'"){throw 'FROZEN_TEST_ENTRY_REQUIRED'}
$taskCredential=Import-Clixml -LiteralPath (Join-Path $taskRoot 'tools\sql\private\service-account\credential.clixml')
if($taskCredential -isnot [Management.Automation.PSCredential] -or $taskCredential.UserName -ine 'DESKTOP-9EPI86K\songlam_pms_test'){throw 'TEST_SERVICE_CREDENTIAL_MISMATCH'}
$taskListeners=@(Get-NetTCPConnection -LocalPort 8093 -State Listen -ErrorAction SilentlyContinue)
if($taskListeners.Count -gt 1){throw 'UNEXPECTED_TEST_LISTENERS'}
if($taskListeners.Count -eq 1){
 $taskStopOutput=Join-Path $taskStage 'logs\pricing-booking-stop.json'
 $taskStopError=Join-Path $taskStage 'logs\pricing-booking-stop-error.txt'
 $taskStop=Start-Process -FilePath 'powershell.exe' -Credential $taskCredential -LoadUserProfile -WindowStyle Hidden -WorkingDirectory $taskStage -ArgumentList @('-NoProfile','-ExecutionPolicy','RemoteSigned','-File',(Join-Path $taskStage 'tools\sql\stop-staged-test-service.ps1'),'-TaskProcessId',$taskListeners[0].OwningProcess) -RedirectStandardOutput $taskStopOutput -RedirectStandardError $taskStopError -PassThru
 if(!$taskStop.WaitForExit(15000)){throw 'TEST_STOP_TIMEOUT'}
 $taskStopReceipt=Get-Content -LiteralPath $taskStopOutput -Raw | ConvertFrom-Json
 if($taskStopReceipt.status -ne 'STAGED_TEST_LISTENER_STOPPED' -or (Get-NetTCPConnection -LocalPort 8093 -State Listen -ErrorAction SilentlyContinue)){throw 'TEST_STOP_NOT_CONFIRMED'}
}
$taskFiles=@('backend\src\modules\pricing\engine.js','backend\src\modules\pricing\policy.js','backend\src\modules\bookings\validation.js','backend\src\modules\bookings\service.js','js\pages\reception-api.js','css\pms.css')
$taskHashes=@()
foreach($taskFile in $taskFiles){
 $taskSource=Join-Path $taskRoot $taskFile
 $taskDestination=Join-Path $taskStage $taskFile
 Copy-Item -LiteralPath $taskSource -Destination $taskDestination -Force
 $taskHash=(Get-FileHash -LiteralPath $taskSource -Algorithm SHA256).Hash
 if($taskHash -ne (Get-FileHash -LiteralPath $taskDestination -Algorithm SHA256).Hash){throw 'TEST_CODE_COPY_MISMATCH'}
 $taskHashes+=@{file=$taskFile;sha256=$taskHash}
}
if($taskManifestHash -ne (Get-FileHash -LiteralPath $taskManifest -Algorithm SHA256).Hash -or $taskEpochHash -ne (Get-FileHash -LiteralPath $taskEpoch -Algorithm SHA256).Hash){throw 'TEST_RUNTIME_CHANGED'}
$taskLaunch=& (Join-Path $PSScriptRoot 'start-service-test.ps1') -ApprovalReference 'USER-20261112-MODULES-3-4' | ConvertFrom-Json
$taskReady=$false
for($taskTry=0;$taskTry -lt 25;$taskTry++){
 try{$taskHealth=Invoke-RestMethod 'http://127.0.0.1:8093/health' -TimeoutSec 2;if($taskHealth.data.status -eq 'ok'){$taskReady=$true;break}}catch{}
 Start-Sleep -Milliseconds 200
}
if(!$taskReady){throw 'TEST_LISTENER_NOT_HEALTHY'}
$taskConnection=Invoke-RestMethod 'http://127.0.0.1:8093/api/v1/connection/status' -TimeoutSec 5
if(!$taskConnection.data.sqlConnected -or !$taskConnection.data.identityVerified -or $taskConnection.data.businessWritesEnabled){throw 'TEST_SQL_OR_FROZEN_STATE_INVALID'}
$taskReceipt=@{status='APPLICATION_REFRESHED_NO_SQL_DEPLOYMENT';atUtc=[DateTime]::UtcNow.ToString('o');processId=$taskLaunch.processId;frozen=$true;sqlConnected=$true;files=$taskHashes}
$taskEvidence=Join-Path $taskRoot 'tools\sql\private\pricing-booking-code-20261112'
New-Item -ItemType Directory -Path $taskEvidence -Force | Out-Null
$taskReceipt | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $taskEvidence 'code-refresh.json') -Encoding UTF8
$taskReceipt | ConvertTo-Json -Depth 5 -Compress
