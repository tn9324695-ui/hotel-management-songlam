# Runs as the service identity; stop only its exact staged test Node listener.
param([Parameter(Mandatory=$true)][ValidateRange(1,2147483647)][int]$TaskProcessId)
$ErrorActionPreference='Stop'
if([Security.Principal.WindowsIdentity]::GetCurrent().Name -ine 'DESKTOP-9EPI86K\songlam_pms_test'){throw 'SERVICE_IDENTITY_REQUIRED'}
$taskExpected='C:\ProgramData\SongLamPmsTest\20261112-modules-3-4\tools\sql\service-entry.mjs'
$taskProcess=Get-CimInstance Win32_Process -Filter "ProcessId=$TaskProcessId"
if(!$taskProcess -or $taskProcess.Name -ine 'node.exe' -or !$taskProcess.CommandLine.Contains($taskExpected)){throw 'STAGED_PROCESS_NOT_VERIFIED'}
$taskOwner=Invoke-CimMethod -InputObject $taskProcess -MethodName GetOwner
if($taskOwner.ReturnValue -ne 0 -or $taskOwner.User -ine 'songlam_pms_test' -or $taskOwner.Domain -ine 'DESKTOP-9EPI86K'){throw 'STAGED_PROCESS_OWNER_MISMATCH'}
Stop-Process -Id $TaskProcessId -ErrorAction Stop
@{status='STAGED_TEST_LISTENER_STOPPED';processId=$TaskProcessId} | ConvertTo-Json -Compress
