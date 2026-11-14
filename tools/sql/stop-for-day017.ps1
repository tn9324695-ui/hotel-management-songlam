param([Parameter(Mandatory=$true)][ValidateSet('USER-20261114-DAY017')][string]$ApprovalReference)
$ErrorActionPreference='Stop'
$taskStage='C:\ProgramData\SongLamPmsTest\20261112-modules-3-4'
$taskHelper=Join-Path $taskStage 'tools\sql\stop-staged-test-service.ps1'
$taskCredentialPath=Join-Path $PSScriptRoot 'private\service-account\credential.clixml'
if([Security.Principal.WindowsIdentity]::GetCurrent().Name -ine 'DESKTOP-9EPI86K\Thang DZ'){throw 'OPERATOR_REQUIRED'}
$taskListeners=@(Get-NetTCPConnection -LocalPort 8093 -State Listen -ErrorAction SilentlyContinue)
if($taskListeners.Count -gt 1){throw 'UNEXPECTED_LISTENERS'}
if($taskListeners.Count -eq 1){
 $taskCredential=Import-Clixml -LiteralPath $taskCredentialPath
 if($taskCredential.UserName -ine 'DESKTOP-9EPI86K\songlam_pms_test'){throw 'DEDICATED_SERVICE_REQUIRED'}
 $taskOutput=Join-Path $taskStage 'logs\day017-stop.json'
 $taskError=Join-Path $taskStage 'logs\day017-stop-error.txt'
 $taskStop=Start-Process powershell.exe -Credential $taskCredential -LoadUserProfile -WindowStyle Hidden -WorkingDirectory $taskStage -ArgumentList @('-NoProfile','-ExecutionPolicy','RemoteSigned','-File',$taskHelper,'-TaskProcessId',$taskListeners[0].OwningProcess) -RedirectStandardOutput $taskOutput -RedirectStandardError $taskError -PassThru
 if(!$taskStop.WaitForExit(15000)){throw 'STOP_TIMEOUT'}
 $taskReceipt=Get-Content -LiteralPath $taskOutput -Raw | ConvertFrom-Json
 if($taskReceipt.status -ne 'STAGED_TEST_LISTENER_STOPPED'){throw 'EXACT_SERVICE_STOP_NOT_CONFIRMED'}
}
if(Get-NetTCPConnection -LocalPort 8093 -State Listen -ErrorAction SilentlyContinue){throw 'LISTENER_STILL_RUNNING'}
$taskWriters=@(Get-CimInstance Win32_Process | Where-Object {
 $_.Name -in @('node.exe','python.exe','pythonw.exe') -and $_.CommandLine -and
 ($_.CommandLine.Contains($taskStage) -or $_.CommandLine.Contains('hotel-management-songlam\tools\migration'))
})
if($taskWriters.Count){throw 'PROJECT_WRITER_CANDIDATE_REMAINS'}
@{status='STAGED_BACKEND_STOPPED';approvalReference=$ApprovalReference;listenerCount=0;projectWriterCandidates=0;checkedAtUtc=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json -Compress
