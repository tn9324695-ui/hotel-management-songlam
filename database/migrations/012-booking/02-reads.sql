CREATE PROCEDURE pms.usp_AppPricingContext @AppUserId bigint,@Mode varchar(32),@InputJson nvarchar(max),@QuotedAtUtc datetime2(3),@RequestId nvarchar(80)
WITH EXECUTE AS OWNER AS
BEGIN
 SET NOCOUNT ON;
 EXEC pms.usp_WebAuthorize @AppUserId,'viewRoomRack';
 IF @Mode NOT IN('nightly','hourly') OR ISJSON(@InputJson)<>1 OR DATALENGTH(@InputJson)>8192 THROW 54100,'Unsupported pricing input.',1;
 DECLARE @type int=TRY_CONVERT(int,JSON_VALUE(@InputJson,'$.roomTypeId')),@plan int=TRY_CONVERT(int,JSON_VALUE(@InputJson,'$.ratePlanId')),
 @start datetimeoffset(3)=TRY_CONVERT(datetimeoffset(3),JSON_VALUE(@InputJson,'$.checkInAt')),@end datetimeoffset(3)=TRY_CONVERT(datetimeoffset(3),JSON_VALUE(@InputJson,'$.checkOutAt')),
 @adults int=TRY_CONVERT(int,JSON_VALUE(@InputJson,'$.adultsPerRoom')),@children int=TRY_CONVERT(int,JSON_VALUE(@InputJson,'$.childrenPerRoom')),
 @from date,@to date,@json nvarchar(max);
 IF @start IS NULL OR @end IS NULL OR @end<=@start OR @end>DATEADD(day,366,@start) THROW 54100,'Invalid stay interval.',1;
 IF DATEPART(TZOFFSET,@start) NOT IN(0,420) OR DATEPART(TZOFFSET,@end) NOT IN(0,420) THROW 54100,'Wrong hotel offset.',1;
 SET @from=CONVERT(date,@start AT TIME ZONE 'SE Asia Standard Time'); SET @to=CONVERT(date,@end AT TIME ZONE 'SE Asia Standard Time');
 IF @Mode='hourly' SET @to=DATEADD(day,1,@from);
 IF @to<=@from OR @adults IS NULL OR @adults<1 OR @children IS NULL OR @children<0
 OR NOT EXISTS(SELECT 1 FROM pms.RoomType WHERE RoomTypeId=@type AND IsActive=1 AND MaxOccupancy>=@adults+@children)
 THROW 54101,'Room type/capacity invalid.',1;
 IF NOT EXISTS(SELECT 1 FROM pms.RatePlan p JOIN pms.PolicyVersion v ON v.PolicyVersionId=p.PolicyVersionId
 WHERE p.RatePlanId=@plan AND p.IsActive=1 AND p.StayType=CASE WHEN @Mode='nightly' THEN 'NIGHTLY' ELSE 'HOURLY' END
 AND v.Code='SL-OPERATIONS-2026-11' AND v.Version=1 AND v.EffectiveFromUtc<=CONVERT(datetime2(3),SWITCHOFFSET(@start,'+00:00')))
 THROW 54102,'Rate plan or effective policy missing.',1;
 IF NOT EXISTS(SELECT 1 FROM pms.HotelSettings WHERE HotelId=1 AND TimeZoneId='SE Asia Standard Time' AND Currency='VND' AND CheckInTime='14:00' AND CheckOutTime='12:00') THROW 54102,'Hotel clock policy changed.',1;
 SET @json=pms.fn_WebPricingContext(@type,@plan,@from,@to);
 SELECT @json ContextJson;
END;
GO
CREATE PROCEDURE pms.usp_AppReferenceRead @AppUserId bigint,@Resource sysname,@Mode varchar(20),@RecordKey nvarchar(40)=NULL,
 @FiltersJson nvarchar(max)=N'{}',@Offset int=0,@Limit int=50,@RequestId nvarchar(80)=NULL
WITH EXECUTE AS OWNER AS
BEGIN
 SET NOCOUNT ON;
 IF @Resource IN('RoomType','vRoomStatus','Service','HotelSettings','BusinessDay')
 BEGIN
  EXEC pms.usp_AppCatalogRead @AppUserId=@AppUserId,@Resource=@Resource,@Mode=@Mode,@RecordKey=@RecordKey,@FiltersJson=@FiltersJson,@Offset=@Offset,@Limit=@Limit,@RequestId=@RequestId;
  RETURN;
 END;
 IF @Resource='Customer'
 BEGIN
  IF pms.fn_WebPermission(@AppUserId,'createBooking')=0 EXEC pms.usp_WebAuthorize @AppUserId,'manageCheckIn';
  ELSE EXEC pms.usp_WebAuthorize @AppUserId,'createBooking';
 END
 ELSE EXEC pms.usp_WebAuthorize @AppUserId,'viewRoomRack';
 IF @Resource NOT IN('RatePlan','RateRule','PolicyVersion','Customer') OR @Mode NOT IN('list','detail') OR @Offset NOT BETWEEN 0 AND 1000000 OR @Limit NOT BETWEEN 1 AND 200
 OR ISJSON(@FiltersJson)<>1 OR DATALENGTH(@FiltersJson)>8192 THROW 54100,'Invalid reference input.',1;
 DECLARE @q nvarchar(160)=JSON_VALUE(@FiltersJson,'$.q'),@phone varchar(30)=JSON_VALUE(@FiltersJson,'$.phone'),@code varchar(40)=JSON_VALUE(@FiltersJson,'$.code'),
 @active bit=CASE JSON_VALUE(@FiltersJson,'$.active') WHEN 'true' THEN 1 WHEN 'false' THEN 0 END,@stay varchar(10)=JSON_VALUE(@FiltersJson,'$.stayType'),
 @type int=TRY_CONVERT(int,JSON_VALUE(@FiltersJson,'$.roomTypeId')),@plan int=TRY_CONVERT(int,JSON_VALUE(@FiltersJson,'$.ratePlanId')),
 @from date=TRY_CONVERT(date,JSON_VALUE(@FiltersJson,'$.from')),@to date=TRY_CONVERT(date,JSON_VALUE(@FiltersJson,'$.to')),@day varchar(10)=JSON_VALUE(@FiltersJson,'$.dayKind'),@id bigint=TRY_CONVERT(bigint,@RecordKey);
 IF @Mode='detail' AND (@id IS NULL OR @id<=0) THROW 54100,'Invalid reference key.',1;
 IF @Resource='Customer'
 BEGIN
  IF @Mode='list' AND COALESCE(NULLIF(@q,N''),NULLIF(@phone,''),NULLIF(@code,'')) IS NULL THROW 54100,'Customer search must be intentional.',1;
  SELECT CONVERT(varchar(20),CustomerId) CustomerId,Code,FullName,Phone,Email,NationalityCode,IsActive
   FROM pms.Customer WHERE (@Mode='detail' AND CustomerId=@id) OR (@Mode='list' AND IsActive=1
   AND (@q IS NULL OR CHARINDEX(@q,FullName)>0 OR CHARINDEX(@q,COALESCE(Phone,''))>0 OR CHARINDEX(@q,Code)>0)
   AND (@phone IS NULL OR Phone=@phone) AND (@code IS NULL OR Code=@code)) ORDER BY CustomerId OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY;
  SELECT CONVERT(varchar(30),COUNT_BIG(*)) TotalCount FROM pms.Customer WHERE (@Mode='detail' AND CustomerId=@id) OR (@Mode='list' AND IsActive=1
   AND (@q IS NULL OR CHARINDEX(@q,FullName)>0 OR CHARINDEX(@q,COALESCE(Phone,''))>0 OR CHARINDEX(@q,Code)>0)
   AND (@phone IS NULL OR Phone=@phone) AND (@code IS NULL OR Code=@code)); RETURN;
 END;
 IF @Resource='RatePlan'
 BEGIN
  SELECT CONVERT(varchar(20),RatePlanId) RatePlanId,Code,Name,StayType,CONVERT(varchar(20),PolicyVersionId) PolicyVersionId,IsActive FROM pms.RatePlan
  WHERE (@Mode='detail' AND RatePlanId=@id) OR (@Mode='list' AND (@active IS NULL OR IsActive=@active) AND (@stay IS NULL OR StayType=@stay) AND (@q IS NULL OR CHARINDEX(@q,Name)>0 OR CHARINDEX(@q,Code)>0))
  ORDER BY RatePlanId OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY;
  SELECT CONVERT(varchar(30),COUNT_BIG(*)) TotalCount FROM pms.RatePlan WHERE (@Mode='detail' AND RatePlanId=@id) OR (@Mode='list' AND (@active IS NULL OR IsActive=@active) AND (@stay IS NULL OR StayType=@stay) AND (@q IS NULL OR CHARINDEX(@q,Name)>0 OR CHARINDEX(@q,Code)>0)); RETURN;
 END;
 IF @Resource='PolicyVersion'
 BEGIN
  SELECT CONVERT(varchar(20),PolicyVersionId) PolicyVersionId,Code,Version,CONVERT(varchar(23),EffectiveFromUtc,126)+'Z' EffectiveFromUtc FROM pms.PolicyVersion
   WHERE (@Mode='detail' AND PolicyVersionId=@id) OR (@Mode='list' AND (@code IS NULL OR Code=@code)) ORDER BY PolicyVersionId OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY;
  SELECT CONVERT(varchar(30),COUNT_BIG(*)) TotalCount FROM pms.PolicyVersion WHERE (@Mode='detail' AND PolicyVersionId=@id) OR (@Mode='list' AND (@code IS NULL OR Code=@code)); RETURN;
 END;
 SELECT CONVERT(varchar(20),RateRuleId) RateRuleId,CONVERT(varchar(20),RatePlanId) RatePlanId,CONVERT(varchar(20),RoomTypeId) RoomTypeId,
 CONVERT(char(10),ValidFrom,23) ValidFrom,CONVERT(char(10),ValidTo,23) ValidTo,DayKind,Priority,CONVERT(varchar(30),PriceVnd) PriceVnd,
 IncludedMinutes,ExtraBlockMinutes,CONVERT(varchar(30),ExtraBlockPriceVnd) ExtraBlockPriceVnd FROM pms.RateRule
 WHERE (@Mode='detail' AND RateRuleId=@id) OR (@Mode='list' AND (@plan IS NULL OR RatePlanId=@plan) AND (@type IS NULL OR RoomTypeId=@type)
 AND (@from IS NULL OR ValidTo>@from) AND (@to IS NULL OR ValidFrom<=@to) AND (@day IS NULL OR DayKind=@day)) ORDER BY RateRuleId OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY;
 SELECT CONVERT(varchar(30),COUNT_BIG(*)) TotalCount FROM pms.RateRule
 WHERE (@Mode='detail' AND RateRuleId=@id) OR (@Mode='list' AND (@plan IS NULL OR RatePlanId=@plan) AND (@type IS NULL OR RoomTypeId=@type)
 AND (@from IS NULL OR ValidTo>@from) AND (@to IS NULL OR ValidFrom<=@to) AND (@day IS NULL OR DayKind=@day));
END;
GO
CREATE PROCEDURE pms.usp_AppBookingRead @AppUserId bigint,@Operation varchar(32),@InputJson nvarchar(max),@RequestId nvarchar(80)
WITH EXECUTE AS OWNER AS
BEGIN
 SET NOCOUNT ON;
 IF @Operation IN('availability','timeline') EXEC pms.usp_WebAuthorize @AppUserId,'viewRoomRack';
 ELSE IF pms.fn_WebPermission(@AppUserId,'createBooking')=1 EXEC pms.usp_WebAuthorize @AppUserId,'createBooking';
 ELSE EXEC pms.usp_WebAuthorize @AppUserId,'manageCheckOut';
 IF ISJSON(@InputJson)<>1 OR DATALENGTH(@InputJson)>8192 THROW 54100,'Invalid read input.',1;
 DECLARE @from date=TRY_CONVERT(date,JSON_VALUE(@InputJson,'$.from')),@to date=TRY_CONVERT(date,JSON_VALUE(@InputJson,'$.to')),
 @type int=TRY_CONVERT(int,JSON_VALUE(@InputJson,'$.roomTypeId')),@room int=TRY_CONVERT(int,JSON_VALUE(@InputJson,'$.roomId')),
 @id bigint=TRY_CONVERT(bigint,JSON_VALUE(@InputJson,'$.bookingId')),@customer bigint=TRY_CONVERT(bigint,JSON_VALUE(@InputJson,'$.customerId')),
 @offset int=COALESCE(TRY_CONVERT(int,JSON_VALUE(@InputJson,'$.offset')),0),@limit int=COALESCE(TRY_CONVERT(int,JSON_VALUE(@InputJson,'$.limit')),50),
 @status varchar(24)=JSON_VALUE(@InputJson,'$.status'),@code varchar(40)=JSON_VALUE(@InputJson,'$.code'),@payload nvarchar(max),@rows nvarchar(max),@total bigint,
 @start datetime2(3),@end datetime2(3),@date date,@a datetime2(3),@b datetime2(3),@now datetime2(3)=SYSUTCDATETIME(),@specific bit=0;
 IF @offset NOT BETWEEN 0 AND 1000000 OR @limit NOT BETWEEN 1 AND 200 THROW 54100,'Invalid pagination.',1;
 IF @Operation IN('availability','timeline') AND (@from IS NULL OR @to IS NULL OR @to<=@from OR DATEDIFF(day,@from,@to)>366) THROW 54100,'Invalid date window.',1;
 SET @start=DATEADD(hour,-7,CONVERT(datetime2(3),@from)); SET @end=DATEADD(hour,-7,CONVERT(datetime2(3),@to));
 IF @Operation='availability'
 BEGIN
  IF NOT EXISTS(SELECT 1 FROM pms.RoomType WHERE RoomTypeId=@type AND IsActive=1) THROW 54101,'Unknown active room type.',1;
  IF JSON_VALUE(@InputJson,'$.checkInAt') IS NOT NULL
  BEGIN
   SET @specific=1; SET @start=CONVERT(datetime2(3),SWITCHOFFSET(TRY_CONVERT(datetimeoffset(3),JSON_VALUE(@InputJson,'$.checkInAt')),'+00:00'));
   SET @end=CONVERT(datetime2(3),SWITCHOFFSET(TRY_CONVERT(datetimeoffset(3),JSON_VALUE(@InputJson,'$.checkOutAt')),'+00:00'));
   IF @start IS NULL OR @end IS NULL OR @end<=@start THROW 54100,'Invalid exact availability interval.',1;
  END;
  DECLARE @nights TABLE([date] varchar(10),capacity int,reservedUnreceived int,occupied int,blocked int,available int);
  SET @date=@from;
  WHILE @date<@to
  BEGIN
   IF @specific=0 BEGIN SET @a=DATEADD(hour,7,CONVERT(datetime2(3),@date)); SET @b=DATEADD(hour,5,CONVERT(datetime2(3),DATEADD(day,1,@date))); END
   ELSE BEGIN SET @a=CASE WHEN @date=@from THEN @start ELSE DATEADD(hour,-7,CONVERT(datetime2(3),@date)) END;
    SET @b=CASE WHEN @date=DATEADD(day,-1,@to) THEN @end ELSE DATEADD(hour,-7,CONVERT(datetime2(3),DATEADD(day,1,@date))) END; END;
   INSERT @nights SELECT CONVERT(char(10),@date,23),* FROM pms.fn_WebInventoryUsage(@type,@a,@b);
   SET @date=DATEADD(day,1,@date);
  END;
  IF EXISTS(SELECT 1 FROM @nights WHERE available<0) THROW 51006,'Inventory has unresolved conflicts.',1;
  SELECT (SELECT CONVERT(char(10),@from,23) [from],CONVERT(char(10),@to,23) [to],CONVERT(varchar(20),@type) roomTypeId,CAST(1 AS bit) complete,'[start,end)' interval,
   'SAME_INSTANT_AT_MIN_AVAILABLE' countBasis,CONVERT(varchar(23),@now,126)+'Z' asOfUtc,'Asia/Ho_Chi_Minh' timeZone,
   JSON_QUERY((SELECT * FROM @nights ORDER BY [date] FOR JSON PATH)) nights FOR JSON PATH,WITHOUT_ARRAY_WRAPPER) PayloadJson; RETURN;
 END;
 IF @Operation='timeline'
 BEGIN
  DECLARE @segments TABLE(id varchar(100),kind varchar(10),roomId varchar(20),roomTypeId varchar(20),startsAtUtc varchar(24),endsAtUtc varchar(24),bookingId varchar(20),bookingRoomId varchar(20),status varchar(24));
  INSERT @segments
  SELECT 'BR-'+CONVERT(varchar(20),b.BookingRoomId)+'-'+COALESCE(CONVERT(varchar(20),a.AllocationId),'U'),'BOOKING',CONVERT(varchar(20),a.RoomId),CONVERT(varchar(20),COALESCE(r.RoomTypeId,b.RoomTypeId)),
   CONVERT(varchar(23),COALESCE(a.StartsAtUtc,b.StartsAtUtc),126)+'Z',CONVERT(varchar(23),COALESCE(a.EndsAtUtc,b.EndsAtUtc),126)+'Z',CONVERT(varchar(20),b.BookingId),CONVERT(varchar(20),b.BookingRoomId),b.Status
  FROM pms.BookingRoom b LEFT JOIN pms.RoomAllocation a ON a.BookingRoomId=b.BookingRoomId AND a.IsCancelled=0 LEFT JOIN pms.Room r ON r.RoomId=a.RoomId
  WHERE b.Status IN('HELD','CONFIRMED') AND COALESCE(a.StartsAtUtc,b.StartsAtUtc)<@end AND COALESCE(a.EndsAtUtc,b.EndsAtUtc)>@start AND (@type IS NULL OR COALESCE(r.RoomTypeId,b.RoomTypeId)=@type) AND (@room IS NULL OR a.RoomId=@room);
  INSERT @segments
  SELECT 'ST-'+CONVERT(varchar(20),g.SegmentId),'STAY',CONVERT(varchar(20),g.RoomId),CONVERT(varchar(20),r.RoomTypeId),CONVERT(varchar(23),g.ArrivedAtUtc,126)+'Z',CONVERT(varchar(23),COALESCE(g.DepartedAtUtc,s.ExpectedOutAtUtc),126)+'Z',
   CONVERT(varchar(20),b.BookingId),CONVERT(varchar(20),s.BookingRoomId),s.Status
  FROM pms.Stay s JOIN pms.BookingRoom b ON b.BookingRoomId=s.BookingRoomId JOIN pms.StayRoomSegment g ON g.StayId=s.StayId JOIN pms.Room r ON r.RoomId=g.RoomId
  WHERE g.ArrivedAtUtc<@end AND COALESCE(g.DepartedAtUtc,s.ExpectedOutAtUtc)>@start AND (@type IS NULL OR r.RoomTypeId=@type) AND (@room IS NULL OR r.RoomId=@room);
  INSERT @segments SELECT 'BLOCK-'+CONVERT(varchar(20),a.AllocationId),'BLOCK',CONVERT(varchar(20),a.RoomId),CONVERT(varchar(20),r.RoomTypeId),CONVERT(varchar(23),a.StartsAtUtc,126)+'Z',CONVERT(varchar(23),a.EndsAtUtc,126)+'Z',NULL,NULL,'BLOCKED'
   FROM pms.RoomAllocation a JOIN pms.Room r ON r.RoomId=a.RoomId WHERE a.BookingRoomId IS NULL AND a.IsCancelled=0 AND a.StartsAtUtc<@end AND a.EndsAtUtc>@start AND (@type IS NULL OR r.RoomTypeId=@type) AND (@room IS NULL OR r.RoomId=@room);
  SELECT @total=COUNT(*) FROM @segments;
  SET @rows=(SELECT * FROM @segments ORDER BY startsAtUtc,id OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY FOR JSON PATH,INCLUDE_NULL_VALUES);
  SET @payload=(SELECT CONVERT(char(10),@from,23) [from],CONVERT(char(10),@to,23) [to],CONVERT(varchar(23),@start,126)+'Z' windowStartsAtUtc,CONVERT(varchar(23),@end,126)+'Z' windowEndsAtUtc,
    CONVERT(varchar(23),@now,126)+'Z' asOfUtc,'Asia/Ho_Chi_Minh' timeZone,JSON_QUERY(@rows) segments,
    JSON_QUERY((SELECT @offset offset,@limit limit,CONVERT(varchar(30),@total) total,CAST(CASE WHEN @offset+@limit<@total THEN 1 ELSE 0 END AS bit) hasMore FOR JSON PATH,WITHOUT_ARRAY_WRAPPER)) page FOR JSON PATH,WITHOUT_ARRAY_WRAPPER);
 END
 ELSE IF @Operation='detail'
 BEGIN
  IF pms.fn_WebPermission(@AppUserId,'collectPayment')=1 AND (EXISTS(SELECT 1 FROM pms.Payment WHERE BookingId=@id) OR EXISTS(SELECT 1 FROM pms.DepositAccount WHERE BookingId=@id))
   THROW 54108,'Deposit ledger projection requires financial contract; never substitute zero.',1;
  SET @payload=N'{"booking":'+COALESCE(pms.fn_WebBookingJson(@id,1),N'null')+N'}';
 END
 ELSE IF @Operation='list'
 BEGIN
  DECLARE @ids TABLE(id bigint PRIMARY KEY);
  INSERT @ids SELECT b.BookingId FROM pms.Booking b WHERE (@status IS NULL OR b.Status=@status) AND (@customer IS NULL OR b.CustomerId=@customer) AND (@code IS NULL OR CHARINDEX(@code,b.Code)>0)
   AND (@from IS NULL OR EXISTS(SELECT 1 FROM pms.BookingRoom r WHERE r.BookingId=b.BookingId AND r.StartsAtUtc<@end AND r.EndsAtUtc>@start));
  SELECT @total=COUNT(*) FROM @ids;
  SELECT @rows=COALESCE(N'['+STRING_AGG(CONVERT(nvarchar(max),pms.fn_WebBookingJson(id,0)),N',') WITHIN GROUP(ORDER BY id)+N']',N'[]')
   FROM (SELECT id FROM @ids ORDER BY id OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY) x;
  SET @payload=(SELECT JSON_QUERY(@rows) bookings,JSON_QUERY((SELECT @offset offset,@limit limit,CONVERT(varchar(30),@total) total,CAST(CASE WHEN @offset+@limit<@total THEN 1 ELSE 0 END AS bit) hasMore FOR JSON PATH,WITHOUT_ARRAY_WRAPPER)) page FOR JSON PATH,WITHOUT_ARRAY_WRAPPER);
 END
 ELSE THROW 54100,'Unsupported booking read.',1;
 SELECT @payload PayloadJson;
END;
