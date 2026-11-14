
ALTER PROCEDURE pms.usp_AppBookingCommit @AppUserId bigint,@Operation varchar(32),@InputJson nvarchar(max),@RequestId nvarchar(80),@IdempotencyKey varchar(120),@IntentHash varchar(64),
 @Changes nvarchar(max),@PreparedJson nvarchar(max),@PriceProofsJson nvarchar(max)
WITH EXECUTE AS OWNER AS
BEGIN
 SET NOCOUNT ON; SET XACT_ABORT ON; SET ANSI_WARNINGS ON; SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET NUMERIC_ROUNDABORT OFF;
 IF @@TRANCOUNT<>0 THROW 52400,'Command owns its transaction.',1;
 IF @Operation<>'create' OR ISJSON(@InputJson)<>1 OR ISJSON(@Changes)<>1 OR ISJSON(@PriceProofsJson)<>1 OR ISJSON(@PreparedJson)<>1
 OR DATALENGTH(@InputJson)>1000000 OR DATALENGTH(@Changes)>4000000 OR DATALENGTH(@PriceProofsJson)>65536
 OR TRY_CONVERT(uniqueidentifier,@RequestId) IS NULL OR LEN(@IdempotencyKey) NOT BETWEEN 1 AND 120 OR @IdempotencyKey IS NULL
 OR @IntentHash<>LOWER(CONVERT(varchar(64),HASHBYTES('SHA2_256',CONVERT(varchar(max),@InputJson COLLATE Latin1_General_100_BIN2_UTF8)),2)) THROW 54100,'Invalid canonical command.',1;
 DECLARE @request uniqueidentifier=CONVERT(uniqueidentifier,@RequestId),@saved nvarchar(max),@savedHash binary(32),@hash binary(32)=CONVERT(binary(32),@IntentHash,2),
 @booking bigint,@bookingCode varchar(40),@customer bigint=TRY_CONVERT(bigint,JSON_VALUE(@InputJson,'$.customerId')),@kind varchar(12)=JSON_VALUE(@InputJson,'$.kind'),
 @count int,@changeCount int,@expectedChanges int=1,@lock int,@policyHash varchar(64),@policyId varchar(100),@rows nvarchar(max),@response nvarchar(max),@now datetime2(3)=SYSUTCDATETIME();
 DECLARE @rooms TABLE(n int PRIMARY KEY,lineKey varchar(40) UNIQUE,raw nvarchar(max),id bigint NULL);
 INSERT @rooms(n,lineKey,raw) SELECT TRY_CONVERT(int,[key]),JSON_VALUE(value,'$.lineKey'),value FROM OPENJSON(@InputJson,'$.rooms');
 SELECT @count=COUNT(*) FROM @rooms; SELECT @changeCount=COUNT(*) FROM OPENJSON(@Changes);
 IF @count NOT BETWEEN 1 AND 50 OR @changeCount NOT BETWEEN 1 AND 500 OR @kind NOT IN('INDIVIDUAL','GROUP') THROW 54100,'Booking batch limit exceeded.',1;
 IF EXISTS(SELECT 1 FROM OPENJSON(@Changes) WHERE JSON_VALUE(value,'$.verb')<>'insert' OR JSON_VALUE(value,'$.entity') NOT IN('Booking','BookingRoom','BookingNightRate','BookingGuest','RoomAllocation')) THROW 54100,'Only the booking create layout is permitted.',1;
 BEGIN TRY
  BEGIN TRANSACTION;
  EXEC @lock=sys.sp_getapplock @Resource=N'SongLam:Inventory',@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=10000;
  IF @lock<0 THROW 51002,'Inventory lock unavailable.',1;
  EXEC pms.usp_WebAuthorize @AppUserId,'createBooking';
  EXEC pms.usp_WebAuthorize @AppUserId,'viewRoomRack';
  SELECT @saved=ResponseJson,@savedHash=RequestHash FROM pms.ApiRequest WITH(UPDLOCK,HOLDLOCK) WHERE ActorId=@AppUserId AND Operation='WEB_BOOKING_CREATE' AND IdempotencyKey=@IdempotencyKey;
  IF @savedHash IS NOT NULL
  BEGIN
   IF @savedHash<>@hash THROW 52404,'Idempotency key conflict.',1;
   IF @saved IS NULL THROW 54109,'Request pending.',1;
   COMMIT; SELECT JSON_MODIFY(@saved,'$.replayed',CAST(1 AS bit)) PayloadJson; RETURN;
  END;
  SELECT @policyHash=JSON_VALUE(CONVERT(nvarchar(max),value),'$.policyHash'),@policyId=JSON_VALUE(CONVERT(nvarchar(max),value),'$.policyVersionId') FROM sys.extended_properties WHERE class=0 AND name=N'SongLam.Booking012.Release';
  IF @policyHash IS NULL OR NOT EXISTS(SELECT 1 FROM pms.PolicyVersion WITH(HOLDLOCK) WHERE CONVERT(varchar(20),PolicyVersionId)=@policyId AND
   LOWER(CONVERT(varchar(64),HASHBYTES('SHA2_256',CONVERT(varchar(max),RulesJson COLLATE Latin1_General_100_BIN2_UTF8)),2))=@policyHash) THROW 52431,'Published policy changed.',1;
  IF NOT EXISTS(SELECT 1 FROM pms.Customer WITH(HOLDLOCK) WHERE CustomerId=@customer AND IsActive=1) THROW 54103,'Active customer required.',1;
  IF NOT EXISTS(SELECT 1 FROM pms.HotelSettings h WITH(HOLDLOCK) JOIN pms.BusinessDay d WITH(HOLDLOCK) ON d.BusinessDate=h.WorkingDate AND d.Status='OPEN' WHERE h.HotelId=1 AND h.TimeZoneId='SE Asia Standard Time' AND h.Currency='VND' AND h.CheckInTime='14:00' AND h.CheckOutTime='12:00') THROW 54102,'Open business day and published clock required.',1;
  IF EXISTS(SELECT 1 FROM pms.ApiRequest WHERE RequestId=@request) THROW 52404,'Request identifier already belongs to another intent.',1;
  INSERT pms.ApiRequest(RequestId,ActorId,Operation,IdempotencyKey,RequestHash,Status) VALUES(@request,@AppUserId,'WEB_BOOKING_CREATE',@IdempotencyKey,@hash,'PROCESSING');
  INSERT pms.CommandExecution(SessionId,RequestId) VALUES(@@SPID,@request);
  SET @bookingCode='SL-'+CONVERT(varchar(36),@request);
  INSERT pms.Booking(Code,BookingKind,CustomerId,OrganizationId,GroupName,ContactName,ContactPhone,ContactEmail,SourceCode,Status,Notes,CreatedBy)
   VALUES(@bookingCode,@kind,@customer,TRY_CONVERT(bigint,JSON_VALUE(@InputJson,'$.organizationId')),JSON_VALUE(@InputJson,'$.groupName'),JSON_VALUE(@InputJson,'$.contact.name'),
    JSON_VALUE(@InputJson,'$.contact.phone'),JSON_VALUE(@InputJson,'$.contact.email'),JSON_VALUE(@InputJson,'$.sourceCode'),'CONFIRMED',JSON_VALUE(@InputJson,'$.notes'),@AppUserId);
  SET @booking=SCOPE_IDENTITY();
  DECLARE @n int=0,@raw nvarchar(max),@snapshot nvarchar(max),@proof nvarchar(max),@context nvarchar(max),@snapshotHash varchar(64),@acceptance varchar(64),@acceptedTerms nvarchar(max),
   @type int,@plan int,@planned int,@stayType varchar(10),@start datetimeoffset(3),@end datetimeoffset(3),@startUtc datetime2(3),@endUtc datetime2(3),@from date,@to date,@contextTo date,
   @adults int,@children int,@base decimal(19,0),@early decimal(19,0),@late decimal(19,0),@total decimal(19,0),@valid bit,@roomId bigint,@night date,@line varchar(40),@guestCount int,@nightCount int;
  WHILE @n<@count
  BEGIN
   SELECT @raw=raw,@line=lineKey FROM @rooms WHERE n=@n;
   SELECT @type=TRY_CONVERT(int,JSON_VALUE(@raw,'$.roomTypeId')),@plan=TRY_CONVERT(int,JSON_VALUE(@raw,'$.ratePlanId')),@planned=TRY_CONVERT(int,JSON_VALUE(@raw,'$.plannedRoomId')),
    @stayType=JSON_VALUE(@raw,'$.stayType'),@start=TRY_CONVERT(datetimeoffset(3),JSON_VALUE(@raw,'$.checkInAt')),@end=TRY_CONVERT(datetimeoffset(3),JSON_VALUE(@raw,'$.checkOutAt')),
    @adults=TRY_CONVERT(int,JSON_VALUE(@raw,'$.adults')),@children=TRY_CONVERT(int,JSON_VALUE(@raw,'$.children'));
   SET @startUtc=CONVERT(datetime2(3),SWITCHOFFSET(@start,'+00:00')); SET @endUtc=CONVERT(datetime2(3),SWITCHOFFSET(@end,'+00:00'));
   SET @from=CONVERT(date,@start AT TIME ZONE 'SE Asia Standard Time'); SET @to=CONVERT(date,@end AT TIME ZONE 'SE Asia Standard Time');
   SET @contextTo=CASE WHEN @stayType='HOURLY' THEN DATEADD(day,1,@from) ELSE @to END;
   IF @start IS NULL OR @end IS NULL OR @end<=@start OR @end>DATEADD(day,366,@start) OR DATEPART(TZOFFSET,@start) NOT IN(0,420) OR DATEPART(TZOFFSET,@end) NOT IN(0,420)
     OR @stayType NOT IN('NIGHTLY','HOURLY') OR (@stayType='NIGHTLY' AND @to<=@from) OR @adults IS NULL OR @adults<1 OR @children IS NULL OR @children<0
     OR @from<(SELECT WorkingDate FROM pms.HotelSettings WHERE HotelId=1) THROW 54100,'Invalid room interval/guests.',1;
   IF NOT EXISTS(SELECT 1 FROM pms.RoomType WITH(HOLDLOCK) WHERE RoomTypeId=@type AND IsActive=1 AND MaxOccupancy>=@adults+@children)
     OR NOT EXISTS(SELECT 1 FROM pms.RatePlan WITH(HOLDLOCK) WHERE RatePlanId=@plan AND IsActive=1 AND StayType=@stayType AND PolicyVersionId=TRY_CONVERT(int,@policyId)) THROW 52431,'Active type/plan and capacity required.',1;
   SET @snapshot=NULL; SET @proof=NULL;
   SELECT @snapshot=JSON_QUERY(value,'$.data.RateSnapshotJson') FROM OPENJSON(@Changes) WHERE JSON_VALUE(value,'$.entity')='BookingRoom' AND JSON_VALUE(value,'$.ref')='room_'+CONVERT(varchar(10),@n);
   SELECT @proof=value FROM OPENJSON(@PriceProofsJson) WHERE JSON_VALUE(value,'$.lineKey')=@line;
   DECLARE @priceLockCount int; SELECT @priceLockCount=COUNT(*) FROM pms.RateRule WITH(HOLDLOCK) WHERE RatePlanId=@plan AND RoomTypeId=@type;
   SET @context=pms.fn_WebPricingContext(@type,@plan,@from,@contextTo);
   SET @acceptedTerms=JSON_MODIFY(JSON_MODIFY(@snapshot,'$.sourceQuoteId',NULL),'$.quotedAt',NULL);
   SET @snapshotHash=LOWER(CONVERT(varchar(64),HASHBYTES('SHA2_256',CONVERT(varchar(max),@snapshot COLLATE Latin1_General_100_BIN2_UTF8)),2));
   SET @acceptance=LOWER(CONVERT(varchar(64),HASHBYTES('SHA2_256',CONVERT(varchar(max),@acceptedTerms COLLATE Latin1_General_100_BIN2_UTF8)),2));
   IF @snapshot IS NULL OR @proof IS NULL OR @context IS NULL OR @snapshotHash IS NULL OR @acceptance IS NULL
    OR (SELECT COUNT(*) FROM OPENJSON(@snapshot) WHERE [key] IN('schema','engineVersion','sourceQuoteId','quotedAt','input','pricingContext','roomBaseVnd','boundarySurchargesVnd','accommodationTotalVnd','policyVersionId','policyVersion','policyHash','moneyRounding','breakdown') AND type<>0)<>14
    OR EXISTS(SELECT 1 FROM OPENJSON(@snapshot) GROUP BY [key] HAVING COUNT(*)>1)
    OR EXISTS(SELECT 1 FROM OPENJSON(@snapshot) WHERE [key] IN('schema','engineVersion','sourceQuoteId','quotedAt','roomBaseVnd','boundarySurchargesVnd','accommodationTotalVnd','policyVersionId','policyHash','moneyRounding') AND type<>1)
    OR (SELECT COUNT(*) FROM OPENJSON(@snapshot,'$.input'))<>7
    OR EXISTS(SELECT 1 FROM OPENJSON(@snapshot,'$.input') WHERE ([key] IN('roomTypeId','ratePlanId','checkInAt','checkOutAt') AND type<>1) OR ([key] IN('rooms','adultsPerRoom','childrenPerRoom') AND type<>2))
    OR ISNULL(TRY_CONVERT(int,JSON_VALUE(@snapshot,'$.policyVersion')),0)<>1
    OR TRY_CONVERT(uniqueidentifier,JSON_VALUE(@snapshot,'$.sourceQuoteId')) IS NULL OR TRY_CONVERT(datetimeoffset,JSON_VALUE(@snapshot,'$.quotedAt')) IS NULL OR JSON_VALUE(@snapshot,'$.schema')<>'songlam.quote.snapshot.v1'
    OR JSON_VALUE(@snapshot,'$.engineVersion')<>'songlam.pricing.v1' OR JSON_VALUE(@snapshot,'$.moneyRounding')<>'HALF_UP'
    OR HASHBYTES('SHA2_256',JSON_QUERY(@snapshot,'$.pricingContext'))<>HASHBYTES('SHA2_256',@context)
    OR @snapshotHash<>JSON_VALUE(@proof,'$.snapshotSha256') OR @acceptance<>JSON_VALUE(@proof,'$.acceptanceHash') OR @acceptance<>JSON_VALUE(@raw,'$.acceptedQuoteHash')
    OR JSON_VALUE(@snapshot,'$.policyHash')<>@policyHash OR JSON_VALUE(@snapshot,'$.policyVersionId')<>@policyId
    OR JSON_VALUE(@snapshot,'$.input.roomTypeId')<>CONVERT(varchar(20),@type) OR JSON_VALUE(@snapshot,'$.input.ratePlanId')<>CONVERT(varchar(20),@plan)
    OR JSON_VALUE(@snapshot,'$.input.checkInAt')<>JSON_VALUE(@raw,'$.checkInAt') OR JSON_VALUE(@snapshot,'$.input.checkOutAt')<>JSON_VALUE(@raw,'$.checkOutAt')
    OR TRY_CONVERT(int,JSON_VALUE(@snapshot,'$.input.rooms'))<>1 OR TRY_CONVERT(int,JSON_VALUE(@snapshot,'$.input.adultsPerRoom'))<>@adults
    OR TRY_CONVERT(int,JSON_VALUE(@snapshot,'$.input.childrenPerRoom'))<>@children THROW 52431,'G4 snapshot/input/current policy mismatch.',1;
   SELECT @base=BaseVnd,@early=EarlyVnd,@late=LateVnd,@total=TotalVnd,@valid=Valid FROM pms.fn_WebQuotedAmounts(@type,@plan,@start,@end);
   IF ISNULL(@valid,0)<>1 OR ISNULL(TRY_CONVERT(decimal(19,0),JSON_VALUE(@snapshot,'$.roomBaseVnd')),-1)<>@base
    OR ISNULL(TRY_CONVERT(decimal(19,0),JSON_VALUE(@snapshot,'$.boundarySurchargesVnd')),-1)<>@early+@late
    OR ISNULL(TRY_CONVERT(decimal(19,0),JSON_VALUE(@snapshot,'$.accommodationTotalVnd')),-1)<>@total THROW 52431,'Published amounts differ from snapshot.',1;
   SELECT @nightCount=COUNT(*) FROM OPENJSON(@snapshot,'$.breakdown') WHERE JSON_VALUE(value,'$.kind')='NIGHT';
   IF (@stayType='NIGHTLY' AND (@nightCount<>DATEDIFF(day,@from,@to) OR (SELECT COUNT(DISTINCT JSON_VALUE(value,'$.date')) FROM OPENJSON(@snapshot,'$.breakdown') WHERE JSON_VALUE(value,'$.kind')='NIGHT')<>@nightCount)) OR (@stayType='HOURLY' AND @nightCount<>0) THROW 52431,'Invalid nightly snapshot coverage.',1;
   IF EXISTS(SELECT 1 FROM OPENJSON(@snapshot,'$.breakdown') j WHERE JSON_VALUE(j.value,'$.kind')='NIGHT' AND NOT EXISTS(
     SELECT 1 FROM pms.RateRule r WITH(HOLDLOCK) WHERE r.RateRuleId=TRY_CONVERT(bigint,JSON_VALUE(j.value,'$.rateRuleId')) AND r.RoomTypeId=@type AND r.RatePlanId=@plan AND r.DayKind='BASE'
     AND r.ValidFrom<=TRY_CONVERT(date,JSON_VALUE(j.value,'$.date')) AND r.ValidTo>TRY_CONVERT(date,JSON_VALUE(j.value,'$.date')) AND TRY_CONVERT(date,JSON_VALUE(j.value,'$.date'))>=@from
     AND TRY_CONVERT(date,JSON_VALUE(j.value,'$.date'))<@to AND r.PriceVnd=TRY_CONVERT(decimal(19,0),JSON_VALUE(j.value,'$.amountPerRoomVnd')))) THROW 52431,'Nightly rate proof differs.',1;
   IF @planned IS NOT NULL AND (NOT EXISTS(SELECT 1 FROM pms.Room WITH(HOLDLOCK) WHERE RoomId=@planned AND RoomTypeId=@type AND IsActive=1)
    OR EXISTS(SELECT 1 FROM pms.MaintenanceTicket WITH(HOLDLOCK) WHERE RoomId=@planned AND Status IN('OPEN','IN_PROGRESS'))
    OR EXISTS(SELECT 1 FROM pms.RoomAllocation a WITH(HOLDLOCK) LEFT JOIN pms.BookingRoom br ON br.BookingRoomId=a.BookingRoomId WHERE a.RoomId=@planned AND a.IsCancelled=0 AND (a.BookingRoomId IS NULL OR br.Status IN('HELD','CONFIRMED','IN_HOUSE')) AND a.StartsAtUtc<@endUtc AND a.EndsAtUtc>@startUtc)
    OR EXISTS(SELECT 1 FROM pms.StayRoomSegment g WITH(HOLDLOCK) JOIN pms.Stay s ON s.StayId=g.StayId WHERE g.RoomId=@planned AND g.ArrivedAtUtc<@endUtc AND COALESCE(g.DepartedAtUtc,s.ExpectedOutAtUtc)>@startUtc)) THROW 51005,'Specific room unavailable in requested interval.',1;
   SELECT @guestCount=COUNT(*) FROM OPENJSON(@raw,'$.guestCustomerIds');
   IF @guestCount>@adults+@children OR (SELECT COUNT(DISTINCT value) FROM OPENJSON(@raw,'$.guestCustomerIds'))<>@guestCount
    OR EXISTS(SELECT 1 FROM OPENJSON(@raw,'$.guestCustomerIds') g WHERE NOT EXISTS(SELECT 1 FROM pms.Customer c WITH(HOLDLOCK) WHERE c.CustomerId=TRY_CONVERT(bigint,g.value) AND c.IsActive=1))
    OR (JSON_VALUE(@raw,'$.leadCustomerId') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM OPENJSON(@raw,'$.guestCustomerIds') WHERE value=JSON_VALUE(@raw,'$.leadCustomerId'))) THROW 54103,'Invalid guest references.',1;
   SET @expectedChanges+=1+@nightCount+@guestCount+CASE WHEN @planned IS NULL THEN 0 ELSE 1 END;
   IF @expectedChanges>500 THROW 54100,'Atomic batch exceeds 500 mutation rows.',1;
   INSERT pms.BookingRoom(BookingId,LineNumber,RoomTypeId,RatePlanId,PolicyVersionId,StayType,ArrivalDate,DepartureDate,StartsAtUtc,EndsAtUtc,Adults,Children,Status,HoldExpiresAtUtc,QuotedTotalVnd,RateSnapshotJson)
    VALUES(@booking,@n+1,@type,@plan,TRY_CONVERT(int,@policyId),@stayType,@from,@to,@startUtc,@endUtc,@adults,@children,'CONFIRMED',NULL,@base,@snapshot);
   SET @roomId=SCOPE_IDENTITY(); UPDATE @rooms SET id=@roomId WHERE n=@n;
   IF @stayType='NIGHTLY'
   BEGIN
    SET @night=@from;
    WHILE @night<@to
    BEGIN
     INSERT pms.BookingNightRate(BookingRoomId,NightDate,PriceVnd) SELECT @roomId,@night,PriceVnd FROM pms.RateRule WHERE RatePlanId=@plan AND RoomTypeId=@type AND DayKind='BASE' AND ValidFrom<=@night AND ValidTo>@night;
     INSERT pms.AuditLog(ActorId,Action,EntityType,EntityKey,RequestId,Reason) VALUES(@AppUserId,'WEB_BOOKING_CREATE','BookingNightRate',CONVERT(varchar(20),@roomId)+'/'+CONVERT(char(10),@night,23),@request,'BOOKING012');
     SET @night=DATEADD(day,1,@night);
    END;
   END;
   INSERT pms.BookingGuest(BookingRoomId,CustomerId,IsLead) SELECT @roomId,CONVERT(bigint,value),CASE WHEN value=JSON_VALUE(@raw,'$.leadCustomerId') THEN 1 ELSE 0 END FROM OPENJSON(@raw,'$.guestCustomerIds');
   IF @planned IS NOT NULL
   BEGIN
    INSERT pms.RoomAllocation(RoomId,BookingRoomId,StartsAtUtc,EndsAtUtc,CreatedBy) VALUES(@planned,@roomId,@startUtc,@endUtc,@AppUserId);
    INSERT pms.AuditLog(ActorId,Action,EntityType,EntityKey,RequestId,Reason) VALUES(@AppUserId,'WEB_BOOKING_CREATE','RoomAllocation',CONVERT(varchar(20),SCOPE_IDENTITY()),@request,'BOOKING012');
   END;
   INSERT pms.AuditLog(ActorId,Action,EntityType,EntityKey,RequestId,AfterJson,Reason) VALUES(@AppUserId,'WEB_BOOKING_CREATE','BookingRoom',CONVERT(varchar(20),@roomId),@request,
     (SELECT CONVERT(varchar(20),@booking) bookingId,CONVERT(varchar(20),@type) roomTypeId,CONVERT(varchar(20),@planned) plannedRoomId,@snapshotHash priceSnapshotSha256 FOR JSON PATH,INCLUDE_NULL_VALUES,WITHOUT_ARRAY_WRAPPER),'BOOKING012');
   SET @n+=1;
  END;
  IF @changeCount<>@expectedChanges THROW 54100,'Compiler layout/cost differs from atomic contract.',1;
  EXEC pms.usp_AssertBusinessState;
  IF EXISTS(SELECT 1 FROM pms.BookingRoom b CROSS APPLY pms.fn_WebInventoryUsage(b.RoomTypeId,b.StartsAtUtc,b.EndsAtUtc) x WHERE b.BookingId=@booking AND x.available<0) THROW 51006,'Capacity exceeded including maintenance tickets.',1;
  INSERT pms.AuditLog(ActorId,Action,EntityType,EntityKey,RequestId,AfterJson,Reason) VALUES(@AppUserId,'WEB_BOOKING_CREATE','Booking',CONVERT(varchar(20),@booking),@request,
    (SELECT @bookingCode code,@count rooms,@IntentHash intentHash FOR JSON PATH,WITHOUT_ARRAY_WRAPPER),'BOOKING012');
  SET @rows=(SELECT CONVERT(varchar(20),r.id) id,r.lineKey,'CONFIRMED' status,CONVERT(varchar(18),CONVERT(binary(8),b.RowVer),1) version FROM @rooms r JOIN pms.BookingRoom b ON b.BookingRoomId=r.id ORDER BY r.n FOR JSON PATH);
  SET @response=(SELECT CONVERT(varchar(20),@AppUserId) actorId,'create' operation,@IntentHash intentHash,'SUCCEEDED' status,CAST(1 AS bit) committed,CAST(1 AS bit) atomic,CAST(1 AS bit) inventoryCheckedUnderLock,CAST(0 AS bit) replayed,
   CONVERT(varchar(36),@request) operationId,CONVERT(varchar(36),@request) originalRequestId,
   CASE WHEN JSON_VALUE(@InputJson,'$.entryPoint')='groups' THEN 'bookings.group' ELSE 'bookings.create' END httpOperation,
   CONVERT(varchar(23),@now,126)+'Z' committedAtUtc,JSON_QUERY(pms.fn_WebBookingJson(@booking,0)) booking,JSON_QUERY(@rows) rooms,JSON_QUERY(pms.fn_WebZeroDeposits()) depositSummary FOR JSON PATH,WITHOUT_ARRAY_WRAPPER);
  UPDATE pms.ApiRequest SET Status='SUCCEEDED',ResponseJson=@response WHERE RequestId=@request;
  DELETE pms.CommandExecution WHERE SessionId=@@SPID AND RequestId=@request;
  COMMIT;
  SELECT @response PayloadJson;
 END TRY
 BEGIN CATCH
  IF XACT_STATE()<>0 ROLLBACK;
  THROW;
 END CATCH;
END;
