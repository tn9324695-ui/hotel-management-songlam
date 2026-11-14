-- Metadata/counts only: no PasswordHash values, customer rows, session secrets,
-- DDL, DML, permission changes or operational command execution.
SET NOCOUNT ON;
SET LOCK_TIMEOUT 2000;
IF DB_NAME()<>N'SongLamPms_Design' OR CONVERT(nvarchar(128),SERVERPROPERTY('ServerName'))<>N'DESKTOP-9EPI86K\SQLEXPRESS'
 OR NOT EXISTS(SELECT 1 FROM sys.database_recovery_status WHERE database_id=DB_ID()
 AND database_guid='C4DD399E-5661-4741-A424-5ABFEEFBC1AC')
 THROW 53500,'Unexpected read-only preflight target.',1;
SELECT SYSUTCDATETIME() AS ObservedAtUtc,DB_NAME() AS DatabaseName,
 CONVERT(nvarchar(128),SERVERPROPERTY('ServerName')) AS ServerIdentity,
 CONVERT(int,SERVERPROPERTY('IsIntegratedSecurityOnly')) AS WindowsAuthenticationOnly;
SELECT name AS DeployedPmsProcedure FROM sys.procedures WHERE schema_id=SCHEMA_ID(N'pms') ORDER BY name;
SELECT expected.Name AS RequiredLoginRpc,CASE WHEN actual.object_id IS NULL THEN 0 ELSE 1 END AS Deployed
FROM (VALUES(N'usp_AppEnvironment'),(N'usp_AppAuthLookup'),(N'usp_AppIdentity'),
 (N'usp_WebSessionProbe'),(N'usp_WebSessionCreate'),(N'usp_WebSessionGet'),(N'usp_WebSessionDestroy')) expected(Name)
LEFT JOIN sys.procedures actual ON actual.schema_id=SCHEMA_ID(N'pms') AND actual.name=expected.Name;
SELECT N'AppUser' AS Entity,COUNT_BIG(*) AS Records FROM pms.AppUser
UNION ALL SELECT N'UserRole',COUNT_BIG(*) FROM pms.UserRole
UNION ALL SELECT N'PrincipalBinding',COUNT_BIG(*) FROM pms.PrincipalBinding
UNION ALL SELECT N'RoomType',COUNT_BIG(*) FROM pms.RoomType
UNION ALL SELECT N'Room',COUNT_BIG(*) FROM pms.Room
UNION ALL SELECT N'HotelSettings',COUNT_BIG(*) FROM pms.HotelSettings;
SELECT ar.Code AS RoleCode,p.Code AS PermissionCode FROM pms.AppRole ar
LEFT JOIN pms.RolePermission rp ON rp.RoleId=ar.RoleId LEFT JOIN pms.Permission p ON p.PermissionId=rp.PermissionId
WHERE ar.Code IN('admin','manager','receptionist','cashier','housekeeping') ORDER BY ar.Code,p.Code;
SELECT Entity,Operation,PermissionCode FROM pms.MutationRule WHERE Entity IN(N'AppUser',N'UserRole',N'PrincipalBinding');
SELECT name,type_desc FROM sys.database_principals
WHERE name IN(N'pms_executor',N'pms_web_auth_test',N'pms_web_auth_reader',N'pms_web_session_executor');
SELECT name,is_disabled FROM sys.server_principals WHERE name=N'DESKTOP-9EPI86K\songlam_pms_test';
SELECT name,CONVERT(nvarchar(128),value) AS Value FROM sys.extended_properties
WHERE class=0 AND name IN(N'SongLam.Environment',N'SongLam.TestIdentity');
