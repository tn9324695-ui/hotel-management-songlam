-- Version 2, part 3. Private implementation; never grant EXECUTE on this procedure.
CREATE OR ALTER PROCEDURE pms.usp_ApplyCommand
 @ActorId bigint,@Operation varchar(40),@IdempotencyKey varchar(120),@Changes nvarchar(max)
WITH EXECUTE AS OWNER
AS
BEGIN
 SET NOCOUNT ON; SET XACT_ABORT ON;
 SET ANSI_NULLS ON; SET ANSI_WARNINGS ON; SET ARITHABORT ON;
 SET CONCAT_NULL_YIELDS_NULL ON; SET NUMERIC_ROUNDABORT OFF;
 SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
 IF @@TRANCOUNT<>0 THROW 52400,'Commands own their transaction; ambient transactions are not accepted.',1;
 IF ISJSON(@Changes)<>1 OR LEFT(LTRIM(@Changes),1)<>'[' OR DATALENGTH(@Changes)>4000000
   OR NULLIF(LTRIM(RTRIM(@IdempotencyKey)),'') IS NULL THROW 52401,'Invalid command payload or idempotency key.',1;
 DECLARE @request uniqueidentifier,@hash binary(32)=HASHBYTES('SHA2_256',@Changes),@response nvarchar(max),@savedHash binary(32),
   @day date,@now datetime2(3)=SYSUTCDATETIME();
 DECLARE @refs TABLE(Name nvarchar(80) PRIMARY KEY,Id bigint NOT NULL);
 DECLARE @items TABLE(Ordinal int PRIMARY KEY,Item nvarchar(max));
 INSERT @items SELECT CONVERT(int,[key]),value FROM OPENJSON(@Changes);
 IF (SELECT COUNT(*) FROM @items) NOT BETWEEN 1 AND 500 THROW 52401,'A command must contain 1..500 changes.',1;
 CREATE TABLE #Touched(Entity sysname,KeyJson nvarchar(max),BeforeJson nvarchar(max),AfterJson nvarchar(max));
 BEGIN TRY
  BEGIN TRANSACTION;
  EXEC pms.usp_LockInventory;
  IF NOT EXISTS(SELECT 1 FROM pms.AppUser WHERE UserId=@ActorId AND IsActive=1) THROW 52402,'Inactive or unknown actor.',1;
  -- Check permissions even on replays; a revoked user cannot replay privileged responses.
  IF EXISTS(SELECT 1 FROM @items i OUTER APPLY(SELECT * FROM pms.MutationRule r
      WHERE r.Operation=@Operation AND r.Entity=JSON_VALUE(i.Item,'$.entity') AND r.Verb=JSON_VALUE(i.Item,'$.verb')) r
      WHERE r.Entity IS NULL OR NOT EXISTS(SELECT 1 FROM pms.UserRole ur JOIN pms.AppRole ar ON ar.RoleId=ur.RoleId
        JOIN pms.RolePermission rp ON rp.RoleId=ur.RoleId JOIN pms.Permission p ON p.PermissionId=rp.PermissionId
        WHERE ur.UserId=@ActorId AND ar.IsActive=1 AND p.Code=r.PermissionCode))
    THROW 52403,'Operation/entity is not allowed or the actor lacks permission.',1;
  SELECT @request=RequestId,@savedHash=RequestHash,@response=ResponseJson FROM pms.ApiRequest
    WHERE ActorId=@ActorId AND Operation=@Operation AND IdempotencyKey=@IdempotencyKey;
  IF @request IS NOT NULL
  BEGIN
    IF @hash<>@savedHash THROW 52404,'Idempotency key was already used for a different payload.',1;
    IF @response IS NULL THROW 52405,'Prior command is not complete.',1;
    COMMIT; SELECT @response AS ResultJson; RETURN;
  END;
  SELECT @day=h.WorkingDate FROM pms.HotelSettings h JOIN pms.BusinessDay d ON d.BusinessDate=h.WorkingDate AND d.Status='OPEN';
  IF @day IS NULL THROW 52406,'Hotel and open business day must be initialized by the DBA.',1;
  SET @request=NEWID();
  INSERT pms.ApiRequest(RequestId,ActorId,Operation,IdempotencyKey,RequestHash,Status)
    VALUES(@request,@ActorId,@Operation,@IdempotencyKey,@hash,'PROCESSING');
  INSERT pms.CommandExecution(SessionId,RequestId) VALUES(@@SPID,@request);

  DECLARE @i int=0,@last int=(SELECT MAX(Ordinal) FROM @items),@item nvarchar(max),@entity sysname,@verb varchar(6),
    @data nvarchar(max),@key nvarchar(max),@ref nvarchar(80),@allowed nvarchar(2000),@object int,
    @sql nvarchar(max),@cols nvarchar(max),@values nvarchar(max),@sets nvarchar(max),@where nvarchar(max),
    @before nvarchar(max),@after nvarchar(max),@newId bigint,@count int,@version binary(8),@hasVersion bit,
    @oldStatus varchar(30),@newStatus varchar(30),@field sysname,@value nvarchar(max),@resolved bigint;
  DECLARE @canPrice bit=CASE WHEN EXISTS(SELECT 1 FROM pms.UserRole ur JOIN pms.AppRole ar ON ar.RoleId=ur.RoleId
    JOIN pms.RolePermission rp ON rp.RoleId=ur.RoleId JOIN pms.Permission p ON p.PermissionId=rp.PermissionId
    WHERE ur.UserId=@ActorId AND ar.IsActive=1 AND p.Code='editRoomClasses') THEN 1 ELSE 0 END;
  DECLARE @fields TABLE(Name sysname PRIMARY KEY,SqlType nvarchar(100),IsPk bit,IsIdentity bit,IsComputed bit,IsRowVersion bit);
  WHILE @i<=@last
  BEGIN
    SELECT @item=Item FROM @items WHERE Ordinal=@i;
    SELECT @entity=JSON_VALUE(@item,'$.entity'),@verb=JSON_VALUE(@item,'$.verb'),@data=COALESCE(JSON_QUERY(@item,'$.values'),N'{}'),
      @key=COALESCE(JSON_QUERY(@item,'$.key'),N'{}'),@ref=JSON_VALUE(@item,'$.ref'),@before=NULL,@after=NULL,@newId=NULL;
    SELECT @allowed=AllowedColumns FROM pms.MutationRule WHERE Operation=@Operation AND Entity=@entity AND Verb=@verb;
    IF LEFT(LTRIM(@data),1)<>'{' OR LEFT(LTRIM(@key),1)<>'{' OR EXISTS(SELECT [key] FROM OPENJSON(@data) GROUP BY [key] HAVING COUNT(*)>1)
      OR EXISTS(SELECT [key] FROM OPENJSON(@key) GROUP BY [key] HAVING COUNT(*)>1)
      THROW 52407,'Values and key must be objects without duplicate keys.',1;
    IF EXISTS(SELECT 1 FROM OPENJSON(@data) j WHERE NOT EXISTS(SELECT 1 FROM STRING_SPLIT(@allowed,',') a WHERE a.value COLLATE Latin1_General_BIN2=j.[key]))
      THROW 52408,'Column is not writable for this operation.',1;
    SET @object=OBJECT_ID(N'pms.'+QUOTENAME(@entity));
    DELETE @fields;
    INSERT @fields
    SELECT c.name,
      QUOTENAME(t.name)+CASE WHEN t.name IN ('nvarchar','nchar') THEN '('+CASE WHEN c.max_length=-1 THEN 'max' ELSE CONVERT(varchar(10),c.max_length/2) END+')'
        WHEN t.name IN ('varchar','char','varbinary','binary') THEN '('+CASE WHEN c.max_length=-1 THEN 'max' ELSE CONVERT(varchar(10),c.max_length) END+')'
        WHEN t.name IN ('decimal','numeric') THEN '('+CONVERT(varchar(10),c.precision)+','+CONVERT(varchar(10),c.scale)+')'
        WHEN t.name IN ('datetime2','time') THEN '('+CONVERT(varchar(10),c.scale)+')' ELSE '' END,
      CASE WHEN EXISTS(SELECT 1 FROM sys.index_columns ic JOIN sys.indexes ix ON ix.object_id=ic.object_id AND ix.index_id=ic.index_id
        WHERE ix.is_primary_key=1 AND ic.object_id=c.object_id AND ic.column_id=c.column_id) THEN 1 ELSE 0 END,
      c.is_identity,c.is_computed,CASE WHEN t.name='timestamp' THEN 1 ELSE 0 END
    FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=@object;
    -- Resolve only numeric FK references to earlier inserts in this same command.
    WHILE EXISTS(SELECT 1 FROM OPENJSON(@data) j JOIN @fields f ON f.Name COLLATE Latin1_General_BIN2=j.[key]
        WHERE j.type=1 AND LEFT(j.value,1)='$' AND f.SqlType IN ('[bigint]','[int]'))
    BEGIN
      SELECT TOP(1) @field=j.[key],@value=SUBSTRING(j.value,2,80) FROM OPENJSON(@data) j JOIN @fields f ON f.Name COLLATE Latin1_General_BIN2=j.[key]
        WHERE j.type=1 AND LEFT(j.value,1)='$' AND f.SqlType IN ('[bigint]','[int]');
      SET @resolved=NULL; SELECT @resolved=Id FROM @refs WHERE Name=@value;
      IF @resolved IS NULL THROW 52409,'Unknown or forward insert reference.',1;
      SET @data=JSON_MODIFY(@data,'$.'+@field,@resolved);
    END;
    WHILE EXISTS(SELECT 1 FROM OPENJSON(@key) WHERE type=1 AND LEFT(value,1)='$')
    BEGIN
      SELECT TOP(1) @field=[key],@value=SUBSTRING(value,2,80) FROM OPENJSON(@key) WHERE type=1 AND LEFT(value,1)='$';
      SET @resolved=NULL; SELECT @resolved=Id FROM @refs WHERE Name=@value;
      IF @resolved IS NULL THROW 52409,'Unknown key reference.',1;
      SET @key=JSON_MODIFY(@key,'$.'+@field,@resolved);
    END;
    SET @hasVersion=CASE WHEN EXISTS(SELECT 1 FROM @fields WHERE IsRowVersion=1) THEN 1 ELSE 0 END;
    IF @verb<>'insert'
    BEGIN
      IF EXISTS(SELECT 1 FROM OPENJSON(@key) j WHERE NOT EXISTS(SELECT 1 FROM @fields f WHERE f.Name COLLATE Latin1_General_BIN2=j.[key] AND f.IsPk=1))
        OR (SELECT COUNT(*) FROM OPENJSON(@key))<>(SELECT COUNT(*) FROM @fields WHERE IsPk=1)
        THROW 52410,'Supply exactly the complete primary key.',1;
      SELECT @where=STRING_AGG(CONVERT(nvarchar(max),QUOTENAME(Name)+'=CONVERT('+SqlType+',(SELECT value FROM OPENJSON(@key) WHERE [key]=N'''+Name+'''))'),' AND ') FROM @fields WHERE IsPk=1;
      SET @version=NULL;
      IF @hasVersion=1
      BEGIN
        SET @version=TRY_CONVERT(binary(8),JSON_VALUE(@item,'$.version'),1);
        IF @version IS NULL OR LEN(JSON_VALUE(@item,'$.version'))<>18 THROW 52411,'Updates require the exact 0x rowversion from the last read.',1;
        SET @where+=N' AND RowVer=@version';
      END;
      SET @sql=N'SELECT @before=(SELECT * FROM pms.'+QUOTENAME(@entity)+' WHERE '+@where+' FOR JSON PATH,INCLUDE_NULL_VALUES,WITHOUT_ARRAY_WRAPPER);';
      EXEC sys.sp_executesql @sql,N'@key nvarchar(max),@version binary(8),@before nvarchar(max) OUTPUT',@key,@version,@before OUTPUT;
      IF @before IS NULL THROW 52412,'Record missing or changed by another user.',1;
      SET @oldStatus=JSON_VALUE(@before,'$.Status'); SET @newStatus=JSON_VALUE(@data,'$.Status');
      IF @newStatus IS NOT NULL AND @newStatus<>@oldStatus AND NOT EXISTS(SELECT 1 FROM pms.StatusTransition
        WHERE Entity=@entity AND FromStatus=@oldStatus AND ToStatus=@newStatus)
        THROW 52413,'Invalid status transition.',1;
      IF (@entity IN ('Payment','Stay','BookingRoom','Invoice','BusinessDay','Folio','MinibarAudit','HousekeepingTask','LostFound','ExceptionCase')
        AND @oldStatus IN ('SUCCEEDED','FAILED','CANCELLED','CHECKED_OUT','ISSUED','CLOSED','COMPLETED','NO_SHOW','CONFIRMED','RETURNED','DISPOSED','RESOLVED','REJECTED')
        AND NOT (@entity='BookingRoom' AND @oldStatus='CONFIRMED'))
        OR (@entity='CashierShift' AND JSON_VALUE(@before,'$.ClosedAtUtc') IS NOT NULL)
        OR (@entity='StayRoomSegment' AND JSON_VALUE(@before,'$.DepartedAtUtc') IS NOT NULL)
        THROW 52414,'Finalized record cannot be changed.',1;
    END;

    -- Fixed command semantics, in addition to permissions and the final invariant scan.
    IF @entity='BookingRoom' AND @verb='insert' AND NOT EXISTS(SELECT 1 FROM pms.RatePlan
      WHERE RatePlanId=TRY_CONVERT(int,JSON_VALUE(@data,'$.RatePlanId')) AND IsActive=1)
      THROW 52431,'A new booking requires an active rate plan.',1;
    IF @entity='BookingNightRate' AND @verb<>'delete'
    BEGIN
      DECLARE @night date=CONVERT(date,COALESCE(JSON_VALUE(@data,'$.NightDate'),JSON_VALUE(@key,'$.NightDate'))),@nightPrice decimal(19,0)=NULL;
      SELECT TOP(1) @nightPrice=r.PriceVnd FROM pms.BookingRoom b JOIN pms.RateRule r ON r.RoomTypeId=b.RoomTypeId AND r.RatePlanId=b.RatePlanId
       WHERE b.BookingRoomId=CONVERT(bigint,COALESCE(JSON_VALUE(@data,'$.BookingRoomId'),JSON_VALUE(@key,'$.BookingRoomId')))
       AND r.ValidFrom<=@night AND r.ValidTo>@night AND (r.DayKind<>'WEEKEND' OR DATEDIFF(day,'19000107',@night)%7 IN (0,5,6))
       ORDER BY r.Priority DESC,CASE r.DayKind WHEN 'SPECIFIC' THEN 3 WHEN 'HOLIDAY' THEN 2 WHEN 'WEEKEND' THEN 1 ELSE 0 END DESC;
      IF @nightPrice IS NULL THROW 52431,'No published rate covers this night.',1;
      IF CONVERT(decimal(19,0),JSON_VALUE(@data,'$.PriceVnd'))<>@nightPrice AND
        (@canPrice=0 OR NULLIF(LTRIM(RTRIM(JSON_VALUE(@data,'$.RateReason'))),'') IS NULL)
        THROW 52432,'A rate override requires pricing permission and an explicit reason.',1;
    END;
    IF @entity='BookingRoom' AND COALESCE(JSON_VALUE(@data,'$.StayType'),JSON_VALUE(@before,'$.StayType'))='HOURLY'
      AND (@verb='insert' OR EXISTS(SELECT 1 FROM OPENJSON(@data) WHERE [key]='RateSnapshotJson'))
    BEGIN
      DECLARE @hourlyJson nvarchar(max)=COALESCE(JSON_QUERY(@data,'$.RateSnapshotJson'),JSON_VALUE(@data,'$.RateSnapshotJson')),
        @hourRateId bigint=NULL,@hourIncluded int,@hourExtra int,@hourBase decimal(19,0),@hourPrice decimal(19,0);
      SELECT TOP(1) @hourRateId=RateRuleId,@hourIncluded=IncludedMinutes,@hourExtra=ExtraBlockMinutes,@hourBase=PriceVnd,@hourPrice=ExtraBlockPriceVnd
       FROM pms.RateRule WHERE RatePlanId=CONVERT(int,COALESCE(JSON_VALUE(@data,'$.RatePlanId'),JSON_VALUE(@before,'$.RatePlanId')))
       AND RoomTypeId=CONVERT(int,COALESCE(JSON_VALUE(@data,'$.RoomTypeId'),JSON_VALUE(@before,'$.RoomTypeId')))
       AND ValidFrom<=CONVERT(date,COALESCE(JSON_VALUE(@data,'$.ArrivalDate'),JSON_VALUE(@before,'$.ArrivalDate')))
       AND ValidTo>CONVERT(date,COALESCE(JSON_VALUE(@data,'$.ArrivalDate'),JSON_VALUE(@before,'$.ArrivalDate')))
       ORDER BY Priority DESC,RateRuleId DESC;
      IF @hourRateId IS NULL OR @hourIncluded IS NULL OR @hourExtra IS NULL OR @hourPrice IS NULL THROW 52431,'Published hourly rate is incomplete.',1;
      IF (TRY_CONVERT(int,JSON_VALUE(@hourlyJson,'$.includedMinutes'))<>@hourIncluded OR TRY_CONVERT(int,JSON_VALUE(@hourlyJson,'$.extraMinutes'))<>@hourExtra
        OR TRY_CONVERT(decimal(19,0),JSON_VALUE(@hourlyJson,'$.baseVnd'))<>@hourBase OR TRY_CONVERT(decimal(19,0),JSON_VALUE(@hourlyJson,'$.extraVnd'))<>@hourPrice)
        AND (@canPrice=0 OR NULLIF(JSON_VALUE(@hourlyJson,'$.overrideReason'),'') IS NULL) THROW 52432,'Hourly override requires pricing permission and reason.',1;
    END;
    IF @entity='Booking' AND JSON_VALUE(@data,'$.Status') NOT IN ('PENDING','CONFIRMED') THROW 52415,'New booking status must be pending/confirmed.',1;
    IF @entity='BookingRoom' AND ((@verb='insert' AND JSON_VALUE(@data,'$.Status') NOT IN ('HELD','CONFIRMED'))
      OR (@Operation='CHECK_IN' AND ISNULL(JSON_VALUE(@data,'$.Status'),'')<>'IN_HOUSE')
      OR (@Operation='CHECK_OUT' AND ISNULL(JSON_VALUE(@data,'$.Status'),'')<>'COMPLETED')
      OR (@Operation='CANCEL_BOOKING' AND ISNULL(JSON_VALUE(@data,'$.Status'),'')<>'CANCELLED'))
      THROW 52415,'Booking-room status does not match the command.',1;
    IF @entity='Stay' AND ((@verb='insert' AND ISNULL(JSON_VALUE(@data,'$.Status'),'')<>'IN_HOUSE')
      OR (@Operation='CHECK_OUT' AND ISNULL(JSON_VALUE(@data,'$.Status'),'')<>'CHECKED_OUT')) THROW 52415,'Stay status does not match command.',1;
    IF @verb='insert' AND @entity IN ('HousekeepingTask','MaintenanceTicket','LostFound','ExceptionCase','Invoice')
      AND ISNULL(JSON_VALUE(@data,'$.Status'),'')<>CASE @entity WHEN 'HousekeepingTask' THEN 'PENDING'
        WHEN 'LostFound' THEN 'STORED' WHEN 'Invoice' THEN 'DRAFT' ELSE 'OPEN' END
      THROW 52415,'New records must start in their initial workflow state.',1;
    IF @entity='RoomAllocation' AND ((@Operation='BLOCK_ROOM' AND JSON_VALUE(COALESCE(@before,@data),'$.BookingRoomId') IS NOT NULL)
      OR (@Operation<>'BLOCK_ROOM' AND JSON_VALUE(COALESCE(@before,@data),'$.BookingRoomId') IS NULL))
      THROW 52415,'Room assignment and maintenance block commands are distinct.',1;
    IF @entity='BookingNightRate' AND EXISTS(SELECT 1 FROM pms.BookingRoom
      WHERE BookingRoomId=TRY_CONVERT(bigint,COALESCE(JSON_VALUE(@data,'$.BookingRoomId'),JSON_VALUE(@key,'$.BookingRoomId')))
      AND Status IN ('COMPLETED','CANCELLED','NO_SHOW')) THROW 52414,'Finalized price snapshots cannot be changed.',1;
    IF @entity='RoomAllocation' AND EXISTS(SELECT 1 FROM pms.BookingRoom
      WHERE BookingRoomId=TRY_CONVERT(bigint,JSON_VALUE(COALESCE(@before,@data),'$.BookingRoomId')) AND Status='COMPLETED')
      THROW 52414,'Finalized room allocation cannot be changed.',1;
    IF @entity='StayRoomSegment' AND @verb='insert'
    BEGIN
      IF NOT EXISTS(SELECT 1 FROM pms.Room r WHERE r.RoomId=TRY_CONVERT(int,JSON_VALUE(@data,'$.RoomId')) AND r.IsActive=1 AND r.CleanStatus='CLEAN')
        THROW 52416,'Check-in/transfer requires a clean active room.',1;
      IF EXISTS(SELECT 1 FROM pms.RoomAllocation a WHERE a.RoomId=TRY_CONVERT(int,JSON_VALUE(@data,'$.RoomId'))
        AND a.BookingRoomId IS NULL AND a.IsCancelled=0 AND a.StartsAtUtc<=CONVERT(datetime2,JSON_VALUE(@data,'$.ArrivedAtUtc'))
        AND a.EndsAtUtc>CONVERT(datetime2,JSON_VALUE(@data,'$.ArrivedAtUtc')))
        THROW 52416,'Cannot enter a room under maintenance.',1;
    END;
    IF @entity='FolioEntry'
    BEGIN
      DECLARE @kind varchar(20)=JSON_VALUE(@data,'$.Kind'),@category varchar(20)=JSON_VALUE(@data,'$.Category');
      IF @Operation IN ('CHECK_IN','CHANGE_STAY','SERVICE','MINIBAR','CANCEL_SERVICE') AND JSON_VALUE(@data,'$.StayId') IS NULL
        THROW 52418,'Operational charges require the actual stay.',1;
      IF @Operation IN ('SERVICE','MINIBAR') AND JSON_VALUE(@data,'$.ServiceOrderLineId') IS NULL
        THROW 52418,'Service charges require a delivered service line.',1;
      IF NOT EXISTS(SELECT 1 FROM pms.Folio WHERE FolioId=TRY_CONVERT(bigint,JSON_VALUE(@data,'$.FolioId')) AND Status='OPEN')
        THROW 52417,'Cannot post to a closed or missing folio.',1;
      IF (@Operation='COLLECT' AND @kind<>'PAYMENT') OR (@Operation='COMPLETE_REFUND' AND @kind<>'REFUND')
        OR (@Operation='APPLY_DEPOSIT' AND @kind NOT IN ('DEPOSIT_APPLY','DEPOSIT_UNAPPLY'))
        OR (@Operation='TRANSFER_FOLIO' AND @kind NOT IN ('TRANSFER_DEBIT','TRANSFER_CREDIT'))
        OR (@Operation IN ('CHECK_IN','CHANGE_STAY') AND (@kind NOT IN ('CHARGE','CHARGE_CREDIT') OR @category<>'ROOM'))
        OR (@Operation IN ('SERVICE','MINIBAR') AND (@kind<>'CHARGE' OR @category<>'SERVICE'))
        OR (@Operation='CANCEL_SERVICE' AND (@kind<>'CHARGE_CREDIT' OR @category<>'SERVICE'))
        OR (@Operation='ADJUST_CHARGE' AND @kind NOT IN ('CHARGE','CHARGE_CREDIT'))
        THROW 52418,'Ledger entry kind does not match the operation.',1;
      IF @kind='TRANSFER_CREDIT' AND CONVERT(decimal(19,0),JSON_VALUE(@data,'$.AmountVnd'))>
        (SELECT BalanceVnd FROM pms.vFolioBalance WHERE FolioId=CONVERT(bigint,JSON_VALUE(@data,'$.FolioId')))
        THROW 52419,'Cannot transfer more debt than the source folio owes.',1;
      IF JSON_VALUE(@data,'$.StayId') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM pms.Stay WHERE StayId=CONVERT(bigint,JSON_VALUE(@data,'$.StayId')) AND Status='IN_HOUSE')
        THROW 52420,'Stay charges are frozen after checkout.',1;
    END;
    IF @entity='DepositMovement' AND ((@Operation='COLLECT' AND ISNULL(JSON_VALUE(@data,'$.Kind'),'')<>'RECEIVE')
      OR (@Operation='COMPLETE_REFUND' AND ISNULL(JSON_VALUE(@data,'$.Kind'),'')<>'REFUND')
      OR (@Operation='APPLY_DEPOSIT' AND ISNULL(JSON_VALUE(@data,'$.Kind'),'') NOT IN ('APPLY','UNAPPLY')))
      THROW 52418,'Deposit movement kind does not match the operation.',1;
    IF @entity='Payment' AND @verb='insert'
    BEGIN
      IF (@Operation='COLLECT' AND ISNULL(JSON_VALUE(@data,'$.Direction'),'')<>'IN')
        OR (@Operation='COMPLETE_REFUND' AND ISNULL(JSON_VALUE(@data,'$.Direction'),'')<>'OUT')
        THROW 52418,'Payment direction does not match command.',1;
      IF JSON_VALUE(@data,'$.Method')<>'CASH' AND JSON_VALUE(@data,'$.Status')<>'PENDING'
        THROW 52421,'External payment completion requires a verified integration; it is not enabled here.',1;
      IF JSON_VALUE(@data,'$.Method')='CASH'
      BEGIN
        IF ISNULL(JSON_VALUE(@data,'$.Status'),'')<>'SUCCEEDED' THROW 52421,'Cash receipt/payout is completed atomically.',1;
        IF NOT EXISTS(SELECT 1 FROM pms.CashierShift WHERE ShiftId=TRY_CONVERT(bigint,JSON_VALUE(@data,'$.ShiftId'))
           AND CashierId=@ActorId AND BusinessDate=@day AND ClosedAtUtc IS NULL) THROW 52422,'An open shift owned by this cashier is required.',1;
        SET @data=JSON_MODIFY(@data,'$.SucceededAtUtc',CONVERT(varchar(30),@now,126));
      END;
      SET @data=JSON_MODIFY(@data,'$.RequestId',CONVERT(varchar(36),@request));
    END;
    IF @Operation='CANCEL_PAYMENT' AND (@oldStatus<>'PENDING' OR ISNULL(JSON_VALUE(@data,'$.Status'),'')<>'CANCELLED')
      THROW 52421,'Only pending external payments may be cancelled.',1;
    IF @entity='RefundRequest'
    BEGIN
      IF @Operation='REQUEST_REFUND' AND ISNULL(JSON_VALUE(@data,'$.Status'),'')<>'PENDING' THROW 52423,'New refund requires approval.',1;
      IF @Operation='APPROVE_REFUND' AND ISNULL(JSON_VALUE(@data,'$.Status'),'') NOT IN ('APPROVED','REJECTED','CANCELLED') THROW 52423,'Invalid approval decision.',1;
      IF @Operation='COMPLETE_REFUND' AND (@oldStatus<>'APPROVED' OR ISNULL(JSON_VALUE(@data,'$.Status'),'')<>'COMPLETED') THROW 52423,'Only an approved refund may be completed.',1;
      IF JSON_VALUE(@data,'$.Status')='APPROVED'
      BEGIN
        SET @data=JSON_MODIFY(@data,'$.ApprovedBy',@ActorId);
        SET @data=JSON_MODIFY(@data,'$.ApprovedAtUtc',CONVERT(varchar(30),@now,126));
      END;
    END;
    IF @entity='Invoice' AND @verb='insert' AND JSON_VALUE(@data,'$.DocumentKind')<>'RECEIPT'
      THROW 52424,'Only internal receipts are enabled; electronic invoicing requires provider integration.',1;
    IF @entity='InvoiceLine' AND EXISTS(SELECT 1 FROM pms.Invoice WHERE InvoiceId=TRY_CONVERT(bigint,JSON_VALUE(@data,'$.InvoiceId')) AND Status='ISSUED')
      THROW 52424,'Add invoice lines before issuing the document.',1;
    IF @entity='CashierShift' AND @verb='update' AND CONVERT(bigint,JSON_VALUE(@before,'$.CashierId'))<>@ActorId
      THROW 52425,'Cashier can only close their own shift.',1;
    IF @entity='BusinessDay'
    BEGIN
      IF @verb='update' AND (CONVERT(date,JSON_VALUE(@before,'$.BusinessDate'))<>@day OR ISNULL(JSON_VALUE(@data,'$.Status'),'')<>'CLOSED')
        THROW 52426,'Close exactly the expected current business day.',1;
      IF @verb='insert' AND CONVERT(date,JSON_VALUE(@data,'$.BusinessDate'))<>DATEADD(day,1,@day)
        THROW 52426,'Next business day must be exactly one day later.',1;
    END;
    IF @entity='HotelSettings' AND CONVERT(date,JSON_VALUE(@data,'$.WorkingDate'))<>DATEADD(day,1,@day)
      THROW 52426,'Working date cannot skip days.',1;
    IF @entity IN ('ServiceOrder','MinibarAudit') AND @verb='insert' AND NOT EXISTS(SELECT 1 FROM pms.Stay
      WHERE StayId=TRY_CONVERT(bigint,JSON_VALUE(@data,'$.StayId')) AND Status='IN_HOUSE') THROW 52420,'Stay is not in house.',1;
    IF @entity='ServiceOrderLine' AND @verb='insert' AND NOT EXISTS(SELECT 1 FROM pms.ServiceOrder o JOIN pms.Stay s ON s.StayId=o.StayId
      WHERE o.ServiceOrderId=TRY_CONVERT(bigint,JSON_VALUE(@data,'$.ServiceOrderId')) AND s.Status='IN_HOUSE' AND o.Status<>'CANCELLED') THROW 52420,'Service stay is closed.',1;
    IF @entity='ServiceOrderLine' AND NOT EXISTS(SELECT 1 FROM pms.Service WHERE ServiceId=TRY_CONVERT(int,JSON_VALUE(@data,'$.ServiceId'))
      AND IsActive=1 AND PriceVnd=TRY_CONVERT(decimal(19,0),JSON_VALUE(@data,'$.UnitPriceVnd'))
      AND (@Operation<>'MINIBAR' OR Category='MINIBAR')) THROW 52420,'Service must be active and use its current unit price.',1;
    IF @entity='ServiceOrder' AND JSON_VALUE(@data,'$.Status')='CANCELLED' AND NULLIF(LTRIM(RTRIM(JSON_VALUE(@data,'$.CancellationReason'))),'') IS NULL
      THROW 52420,'Cancellation requires a reason and matching financial credit.',1;
    IF @entity='Room' AND @Operation='CLEANING' AND JSON_VALUE(@data,'$.CleanStatus')='CLEAN' AND JSON_VALUE(@before,'$.CleanStatus')<>'INSPECTING'
      THROW 52427,'Room must pass inspection before becoming clean.',1;

    -- Attribution is set by the trusted module, never supplied by the caller.
    IF @verb='insert'
    BEGIN
      DECLARE actor_fields CURSOR LOCAL FAST_FORWARD FOR SELECT Name FROM @fields
        WHERE Name IN ('CreatedBy','RecordedBy','RequestedBy','OrderedBy','CheckedInBy','SettledBy','ReportedBy','FoundBy','CheckedBy','CashierId');
      OPEN actor_fields; FETCH NEXT FROM actor_fields INTO @field;
      WHILE @@FETCH_STATUS=0 BEGIN SET @data=JSON_MODIFY(@data,'$.'+@field,@ActorId); FETCH NEXT FROM actor_fields INTO @field; END;
      CLOSE actor_fields; DEALLOCATE actor_fields;
      IF EXISTS(SELECT 1 FROM @fields WHERE Name='BusinessDate') AND @entity<>'BusinessDay'
        SET @data=JSON_MODIFY(@data,'$.BusinessDate',CONVERT(varchar(10),@day,23));
    END;
    IF @entity='Stay' AND JSON_VALUE(@data,'$.Status')='CHECKED_OUT' SET @data=JSON_MODIFY(@data,'$.CheckedOutBy',@ActorId);
    IF @entity='BusinessDay' AND JSON_VALUE(@data,'$.Status')='CLOSED' SET @data=JSON_MODIFY(@data,'$.ClosedBy',@ActorId);
    IF @entity='HousekeepingTask' AND JSON_VALUE(@data,'$.Status')='COMPLETED' SET @data=JSON_MODIFY(@data,'$.InspectedBy',@ActorId);
    IF @entity='ExceptionCase' AND JSON_VALUE(@data,'$.Status') IN ('RESOLVED','REJECTED')
    BEGIN
      SET @data=JSON_MODIFY(@data,'$.ResolvedBy',@ActorId);
      SET @data=JSON_MODIFY(@data,'$.ResolvedAtUtc',CONVERT(varchar(30),@now,126));
    END;
    IF EXISTS(SELECT 1 FROM OPENJSON(@data) j LEFT JOIN @fields f ON f.Name COLLATE Latin1_General_BIN2=j.[key] WHERE f.Name IS NULL OR f.IsIdentity=1 OR f.IsComputed=1 OR f.IsRowVersion=1)
      THROW 52428,'Unknown, computed or generated column.',1;
    SELECT @cols=STRING_AGG(CONVERT(nvarchar(max),QUOTENAME(f.Name)),','),
      @values=STRING_AGG(CONVERT(nvarchar(max),'CONVERT('+f.SqlType+',(SELECT value FROM OPENJSON(@data) WHERE [key]=N'''+f.Name+''')'+CASE WHEN f.SqlType LIKE '%binary%' THEN ',1' ELSE '' END+')'),','),
      @sets=STRING_AGG(CONVERT(nvarchar(max),QUOTENAME(f.Name)+'=CONVERT('+f.SqlType+',(SELECT value FROM OPENJSON(@data) WHERE [key]=N'''+f.Name+''')'+CASE WHEN f.SqlType LIKE '%binary%' THEN ',1' ELSE '' END+')'),',')
    FROM @fields f JOIN OPENJSON(@data) j ON j.[key]=f.Name COLLATE Latin1_General_BIN2;
    IF @verb='insert'
      SET @sql=N'INSERT pms.'+QUOTENAME(@entity)+'('+@cols+') VALUES('+@values+'); SET @id=CONVERT(bigint,SCOPE_IDENTITY()); SET @count=@@ROWCOUNT;';
    ELSE IF @verb='update'
      SET @sql=N'UPDATE pms.'+QUOTENAME(@entity)+' SET '+@sets+' WHERE '+@where+'; SET @count=@@ROWCOUNT;';
    ELSE SET @sql=N'DELETE pms.'+QUOTENAME(@entity)+' WHERE '+@where+'; SET @count=@@ROWCOUNT;';
    EXEC sys.sp_executesql @sql,N'@data nvarchar(max),@key nvarchar(max),@version binary(8),@id bigint OUTPUT,@count int OUTPUT',@data,@key,@version,@newId OUTPUT,@count OUTPUT;
    IF @count<>1 THROW 52429,'Exactly one row must be affected per change.',1;
    IF @verb='insert'
    BEGIN
      SET @key=N'{}';
      DECLARE key_fields CURSOR LOCAL FAST_FORWARD FOR SELECT Name FROM @fields WHERE IsPk=1;
      OPEN key_fields; FETCH NEXT FROM key_fields INTO @field;
      WHILE @@FETCH_STATUS=0
      BEGIN
        IF EXISTS(SELECT 1 FROM @fields WHERE Name=@field AND IsIdentity=1) SET @key=JSON_MODIFY(@key,'$.'+@field,@newId);
        ELSE BEGIN SELECT @value=value FROM OPENJSON(@data) WHERE [key]=@field; SET @key=JSON_MODIFY(@key,'$.'+@field,@value); END;
        FETCH NEXT FROM key_fields INTO @field;
      END;
      CLOSE key_fields; DEALLOCATE key_fields;
      IF @ref IS NOT NULL
      BEGIN
        IF @newId IS NULL OR NOT EXISTS(SELECT 1 FROM @fields WHERE IsIdentity=1) THROW 52430,'References require an identity primary key.',1;
        INSERT @refs VALUES(@ref,@newId);
      END;
    END;
    SELECT @where=STRING_AGG(CONVERT(nvarchar(max),QUOTENAME(Name)+'=CONVERT('+SqlType+',(SELECT value FROM OPENJSON(@key) WHERE [key]=N'''+Name+'''))'),' AND ') FROM @fields WHERE IsPk=1;
    SET @sql=N'SELECT @after=(SELECT * FROM pms.'+QUOTENAME(@entity)+' WHERE '+@where+' FOR JSON PATH,INCLUDE_NULL_VALUES,WITHOUT_ARRAY_WRAPPER);';
    EXEC sys.sp_executesql @sql,N'@key nvarchar(max),@after nvarchar(max) OUTPUT',@key,@after OUTPUT;
    INSERT #Touched VALUES(@entity,@key,@before,@after);
    SET @i+=1;
  END;

  -- Derived side effects cannot be omitted by the client.
  UPDATE r SET CleanStatus='DIRTY' FROM pms.Room r WHERE EXISTS(SELECT 1 FROM #Touched t
    WHERE t.Entity='StayRoomSegment' AND JSON_VALUE(t.BeforeJson,'$.DepartedAtUtc') IS NULL
      AND JSON_VALUE(t.AfterJson,'$.DepartedAtUtc') IS NOT NULL AND CONVERT(int,JSON_VALUE(t.AfterJson,'$.RoomId'))=r.RoomId);
  INSERT pms.HousekeepingTask(RoomId,StayId,TaskType,Status,Notes)
    SELECT CONVERT(int,JSON_VALUE(t.AfterJson,'$.RoomId')),CONVERT(bigint,JSON_VALUE(t.AfterJson,'$.StayId')),'DEPARTURE','PENDING',N'Tự tạo khi khách rời phòng'
    FROM #Touched t WHERE t.Entity='StayRoomSegment' AND JSON_VALUE(t.BeforeJson,'$.DepartedAtUtc') IS NULL AND JSON_VALUE(t.AfterJson,'$.DepartedAtUtc') IS NOT NULL;
  IF @Operation='CLOSE_DAY'
  BEGIN
    IF NOT EXISTS(SELECT 1 FROM pms.BusinessDay WHERE BusinessDate=@day AND Status='CLOSED')
      OR NOT EXISTS(SELECT 1 FROM pms.HotelSettings WHERE WorkingDate=DATEADD(day,1,@day)) THROW 52426,'Day closure must advance the working date atomically.',1;
    IF EXISTS(SELECT 1 FROM pms.BusinessDay WHERE BusinessDate=@day AND OutstandingVnd<>
      COALESCE((SELECT SUM(BalanceVnd) FROM pms.vFolioBalance WHERE BalanceVnd>0),0)) THROW 52426,'Outstanding snapshot does not reconcile.',1;
    UPDATE pms.BookingRoom SET Status='NO_SHOW' WHERE Status IN ('HELD','CONFIRMED') AND ArrivalDate<=@day;
  END;
  UPDATE b SET Status=x.NewStatus FROM pms.Booking b CROSS APPLY(SELECT CASE
    WHEN EXISTS(SELECT 1 FROM pms.BookingRoom r WHERE r.BookingId=b.BookingId AND r.Status='IN_HOUSE') THEN
      CASE WHEN EXISTS(SELECT 1 FROM pms.BookingRoom r WHERE r.BookingId=b.BookingId AND r.Status IN ('HELD','CONFIRMED')) THEN 'PARTIALLY_CHECKED_IN' ELSE 'CHECKED_IN' END
    WHEN EXISTS(SELECT 1 FROM pms.BookingRoom r WHERE r.BookingId=b.BookingId AND r.Status='CONFIRMED') THEN 'CONFIRMED'
    WHEN EXISTS(SELECT 1 FROM pms.BookingRoom r WHERE r.BookingId=b.BookingId AND r.Status='HELD') THEN 'PENDING'
    WHEN EXISTS(SELECT 1 FROM pms.BookingRoom r WHERE r.BookingId=b.BookingId AND r.Status='COMPLETED') THEN 'COMPLETED'
    WHEN EXISTS(SELECT 1 FROM pms.BookingRoom r WHERE r.BookingId=b.BookingId AND r.Status='NO_SHOW') THEN 'NO_SHOW'
    ELSE 'CANCELLED' END NewStatus) x WHERE b.Status<>x.NewStatus;
  EXEC pms.usp_AssertBusinessState;
  INSERT pms.AuditLog(ActorId,Action,EntityType,EntityKey,RequestId,BeforeJson,AfterJson)
    SELECT @ActorId,@Operation,Entity,LEFT(KeyJson,100),@request,
      CASE WHEN Entity='CustomerIdentity' THEN NULL ELSE BeforeJson END,
      CASE WHEN Entity='CustomerIdentity' THEN N'{"redacted":true}' ELSE AfterJson END FROM #Touched;
  SET @response=(SELECT @request RequestId,JSON_QUERY((SELECT Name,Id FROM @refs FOR JSON PATH)) Created,
    JSON_QUERY((SELECT Entity,JSON_QUERY(KeyJson) [Key] FROM #Touched FOR JSON PATH)) Changed FOR JSON PATH,WITHOUT_ARRAY_WRAPPER);
  UPDATE pms.ApiRequest SET Status='SUCCEEDED',ResponseJson=@response WHERE RequestId=@request;
  DELETE pms.CommandExecution WHERE SessionId=@@SPID;
  COMMIT;
  SELECT @response ResultJson;
 END TRY
 BEGIN CATCH
  IF XACT_STATE()<>0 ROLLBACK;
  THROW;
 END CATCH;
END;
GO
CREATE OR ALTER PROCEDURE pms.usp_ReadResource
 @ActorId bigint,@Entity sysname,@Offset int=0,@Limit int=100
WITH EXECUTE AS OWNER
AS
BEGIN
 SET NOCOUNT ON;
 DECLARE @rules TABLE(Entity sysname,Permissions varchar(250),Ordering nvarchar(100));
 INSERT @rules VALUES
 ('Room','viewRoomRack','RoomId'),('RoomType','viewRoomRack','RoomTypeId'),('vRoomStatus','viewRoomRack','RoomId'),
 ('Booking','createBooking,manageCheckOut','BookingId'),('BookingRoom','createBooking,manageCheckOut','BookingRoomId'),
 ('BookingNightRate','createBooking,manageCheckOut','BookingRoomId,NightDate'),('RoomAllocation','viewRoomRack','AllocationId'),
 ('Stay','manageCheckIn,manageCheckOut','StayId'),('StayRoomSegment','viewRoomRack','SegmentId'),('StayGuest','manageCheckIn','StayId,CustomerId'),
 ('Customer','createBooking,manageCheckOut','CustomerId'),('Organization','createBooking,manageCheckOut','OrganizationId'),
 ('Service','addServiceOrder,manageHousekeepingTasks','ServiceId'),('ServiceOrder','addServiceOrder,manageCheckOut','ServiceOrderId'),
 ('ServiceOrderLine','addServiceOrder,manageCheckOut','ServiceOrderLineId'),('HousekeepingTask','manageHousekeepingTasks','TaskId'),
 ('MaintenanceTicket','reportMaintenance','TicketId'),('MinibarAudit','manageHousekeepingTasks,manageCheckOut','MinibarAuditId'),
 ('MinibarAuditLine','manageHousekeepingTasks,manageCheckOut','MinibarAuditId,ServiceId'),('LostFound','manageHousekeepingTasks','LostFoundId'),
 ('Folio','collectPayment','FolioId'),('FolioEntry','collectPayment','FolioEntryId'),('vFolioBalance','collectPayment','FolioId'),
 ('DepositAccount','collectPayment','DepositAccountId'),('DepositMovement','collectPayment','DepositMovementId'),('vDepositBalance','collectPayment','DepositAccountId'),
 ('Payment','collectPayment','PaymentId'),('RefundRequest','collectPayment,approveRefund','RefundRequestId'),('CashierShift','collectPayment','ShiftId'),
 ('Invoice','printVatInvoice','InvoiceId'),('InvoiceLine','printVatInvoice','InvoiceLineId'),
 ('BusinessDay','viewDailyRevenue','BusinessDate'),('vCashFlowDaily','viewDailyRevenue','BusinessDate'),
 ('vSettledRevenueDaily','viewDailyRevenue','BusinessDate'),('StaySettlement','viewDailyRevenue','StayId'),
 ('HotelSettings','viewRoomRack','HotelId'),('RatePlan','viewRoomRack','RatePlanId'),('RateRule','viewRoomRack','RateRuleId'),
 ('PolicyVersion','viewRoomRack','PolicyVersionId'),('AppRole','systemConfig','RoleId'),('Permission','systemConfig','PermissionId'),
 ('RolePermission','systemConfig','RoleId,PermissionId'),('UserRole','systemConfig','UserId,RoleId'),('AppUser','systemConfig','UserId'),
 ('AuditLog','viewAuditLog','AuditLogId'),('ExceptionCase','manageCheckIn,systemConfig','ExceptionCaseId');
 DECLARE @permissions varchar(250),@order nvarchar(100),@columns nvarchar(max),@sql nvarchar(max);
 SELECT @permissions=Permissions,@order=Ordering FROM @rules WHERE Entity=@Entity;
 IF @permissions IS NULL OR NOT EXISTS(SELECT 1 FROM pms.AppUser u JOIN pms.UserRole ur ON ur.UserId=u.UserId
   JOIN pms.AppRole r ON r.RoleId=ur.RoleId JOIN pms.RolePermission rp ON rp.RoleId=r.RoleId JOIN pms.Permission p ON p.PermissionId=rp.PermissionId
   WHERE u.UserId=@ActorId AND u.IsActive=1 AND r.IsActive=1 AND p.Code IN (SELECT value FROM STRING_SPLIT(@permissions,',')))
   THROW 52403,'Read resource is not allowed for this actor.',1;
 IF @Offset<0 OR @Limit NOT BETWEEN 1 AND 200 THROW 52401,'Invalid pagination.',1;
 SELECT @columns=STRING_AGG(CONVERT(nvarchar(max),CASE WHEN c.system_type_id=189 THEN
   'CONVERT(varchar(18),CONVERT(binary(8),'+QUOTENAME(c.name)+'),1) AS [Version]' ELSE QUOTENAME(c.name) END),',')
 FROM sys.columns c WHERE c.object_id=OBJECT_ID(N'pms.'+QUOTENAME(@Entity)) AND c.name NOT IN ('PasswordHash','ExternalSubject');
 SET @sql=N'SELECT '+@columns+' FROM pms.'+QUOTENAME(@Entity)+' ORDER BY '+@order+' OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY FOR JSON PATH,INCLUDE_NULL_VALUES;';
 EXEC sys.sp_executesql @sql,N'@offset int,@limit int',@Offset,@Limit;
END;
GO
CREATE OR ALTER PROCEDURE pms.usp_Query
 @Entity sysname,@Offset int=0,@Limit int=100
AS
BEGIN
 SET NOCOUNT ON;
 DECLARE @actor bigint;
 SELECT @actor=b.UserId FROM pms.PrincipalBinding b JOIN sys.database_principals d ON d.sid=b.PrincipalSid
   WHERE d.principal_id=DATABASE_PRINCIPAL_ID();
 IF @actor IS NULL THROW 52402,'Database principal is not bound to an application user.',1;
 EXEC pms.usp_ReadResource @ActorId=@actor,@Entity=@Entity,@Offset=@Offset,@Limit=@Limit;
END;
GO
-- The ONLY public mutation entry point runs as CALLER to bind a real database principal.
-- No ActorId parameter and no writable SESSION_CONTEXT authentication.
CREATE OR ALTER PROCEDURE pms.usp_ExecuteCommand
 @Operation varchar(40),@IdempotencyKey varchar(120),@Changes nvarchar(max)
AS
BEGIN
 SET NOCOUNT ON;
 DECLARE @actor bigint;
 SELECT @actor=b.UserId FROM pms.PrincipalBinding b JOIN sys.database_principals d ON d.sid=b.PrincipalSid
   WHERE d.principal_id=DATABASE_PRINCIPAL_ID();
 IF @actor IS NULL THROW 52402,'Database principal is not bound to an application user.',1;
 EXEC pms.usp_ApplyCommand @ActorId=@actor,@Operation=@Operation,@IdempotencyKey=@IdempotencyKey,@Changes=@Changes;
END;
GO
