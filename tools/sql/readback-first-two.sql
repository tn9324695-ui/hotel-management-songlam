-- Verification only. No password hash values, business rows, DDL or DML.
SET NOCOUNT ON;
IF DB_NAME()<>N'SongLamPms_Design' OR CONVERT(nvarchar(128),SERVERPROPERTY('ServerName'))<>N'DESKTOP-9EPI86K\SQLEXPRESS'
 THROW 53040,'Unexpected verification target.',1;
SELECT CONVERT(nvarchar(128),SERVERPROPERTY('ServerName')) AS serverIdentity,
 DB_NAME() AS databaseName,CONVERT(varchar(36),r.database_guid) AS databaseGuid,
 d.user_access_desc AS accessMode,d.state_desc AS databaseState,SYSUTCDATETIME() AS observedAtUtc,
 (SELECT COUNT_BIG(*) FROM pms.AppUser) AS appUserCount,
 (SELECT COUNT_BIG(*) FROM pms.UserRole) AS userRoleCount,
 (SELECT COUNT_BIG(*) FROM pms.PrincipalBinding) AS principalBindingCount,
 (SELECT COUNT_BIG(*) FROM sys.tables WHERE schema_id=SCHEMA_ID(N'pms') AND name=N'WebSession') AS sessionTableCount,
 (SELECT COUNT_BIG(*) FROM sys.database_role_members WHERE role_principal_id=DATABASE_PRINCIPAL_ID(N'pms_web_auth_reader')) AS authRoleMembers,
 JSON_QUERY((SELECT name,CONVERT(nvarchar(128),value) AS value FROM sys.extended_properties
  WHERE class=0 AND name IN(N'SongLam.Environment',N'SongLam.TestIdentity') ORDER BY name FOR JSON PATH)) AS markers,
 JSON_QUERY((SELECT p.name,
   CONVERT(varchar(64),HASHBYTES('SHA2_256',REPLACE(m.definition,CHAR(13),N'')),2) AS normalizedSha256,
   (SELECT COUNT_BIG(*) FROM sys.parameters pa WHERE pa.object_id=p.object_id AND pa.parameter_id>0) AS parameterCount
  FROM sys.procedures p JOIN sys.sql_modules m ON m.object_id=p.object_id
  WHERE p.schema_id=SCHEMA_ID(N'pms') AND p.name IN(N'usp_AppEnvironment',N'usp_AppAuthLookup',N'usp_AppIdentity')
  ORDER BY p.name FOR JSON PATH)) AS procedures,
 JSON_QUERY((SELECT dp.class_desc AS scope,dp.state_desc AS state,dp.permission_name AS permission,
   OBJECT_SCHEMA_NAME(dp.major_id) AS schemaName,OBJECT_NAME(dp.major_id) AS objectName
  FROM sys.database_permissions dp WHERE dp.grantee_principal_id=DATABASE_PRINCIPAL_ID(N'pms_web_auth_reader')
  ORDER BY objectName FOR JSON PATH)) AS grants,
 JSON_QUERY((SELECT CONVERT(varchar(36),bs.backup_set_uuid) AS backupSetUuid,bs.database_name AS databaseName,
   CONVERT(varchar(36),bs.database_guid) AS databaseGuid,bs.is_copy_only AS copyOnly,bs.has_backup_checksums AS checksums,bs.position,
   CONVERT(varchar(33),bs.backup_finish_date,126) AS finishedAtServerLocal,mf.physical_device_name AS backupPath
  FROM msdb.dbo.backupset bs JOIN msdb.dbo.backupmediafamily mf ON mf.media_set_id=bs.media_set_id
  WHERE bs.backup_set_uuid='50C40A72-2373-40B5-805D-6D249ACA9CA0'
  FOR JSON PATH,WITHOUT_ARRAY_WRAPPER)) AS [backup]
FROM sys.database_recovery_status r JOIN sys.databases d ON d.database_id=r.database_id
WHERE r.database_id=DB_ID() FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;
