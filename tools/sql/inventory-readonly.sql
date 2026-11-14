-- Read-only inventory. No values from customers, passwords, sessions or payments.
-- Counts are observations under READ COMMITTED, not a frozen/backup snapshot.
SET NOCOUNT ON;
SET LOCK_TIMEOUT 2000;
IF DB_NAME()<>N'SongLamPms_Design'
 THROW 53100,'Inventory target must be explicitly reviewed.',1;
SELECT DB_NAME() AS DatabaseName,SYSUTCDATETIME() AS ObservedAtUtc,
 state_desc,recovery_model_desc,is_read_only
FROM sys.databases WHERE name=DB_NAME();
DECLARE @ReadOnlyCounts nvarchar(max);
SELECT @ReadOnlyCounts=STRING_AGG(CONVERT(nvarchar(max),
 N'SELECT N'''+REPLACE(t.name,'''','''''')+N''' AS Entity,COUNT_BIG(*) AS Records FROM '
 +QUOTENAME(s.name)+N'.'+QUOTENAME(t.name)),N' UNION ALL ')
FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name=N'pms';
-- Generated exclusively from quoted catalog identifiers. Text consists of SELECTs.
IF @ReadOnlyCounts IS NOT NULL EXEC sys.sp_executesql @ReadOnlyCounts;
SELECT ar.Code AS RoleCode,COUNT_BIG(rp.PermissionId) AS PermissionCount
FROM pms.AppRole ar LEFT JOIN pms.RolePermission rp ON rp.RoleId=ar.RoleId
GROUP BY ar.Code ORDER BY ar.Code;
SELECT name AS CandidateProcedure FROM sys.procedures
WHERE schema_id=SCHEMA_ID(N'pms') AND name IN
 (N'usp_AppEnvironment',N'usp_AppAuthLookup',N'usp_AppIdentity',N'usp_AppActorProbe',
  N'usp_WebSessionProbe',N'usp_WebSessionCreate',N'usp_WebSessionGet',N'usp_WebSessionDestroy');
