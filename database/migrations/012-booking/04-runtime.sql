CREATE PROCEDURE pms.usp_WebBookingRuntime
WITH EXECUTE AS OWNER AS
BEGIN
 SET NOCOUNT ON;
 IF ORIGINAL_LOGIN()<>N'DESKTOP-9EPI86K\songlam_pms_test' THROW 52403,'Dedicated service required.',1;
 SELECT DB_NAME() DatabaseName,CONVERT(nvarchar(128),SERVERPROPERTY('ServerName')) ServerName,CONVERT(varchar(36),database_guid) DatabaseGuid,
  (SELECT CONVERT(nvarchar(max),value) FROM sys.extended_properties WHERE class=0 AND name=N'SongLam.Booking012.Release') ReleaseJson
 FROM sys.database_recovery_status WHERE database_id=DB_ID();
 SELECT o.name Name,CONVERT(varchar(64),HASHBYTES('SHA2_256',m.definition),2) DefinitionSha256,m.uses_ansi_nulls AnsiNullsOn,m.uses_quoted_identifier QuotedIdentifierOn
 FROM sys.objects o JOIN sys.sql_modules m ON m.object_id=o.object_id WHERE o.schema_id=SCHEMA_ID('pms') AND o.name IN(
 'usp_AppPricingContext','usp_AppReferenceRead','usp_AppBookingRead','usp_AppBookingPrepare','usp_AppBookingCommit','usp_AppCustomerCreate','usp_WebReceiptLookup','usp_WebBookingRuntime',
 'usp_WebAuthorize','fn_WebPermission','fn_WebPricingContext','fn_WebQuotedAmounts','fn_WebInventoryUsage','fn_WebZeroDeposits','fn_WebBookingJson',
 'usp_AssertBusinessState','usp_AssertInventory','tr_Booking_CommandOnly','tr_BookingRoom_CommandOnly','tr_BookingNightRate_CommandOnly','tr_RoomAllocation_CommandOnly','tr_AuditLog_CommandOnly') ORDER BY o.name;
END;
GO
CREATE PROCEDURE pms.usp_WebReceiptLookup @AppUserId bigint,@Operation varchar(80),@IdempotencyKey varchar(120),@OriginalRequestId nvarchar(80),@RequestId nvarchar(80)
WITH EXECUTE AS OWNER AS
BEGIN
 SET NOCOUNT ON;
 EXEC pms.usp_WebAuthorize @AppUserId,'createBooking';
 IF @Operation NOT IN('customers.create','bookings.create','bookings.group') OR LEN(@IdempotencyKey) NOT BETWEEN 1 AND 120
 OR TRY_CONVERT(uniqueidentifier,@OriginalRequestId) IS NULL THROW 54100,'Invalid receipt lookup.',1;
 DECLARE @response nvarchar(max),@request uniqueidentifier,@status varchar(12),@release nvarchar(max),@committed bit=0;
 SELECT @response=ResponseJson,@request=RequestId,@status=Status FROM pms.ApiRequest
 WHERE ActorId=@AppUserId AND IdempotencyKey=@IdempotencyKey AND Operation=CASE WHEN @Operation='customers.create' THEN 'WEB_CUSTOMER_CREATE' ELSE 'WEB_BOOKING_CREATE' END;
 IF @status='SUCCEEDED' AND @request=TRY_CONVERT(uniqueidentifier,@OriginalRequestId) AND JSON_VALUE(@response,'$.httpOperation')=@Operation SET @committed=1;
 SELECT @release=CONVERT(nvarchar(max),value) FROM sys.extended_properties WHERE class=0 AND name=N'SongLam.Booking012.Release';
 SELECT (SELECT CASE WHEN @committed=1 THEN 'COMMITTED' ELSE 'UNKNOWN' END status,@Operation operation,@OriginalRequestId originalRequestId,
  CONVERT(varchar(20),@AppUserId) ownerAppUserId,LOWER(CONVERT(varchar(64),HASHBYTES('SHA2_256',@IdempotencyKey),2)) idempotencyKeySha256,
  CAST(1 AS bit) rightsRechecked,JSON_VALUE(@release,'$.deploymentId') deploymentId,
  CASE WHEN @committed=1 THEN CONVERT(varchar(36),@request) END receiptReference,
  CASE WHEN @committed=1 THEN JSON_VALUE(@response,'$.committedAtUtc') END committedAtUtc FOR JSON PATH,INCLUDE_NULL_VALUES,WITHOUT_ARRAY_WRAPPER) PayloadJson;
END;
