# Open the approved local frontend/backend/SQL test path. No migrations or seed.
param([switch]$NoOpen)
$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$taskOrigin='http://127.0.0.1:8093'
$script:taskWriteEnabled=$false
function Get-TestConnection {
 try {
  $taskResponse=Invoke-RestMethod -Uri ($taskOrigin+'/api/v1/connection/status') -TimeoutSec 10
  $script:taskWriteEnabled=$taskResponse.data.businessWritesEnabled -eq $true
  $taskAllowedScope=$taskResponse.data.businessWritesEnabled -eq $false
  if($script:taskWriteEnabled -and $taskResponse.data.writeScope -eq 'TEST_CUSTOMERS_AND_BOOKING_ONLY' -and $taskResponse.data.operationalCutover -eq $false){
   $taskScope=Invoke-RestMethod -Uri ($taskOrigin+'/api/v1/deployment') -TimeoutSec 10
   $taskOperationNames=@($taskScope.data.operations | ForEach-Object {$_.operation})
   $taskExpectedOperations=@('customers.create','bookings.create','bookings.group')
   if($taskScope.data.mutationOperationsVerified -eq $true){$taskExpectedOperations+=@('bookings.assign','bookings.cancel','bookings.cancelRooms')}
   if($taskScope.data.checkInOperationsVerified -eq $true){$taskExpectedOperations+=@('stays.checkIn')}
   $taskAllowedScope=$taskScope.data.testOnly -eq $true -and $taskScope.data.operationalCutover -eq $false -and $taskScope.data.deploymentId -eq 'f916e0c6-20d4-477c-966f-dcd278dfb083' -and $taskOperationNames.Count -eq $taskExpectedOperations.Count -and @($taskOperationNames | Where-Object {$_ -notin $taskExpectedOperations}).Count -eq 0 -and @($taskExpectedOperations | Where-Object {$_ -notin $taskOperationNames}).Count -eq 0
  }
  if($taskResponse.data.mode -eq 'test-only' -and $taskResponse.data.configured -eq $true -and $taskResponse.data.sqlConnected -eq $true -and $taskResponse.data.identityVerified -eq $true -and $taskAllowedScope -and @($taskResponse.data.modules) -contains 'catalogGateway'){
   $taskAuth=Invoke-RestMethod -Uri ($taskOrigin+'/api/v1/auth/status') -TimeoutSec 3
   return ($taskAuth.data.loginEnabled -eq $true -and $taskAuth.data.fixture -eq $false)
  }
 }catch{}
 return $false
}
try {
 if(!(Get-TestConnection)){
  if(Get-NetTCPConnection -LocalPort 8093 -State Listen -ErrorAction SilentlyContinue){throw 'LOCAL_PORT_IN_USE_WITH_UNVERIFIED_BACKEND'}
  # The launcher reads only the existing operator-bound credential and approved
  # staged manifest. It never starts the SQL pool under the operator identity.
  & (Join-Path $taskRoot 'tools\sql\start-service-test.ps1') -ApprovalReference USER-20261112-MODULES-3-4
  $taskDeadline=[DateTime]::UtcNow.AddSeconds(20)
  while(!(Get-TestConnection)){
   if([DateTime]::UtcNow -gt $taskDeadline){throw 'TEST_BACKEND_NOT_CONNECTED'}
   Start-Sleep -Milliseconds 500
  }
 }
 if(!$NoOpen){Start-Process -FilePath ($taskOrigin+'/login.html') | Out-Null}
 @{status='FRONTEND_BACKEND_SQL_TEST_CONNECTED';loginUrl=$taskOrigin+'/login.html';catalogUrl=$taskOrigin+'/catalog-api.html';businessWritesEnabled=$script:taskWriteEnabled;writeScope='TEST_ONLY_NOT_OPERATIONAL';browserOpened=(!$NoOpen)} | ConvertTo-Json -Compress
}catch{
 Write-Output 'SONGLAM_START_NOT_CONFIRMED: Khong xac minh duoc backend/SQL kiem thu. Khong co migration, seed hoac fallback localStorage duoc chay.'
 exit 1
}
