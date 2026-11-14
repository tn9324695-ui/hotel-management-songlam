# Creates only the explicitly approved non-admin test runner. No SQL changes.
param([Parameter(Mandatory=$true)][ValidateSet('USER-20261112-MODULES-3-4')][string]$ApprovalReference)
$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$taskPrivate=Join-Path $taskRoot 'tools\sql\private\service-account'
$taskReceipt=Join-Path $taskPrivate 'provision-receipt.json'
$taskCredential=Join-Path $taskPrivate 'credential.clixml'
$taskCreatedState=Join-Path $taskPrivate 'created-state.json'
$taskOperator=[Security.Principal.WindowsIdentity]::GetCurrent()
$taskOperatorPrincipal=New-Object Security.Principal.WindowsPrincipal($taskOperator)
if(!$taskOperatorPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'SERVICE_ACCOUNT_WINDOWS_ADMIN_REQUIRED'}
if($env:COMPUTERNAME -ne 'DESKTOP-9EPI86K' -or $taskOperator.Name -ine 'DESKTOP-9EPI86K\Thang DZ'){throw 'SERVICE_ACCOUNT_OPERATOR_MISMATCH'}
New-Item -ItemType Directory -Path $taskPrivate -Force | Out-Null
if((Get-Item -LiteralPath $taskPrivate).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'SERVICE_ACCOUNT_PRIVATE_PATH_INVALID'}
# Use native ACL operations, not broad workspace or machine permission changes.
$taskSid=$taskOperator.User.Value
& icacls.exe $taskPrivate /grant:r ('*'+$taskSid+':(OI)(CI)F') *> $null
if($LASTEXITCODE -ne 0){throw 'SERVICE_ACCOUNT_PRIVATE_ACL_FAILED'}
& icacls.exe $taskPrivate /inheritance:r *> $null
if($LASTEXITCODE -ne 0){throw 'SERVICE_ACCOUNT_PRIVATE_ACL_FAILED'}
$taskOthers=@((Get-Acl -LiteralPath $taskPrivate).Access | ForEach-Object {$_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value} | Where-Object {$_ -ne $taskSid} | Select-Object -Unique)
foreach($taskOther in $taskOthers){& icacls.exe $taskPrivate /remove ('*'+$taskOther) *> $null;if($LASTEXITCODE -ne 0){throw 'SERVICE_ACCOUNT_PRIVATE_ACL_FAILED'}}
$taskPhase='preflight'
try {
 $taskExisting=Get-LocalUser -Name 'songlam_pms_test' -ErrorAction SilentlyContinue
 if($taskExisting){
  if(!(Test-Path -LiteralPath $taskCredential) -or !$taskExisting.Enabled){throw 'SERVICE_ACCOUNT_EXISTS_REVIEW_REQUIRED'}
  if(Test-Path -LiteralPath $taskReceipt){
   $taskPrior=Get-Content -LiteralPath $taskReceipt -Raw -Encoding UTF8 | ConvertFrom-Json
   if($taskPrior.status -ne 'WINDOWS_SERVICE_ACCOUNT_CREATED' -or $taskPrior.sid -ne $taskExisting.SID.Value){throw 'SERVICE_ACCOUNT_EXISTS_REVIEW_REQUIRED'}
  }elseif(Test-Path -LiteralPath $taskCreatedState){
   $taskPrior=Get-Content -LiteralPath $taskCreatedState -Raw -Encoding UTF8 | ConvertFrom-Json
   if($taskPrior.sid -ne $taskExisting.SID.Value -or $taskPrior.approvalReference -ne $ApprovalReference -or $taskPrior.account -ine 'DESKTOP-9EPI86K\songlam_pms_test'){throw 'SERVICE_ACCOUNT_EXISTS_REVIEW_REQUIRED'}
  }else{throw 'SERVICE_ACCOUNT_EXISTS_REVIEW_REQUIRED'}
 } else {
  if(Test-Path -LiteralPath $taskReceipt){throw 'SERVICE_ACCOUNT_ARTIFACTS_EXIST_REVIEW_REQUIRED'}
  if(Test-Path -LiteralPath $taskCredential){
   # Recover only our credential-only state after a failed pre-creation step.
   if(!(Test-Path -LiteralPath (Join-Path $taskPrivate 'provision-error.json'))){throw 'SERVICE_ACCOUNT_ARTIFACTS_EXIST_REVIEW_REQUIRED'}
   $taskCred=Import-Clixml -LiteralPath $taskCredential
   if($taskCred -isnot [Management.Automation.PSCredential] -or $taskCred.UserName -ine 'DESKTOP-9EPI86K\songlam_pms_test' -or $taskCred.Password.Length -eq 0){throw 'SERVICE_ACCOUNT_CREDENTIAL_MISMATCH'}
   $taskPassword=$taskCred.Password
  }else{
   $taskRandom=New-Object byte[] 48
   $taskRng=[Security.Cryptography.RandomNumberGenerator]::Create()
   try{$taskRng.GetBytes($taskRandom)}finally{$taskRng.Dispose()}
   $taskPlain='Sl9!'+[Convert]::ToBase64String($taskRandom)
   $taskPassword=ConvertTo-SecureString -String $taskPlain -AsPlainText -Force
   $taskPlain=$null;[Array]::Clear($taskRandom,0,$taskRandom.Length)
   $taskCred=New-Object Management.Automation.PSCredential('DESKTOP-9EPI86K\songlam_pms_test',$taskPassword)
   # DPAPI bound to this operator/machine; secret never printed or put in argv.
   $taskCred | Export-Clixml -LiteralPath $taskCredential -NoClobber
  }
  $taskPhase='create-local-user'
  New-LocalUser -Name 'songlam_pms_test' -Password $taskPassword -Description 'SongLam PMS SQL test runner' | Out-Null
  $taskExisting=Get-LocalUser -Name 'songlam_pms_test'
  @{account='DESKTOP-9EPI86K\songlam_pms_test';sid=$taskExisting.SID.Value;approvalReference=$ApprovalReference;status='ACCOUNT_CREATED_GROUPS_NOT_YET_VERIFIED'} | ConvertTo-Json | Set-Content -LiteralPath $taskCreatedState -Encoding UTF8
 }
 $taskPhase='users-membership'
 $taskUsers=Get-LocalGroup -SID 'S-1-5-32-545'
 if(!@(Get-LocalGroupMember -Group $taskUsers.Name | Where-Object {$_.SID.Value -eq $taskExisting.SID.Value}).Count){Add-LocalGroupMember -Group $taskUsers.Name -Member 'DESKTOP-9EPI86K\songlam_pms_test'}
 $taskPhase='verify-non-admin'
 $taskAdmins=Get-LocalGroup -SID 'S-1-5-32-544'
 if(@(Get-LocalGroupMember -Group $taskAdmins.Name | Where-Object {$_.SID.Value -eq $taskExisting.SID.Value}).Count -gt 0){throw 'SERVICE_ACCOUNT_ADMIN_MEMBERSHIP_FORBIDDEN'}
 $taskResult=[ordered]@{status='WINDOWS_SERVICE_ACCOUNT_CREATED';approvalReference=$ApprovalReference;account='DESKTOP-9EPI86K\songlam_pms_test';sid=$taskExisting.SID.Value;enabled=$taskExisting.Enabled;localAdministrator=$false;credentialFormat='OPERATOR_DPAPI_CLIXML';confirmedAtUtc=[DateTime]::UtcNow.ToString('o')}
 if(!(Test-Path -LiteralPath $taskReceipt)){$taskResult | ConvertTo-Json | Set-Content -LiteralPath $taskReceipt -Encoding UTF8}
 $taskResult | ConvertTo-Json -Compress
}catch{
 @{status='NOT_CONFIRMED';code='SERVICE_ACCOUNT_PROVISION_FAILED_REVIEW_LOCAL_STATE';phase=$taskPhase;exceptionType=$_.Exception.GetType().Name;parameterName=$_.Exception.ParameterName} | ConvertTo-Json -Compress | Set-Content -LiteralPath (Join-Path $taskPrivate 'provision-error.json') -Encoding UTF8
 exit 1
}
