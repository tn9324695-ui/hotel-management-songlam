# Restart the already staged, approved test build; no SQL deployment or seed.
param([Parameter(Mandatory=$true)][ValidateSet('USER-20261112-MODULES-3-4')][string]$ApprovalReference)
$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$taskStage='C:\ProgramData\SongLamPmsTest\20261112-modules-3-4'
if([Security.Principal.WindowsIdentity]::GetCurrent().Name -ine 'DESKTOP-9EPI86K\Thang DZ'){throw 'TEST_SERVICE_OPERATOR_REQUIRED'}
if(Get-NetTCPConnection -LocalPort 8093 -State Listen -ErrorAction SilentlyContinue){throw 'TEST_SERVICE_PORT_ALREADY_IN_USE'}
$taskManifest=Get-Content -LiteralPath (Join-Path $taskStage 'runtime\manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if($taskManifest.approvalReference -ne $ApprovalReference -or $taskManifest.profile.target.server -ne '.\SQLEXPRESS' -or $taskManifest.profile.target.database -ne 'SongLamPms_Design' -or $taskManifest.profile.environment -ne 'test' -or $taskManifest.expectedPrincipal -ine 'DESKTOP-9EPI86K\songlam_pms_test'){throw 'TEST_SERVICE_MANIFEST_MISMATCH'}
if(!(Test-Path -LiteralPath (Join-Path $taskStage 'runtime\session-epoch.secret'))){throw 'TEST_SERVICE_EPOCH_REQUIRED'}
$taskCredential=Import-Clixml -LiteralPath (Join-Path $taskRoot 'tools\sql\private\service-account\credential.clixml')
if($taskCredential -isnot [Management.Automation.PSCredential] -or $taskCredential.UserName -ine 'DESKTOP-9EPI86K\songlam_pms_test'){throw 'TEST_SERVICE_CREDENTIAL_MISMATCH'}
$taskStamp=[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff')
$taskProcess=Start-Process -FilePath 'C:\Program Files\nodejs\node.exe' -Credential $taskCredential -LoadUserProfile -WindowStyle Hidden -WorkingDirectory $taskStage -ArgumentList ('"'+(Join-Path $taskStage 'tools\sql\service-entry.mjs')+'"') -RedirectStandardOutput (Join-Path $taskStage ('logs\backend-'+$taskStamp+'.jsonl')) -RedirectStandardError (Join-Path $taskStage ('logs\backend-'+$taskStamp+'-error.jsonl')) -PassThru
@{status='STARTED_NOT_YET_VERIFIED';processId=$taskProcess.Id;url='http://127.0.0.1:8093/login.html'} | ConvertTo-Json -Compress
