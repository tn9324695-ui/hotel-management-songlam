-- Procedure source only. Deploy through the guarded generated 006 artifact.
CREATE PROCEDURE pms.usp_SeedTestStaffBatch
 @BatchCode varchar(40),@AccountsJson nvarchar(max)
AS
BEGIN
 SET NOCOUNT ON;
 SET XACT_ABORT ON;
 IF DB_NAME()<>N'SongLamPms_Design' OR CONVERT(nvarchar(128),SERVERPROPERTY('ServerName'))<>N'DESKTOP-9EPI86K\SQLEXPRESS'
  THROW 53700,'Unexpected seed target.',1;
 IF ISNULL(IS_SRVROLEMEMBER(N'sysadmin'),0)<>1 AND ISNULL(IS_MEMBER(N'db_owner'),0)<>1
  THROW 53701,'Maintenance caller required; web caller forbidden.',1;
 IF NOT EXISTS(SELECT 1 FROM sys.extended_properties WHERE class=0 AND name=N'SongLam.Environment' AND CONVERT(nvarchar(128),value)=N'test')
  OR NOT EXISTS(SELECT 1 FROM sys.extended_properties WHERE class=0 AND name=N'SongLam.TestIdentity' AND CONVERT(nvarchar(128),value)=N'eb18c6f2-373d-4a83-a34f-d9809f1cbc7a')
  THROW 53702,'Verified D1 markers required.',1;
 IF @@TRANCOUNT<>0 THROW 53703,'Seed owns its transaction.',1;
 IF @BatchCode IS NULL OR DATALENGTH(@BatchCode)<>14 OR @BatchCode COLLATE Latin1_General_100_BIN2<>'B20261112_UI01'
  OR @AccountsJson IS NULL OR DATALENGTH(@AccountsJson)>32768 OR ISJSON(@AccountsJson)<>1 OR LEFT(LTRIM(@AccountsJson),1)<>N'['
  THROW 53704,'Invalid or unapproved seed batch.',1;
 IF (SELECT COUNT_BIG(*) FROM OPENJSON(@AccountsJson))<>5
  OR EXISTS(SELECT 1 FROM OPENJSON(@AccountsJson) WHERE type<>5)
  OR EXISTS(SELECT 1 FROM OPENJSON(@AccountsJson) a CROSS APPLY OPENJSON(a.value) p
     WHERE p.[key] COLLATE Latin1_General_100_BIN2 NOT IN(N'username',N'fullName',N'roleCode',N'passwordHash') OR p.type<>1)
  OR EXISTS(SELECT 1 FROM OPENJSON(@AccountsJson) a WHERE (SELECT COUNT_BIG(*) FROM OPENJSON(a.value))<>4)
  OR EXISTS(SELECT 1 FROM OPENJSON(@AccountsJson) a CROSS APPLY OPENJSON(a.value) p GROUP BY a.[key],p.[key] COLLATE Latin1_General_100_BIN2 HAVING COUNT_BIG(*)>1)
  THROW 53705,'Exactly five closed staff objects required.',1;
 DECLARE @Input TABLE(Username nvarchar(max),FullName nvarchar(max),RoleCode nvarchar(max),PasswordHash nvarchar(max));
 INSERT @Input SELECT Username,FullName,RoleCode,PasswordHash FROM OPENJSON(@AccountsJson)
 WITH(Username nvarchar(max) '$.username',FullName nvarchar(max) '$.fullName',RoleCode nvarchar(max) '$.roleCode',PasswordHash nvarchar(max) '$.passwordHash');
 IF EXISTS(SELECT 1 FROM @Input WHERE Username IS NULL OR FullName IS NULL OR RoleCode IS NULL OR PasswordHash IS NULL
  OR LEN(Username)>100 OR LEN(FullName) NOT BETWEEN 1 AND 160
  OR RoleCode COLLATE Latin1_General_100_BIN2 NOT IN(N'admin',N'manager',N'receptionist',N'cashier',N'housekeeping')
  OR Username COLLATE Latin1_General_100_BIN2<>CONCAT(N'SONGLAM_TEST_',@BatchCode,N'_',UPPER(RoleCode)) COLLATE Latin1_General_100_BIN2
  OR DATALENGTH(Username)<>DATALENGTH(CONCAT(N'SONGLAM_TEST_',@BatchCode,N'_',UPPER(RoleCode)))
  OR LEN(PasswordHash)<>91 OR LEFT(PasswordHash,25) COLLATE Latin1_General_100_BIN2<>N'$pbkdf2-sha256-v1$600000$'
  OR SUBSTRING(PasswordHash,48,1)<>N'$'
  OR SUBSTRING(PasswordHash,26,22) COLLATE Latin1_General_100_BIN2 LIKE N'%[^-A-Za-z0-9_]%'
  OR SUBSTRING(PasswordHash,49,43) COLLATE Latin1_General_100_BIN2 LIKE N'%[^-A-Za-z0-9_]%'
  OR SUBSTRING(PasswordHash,47,1) COLLATE Latin1_General_100_BIN2 NOT LIKE N'[AQgw]'
  OR SUBSTRING(PasswordHash,91,1) COLLATE Latin1_General_100_BIN2 NOT LIKE N'[AEIMQUYcgkosw048]')
  OR (SELECT COUNT_BIG(*) FROM (SELECT RoleCode COLLATE Latin1_General_100_BIN2 AS RoleCode FROM @Input GROUP BY RoleCode COLLATE Latin1_General_100_BIN2) x)<>5
  THROW 53706,'Invalid staff payload; no rows changed.',1;
 -- Never disable/adapt an existing CommandOnly trigger to make bootstrap work.
 IF EXISTS(SELECT 1 FROM sys.triggers WHERE parent_id IN(OBJECT_ID(N'pms.AppUser'),OBJECT_ID(N'pms.UserRole')) AND is_disabled=0)
  THROW 53707,'Identity triggers require separate contract review.',1;
 DECLARE @Created bit=0,@LockResult int;
 BEGIN TRY
  BEGIN TRANSACTION;
  EXEC @LockResult=sys.sp_getapplock @Resource=N'SongLam:TestStaff:B20261112_UI01',@LockMode=N'Exclusive',@LockOwner=N'Transaction',@LockTimeout=5000;
  IF @LockResult<0 THROW 53708,'Seed batch busy; retain the same batch and credentials.',1;
  IF (SELECT COUNT_BIG(*) FROM pms.AppRole WITH(UPDLOCK,HOLDLOCK) WHERE Code IN('admin','manager','receptionist','cashier','housekeeping') AND IsActive=1)<>5
   THROW 53709,'Required active roles missing.',1;
  DECLARE @Existing bigint;
  SELECT @Existing=COUNT_BIG(*) FROM pms.AppUser u WITH(UPDLOCK,HOLDLOCK) JOIN @Input i ON i.Username=u.Username;
  IF @Existing NOT IN(0,5) THROW 53710,'Partial/colliding batch; do not repair silently.',1;
  IF @Existing=5
  BEGIN
   IF EXISTS(SELECT 1 FROM @Input i JOIN pms.AppUser u WITH(UPDLOCK,HOLDLOCK) ON u.Username=i.Username
    WHERE u.Username COLLATE Latin1_General_100_BIN2<>i.Username COLLATE Latin1_General_100_BIN2
     OR u.FullName COLLATE Latin1_General_100_BIN2<>i.FullName COLLATE Latin1_General_100_BIN2
     OR u.PasswordHash IS NULL OR u.PasswordHash COLLATE Latin1_General_100_BIN2<>i.PasswordHash COLLATE Latin1_General_100_BIN2
     OR u.IsActive<>1 OR u.ExternalSubject IS NOT NULL OR u.Email IS NOT NULL
     OR (SELECT COUNT_BIG(*) FROM pms.UserRole ur WITH(UPDLOCK,HOLDLOCK) WHERE ur.UserId=u.UserId)<>1
     OR NOT EXISTS(SELECT 1 FROM pms.UserRole ur WITH(UPDLOCK,HOLDLOCK) JOIN pms.AppRole ar ON ar.RoleId=ur.RoleId WHERE ur.UserId=u.UserId AND ar.Code=i.RoleCode AND ar.IsActive=1))
    THROW 53711,'Existing batch differs; no password/account changes permitted.',1;
  END
  ELSE
  BEGIN
   INSERT pms.AppUser(Username,FullName,PasswordHash,IsActive)
    SELECT Username,FullName,CONVERT(varchar(512),PasswordHash),1 FROM @Input;
   INSERT pms.UserRole(UserId,RoleId)
    SELECT u.UserId,ar.RoleId FROM @Input i JOIN pms.AppUser u ON u.Username=i.Username JOIN pms.AppRole ar ON ar.Code=i.RoleCode AND ar.IsActive=1;
   SET @Created=1;
  END;
  COMMIT;
  SELECT @BatchCode AS BatchCode,CONVERT(varchar(20),u.UserId) AS UserId,u.Username,i.RoleCode,@Created AS Created
  FROM @Input i JOIN pms.AppUser u ON u.Username=i.Username ORDER BY i.RoleCode;
 END TRY
 BEGIN CATCH
  IF XACT_STATE()<>0 ROLLBACK;
  THROW;
 END CATCH;
END;
