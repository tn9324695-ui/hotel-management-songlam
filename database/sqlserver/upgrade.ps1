param(
    [string]$Server = 'lpc:.\SQLEXPRESS',
    [ValidatePattern('^[A-Za-z][A-Za-z0-9_]{0,90}$')]
    [string]$Database = 'SongLamPms_Design',
    [switch]$TrustServerCertificate
)
$ErrorActionPreference='Stop'
$sqlcmd=(Get-Command sqlcmd -ErrorAction Stop).Source
$connectionArgs=@('-S',$Server,'-E','-b','-l','10','-f','65001')
if($TrustServerCertificate){$connectionArgs+='-C'}
if($Database -in @('master','model','msdb','tempdb')){throw 'System databases are not upgrade targets.'}
$versionText=& $sqlcmd @connectionArgs -d $Database -h -1 -W -Q 'SET NOCOUNT ON; SELECT MAX(Version) FROM pms.SchemaVersion;'
if($LASTEXITCODE -ne 0){throw 'Cannot read schema version; no changes made.'}
$schemaBefore=[int](($versionText | Out-String).Trim())
if($schemaBefore -notin @(1,2)){throw 'Expected schema version 1 or 2. No changes made.'}
# Names are validated, backup path comes from SQL Server, filename has a unique UUID.
$backupSql=@"
SET NOCOUNT ON;
IF NOT EXISTS(SELECT 1 FROM pms.SchemaVersion WHERE Version=1) OR EXISTS(SELECT 1 FROM pms.SchemaVersion WHERE Version=3)
 THROW 52000,'Expected version 1 or 2; no upgrade performed.',1;
DECLARE @path nvarchar(1000)=CONVERT(nvarchar(800),SERVERPROPERTY('InstanceDefaultBackupPath'));
IF @path IS NULL THROW 52000,'SQL Server backup directory is not configured.',1;
IF RIGHT(@path,1) NOT IN ('\','/') SET @path+=N'\';
SET @path+=N'${Database}_pre_upgrade_'+REPLACE(CONVERT(nvarchar(36),NEWID()),'-','')+N'.bak';
BACKUP DATABASE [$Database] TO DISK=@path WITH COPY_ONLY,CHECKSUM;
RESTORE VERIFYONLY FROM DISK=@path WITH CHECKSUM;
SELECT @path AS VerifiedBackupPath;
"@
& $sqlcmd @connectionArgs -d $Database -h -1 -W -Q $backupSql
if($LASTEXITCODE -ne 0){throw 'Verified backup was not completed. No migration applied.'}
$scriptNames=@()
if($schemaBefore -eq 1){$scriptNames+=@('004_business_contract.sql','005_business_validation.sql','006_command_gateway.sql','007_enforce_access.sql')}
$scriptNames+='008_cancellation_reason.sql'
$mergedSqlFile=[System.IO.Path]::GetTempFileName()
try {
    $sqlText=($scriptNames | ForEach-Object { [System.IO.File]::ReadAllText((Join-Path $PSScriptRoot $_)) }) -join "`r`nGO`r`n"
    [System.IO.File]::WriteAllText($mergedSqlFile,$sqlText,(New-Object System.Text.UTF8Encoding($false)))
    & $sqlcmd @connectionArgs -d $Database -i $mergedSqlFile
    if($LASTEXITCODE -ne 0){throw 'Failed migration rolled back; earlier completed versions are retained. Verified backup retained; no automatic restore or deletion.'}
} finally {
    Remove-Item -LiteralPath $mergedSqlFile -ErrorAction SilentlyContinue
}
Write-Output "Upgraded $Database to schema version 3. Existing app data was not imported or replaced."
