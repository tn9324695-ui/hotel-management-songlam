-- Version 2, final part. No user/login is created and no production identity is auto-bound.
DECLARE @table sysname,@triggerSql nvarchar(max);
DECLARE guarded_tables CURSOR LOCAL FAST_FORWARD FOR SELECT name FROM sys.tables WHERE schema_id=SCHEMA_ID('pms') AND name IN
 ('Booking','BookingRoom','BookingGuest','BookingNightRate','RoomAllocation','Stay','StayGuest','StayRoomSegment',
  'ServiceOrder','ServiceOrderLine','Payment','RefundRequest','DepositAccount','DepositMovement','Folio','FolioEntry',
  'StaySettlement','Invoice','InvoiceLine','CashierShift','MinibarAudit','MinibarAuditLine','HousekeepingTask','AuditLog');
OPEN guarded_tables; FETCH NEXT FROM guarded_tables INTO @table;
WHILE @@FETCH_STATUS=0
BEGIN
 SET @triggerSql=N'CREATE OR ALTER TRIGGER pms.'+QUOTENAME('tr_'+@table+'_CommandOnly')+' ON pms.'+QUOTENAME(@table)+N' AFTER INSERT,UPDATE,DELETE AS
 BEGIN
  SET NOCOUNT ON;
  IF NOT EXISTS(SELECT 1 FROM pms.CommandExecution c JOIN pms.ApiRequest r ON r.RequestId=c.RequestId
    WHERE c.SessionId=@@SPID AND r.Status=''PROCESSING'')
    OR COALESCE(APPLOCK_MODE(''public'',''SongLam:Inventory'',''Transaction''),''NoLock'')<>''Exclusive''
    THROW 52500,''Business writes must use the validated command gateway.'',1;
 END;';
 EXEC sys.sp_executesql @triggerSql;
 FETCH NEXT FROM guarded_tables INTO @table;
END;
CLOSE guarded_tables; DEALLOCATE guarded_tables;
IF DATABASE_PRINCIPAL_ID('pms_executor') IS NULL CREATE ROLE pms_executor AUTHORIZATION dbo;
DENY SELECT,INSERT,UPDATE,DELETE,ALTER ON SCHEMA::pms TO pms_executor;
DENY EXECUTE ON OBJECT::pms.usp_ApplyCommand TO pms_executor;
DENY EXECUTE ON OBJECT::pms.usp_ReadResource TO pms_executor;
DENY EXECUTE ON OBJECT::pms.usp_AssertBusinessState TO pms_executor;
DENY EXECUTE ON OBJECT::pms.usp_AssertInventory TO pms_executor;
DENY EXECUTE ON OBJECT::pms.usp_LockInventory TO pms_executor;
DENY IMPERSONATE ON USER::dbo TO pms_executor;
GRANT EXECUTE ON OBJECT::pms.usp_ExecuteCommand TO pms_executor;
GRANT EXECUTE ON OBJECT::pms.usp_Query TO pms_executor;
-- Refuse to adopt inconsistent pre-existing data; never fabricate repair transactions.
EXEC pms.usp_AssertBusinessState;
INSERT pms.SchemaVersion(Version) VALUES(2);
COMMIT;
GO
