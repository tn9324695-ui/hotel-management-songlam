
ALTER PROCEDURE pms.usp_AppBookingRead @AppUserId bigint,@Operation varchar(32),@InputJson nvarchar(max),@RequestId nvarchar(80)
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
  INSERT @segments SELECT 'TICKET-'+CONVERT(varchar(20),t.RoomId),'BLOCK',CONVERT(varchar(20),t.RoomId),CONVERT(varchar(20),r.RoomTypeId),CONVERT(varchar(23),@start,126)+'Z',CONVERT(varchar(23),@end,126)+'Z',NULL,NULL,'BLOCKED'
    FROM pms.MaintenanceTicket t JOIN pms.Room r ON r.RoomId=t.RoomId WHERE t.Status IN('OPEN','IN_PROGRESS') AND r.IsActive=1 AND (@type IS NULL OR r.RoomTypeId=@type) AND (@room IS NULL OR r.RoomId=@room) GROUP BY t.RoomId,r.RoomTypeId;
   SELECT @total=COUNT(*) FROM @segments;
  SET @rows=(SELECT * FROM @segments ORDER BY startsAtUtc,id OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY FOR JSON PATH,INCLUDE_NULL_VALUES);
  SET @payload=(SELECT CONVERT(char(10),@from,23) [from],CONVERT(char(10),@to,23) [to],CONVERT(varchar(23),@start,126)+'Z' windowStartsAtUtc,CONVERT(varchar(23),@end,126)+'Z' windowEndsAtUtc,
    CONVERT(varchar(23),@now,126)+'Z' asOfUtc,'Asia/Ho_Chi_Minh' timeZone,JSON_QUERY(COALESCE(@rows,N'[]')) segments,
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
