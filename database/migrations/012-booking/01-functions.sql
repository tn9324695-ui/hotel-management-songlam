-- SongLam PMS own-system pricing/booking contracts. Applied only by deploy-booking.mjs.
CREATE FUNCTION pms.fn_WebPermission(@ActorId bigint,@Permission varchar(80)) RETURNS bit AS
BEGIN
 RETURN CASE WHEN EXISTS(SELECT 1 FROM pms.AppUser u JOIN pms.UserRole ur ON ur.UserId=u.UserId
 JOIN pms.AppRole r ON r.RoleId=ur.RoleId JOIN pms.RolePermission rp ON rp.RoleId=r.RoleId
 JOIN pms.Permission p ON p.PermissionId=rp.PermissionId
 WHERE u.UserId=@ActorId AND u.IsActive=1 AND r.IsActive=1 AND p.Code=@Permission) THEN 1 ELSE 0 END;
END;
GO
CREATE PROCEDURE pms.usp_WebAuthorize @ActorId bigint,@Permission varchar(80)
AS
BEGIN
 SET NOCOUNT ON;
 IF ORIGINAL_LOGIN()<>N'DESKTOP-9EPI86K\songlam_pms_test' THROW 52403,'Dedicated service identity required.',1;
 IF NOT EXISTS(SELECT 1 FROM pms.AppUser u WITH(HOLDLOCK) JOIN pms.UserRole ur WITH(HOLDLOCK) ON ur.UserId=u.UserId
 JOIN pms.AppRole r WITH(HOLDLOCK) ON r.RoleId=ur.RoleId JOIN pms.RolePermission rp WITH(HOLDLOCK) ON rp.RoleId=r.RoleId
 JOIN pms.Permission p WITH(HOLDLOCK) ON p.PermissionId=rp.PermissionId
 WHERE u.UserId=@ActorId AND u.IsActive=1 AND r.IsActive=1 AND p.Code=@Permission)
 THROW 52403,'Actor not authorized.',1;
END;
GO
CREATE FUNCTION pms.fn_WebPricingContext(@Type int,@Plan int,@From date,@To date) RETURNS nvarchar(max)
AS
BEGIN
 DECLARE @calendar nvarchar(max),@result nvarchar(max);
 ;WITH Dates AS (SELECT @From d UNION ALL SELECT DATEADD(day,1,d) FROM Dates WHERE d<DATEADD(day,-1,@To))
 SELECT @calendar=(SELECT CONVERT(char(10),d,23) AS [date],JSON_QUERY(N'["BASE"]') AS kinds FROM Dates ORDER BY d FOR JSON PATH) OPTION(MAXRECURSION 367);
 SELECT @result=(SELECT 'songlam.pricing.context.v1' AS [schema],CAST(1 AS bit) AS ratesComplete,CAST(1 AS bit) AS calendarComplete,
 JSON_QUERY(N'{"id":"SONGLAM_OWN_BASE_20261101","version":"1"}') AS calendarSource,
 JSON_QUERY((SELECT CONVERT(varchar(20),h.HotelId) HotelId,h.Currency,h.TimeZoneId,'Asia/Ho_Chi_Minh' TimeZoneIana,
 CONVERT(varchar(8),h.CheckInTime,108) CheckInTime,CONVERT(varchar(8),h.CheckOutTime,108) CheckOutTime FOR JSON PATH,WITHOUT_ARRAY_WRAPPER)) AS hotel,
 JSON_QUERY((SELECT CONVERT(varchar(20),t.RoomTypeId) RoomTypeId,t.MaxOccupancy,t.IsActive FOR JSON PATH,WITHOUT_ARRAY_WRAPPER)) AS roomType,
 JSON_QUERY((SELECT CONVERT(varchar(20),r.RatePlanId) RatePlanId,r.Code,r.StayType,CONVERT(varchar(20),r.PolicyVersionId) PolicyVersionId,r.IsActive FOR JSON PATH,WITHOUT_ARRAY_WRAPPER)) AS ratePlan,
 JSON_QUERY((SELECT CONVERT(varchar(20),v.PolicyVersionId) PolicyVersionId,v.Code,v.Version,CONVERT(varchar(23),v.EffectiveFromUtc,126)+'Z' EffectiveFromUtc,v.RulesJson FOR JSON PATH,WITHOUT_ARRAY_WRAPPER)) AS policy,
 JSON_QUERY((SELECT CONVERT(varchar(20),x.RateRuleId) RateRuleId,CONVERT(varchar(20),x.RatePlanId) RatePlanId,CONVERT(varchar(20),x.RoomTypeId) RoomTypeId,
 CONVERT(char(10),x.ValidFrom,23) ValidFrom,CONVERT(char(10),x.ValidTo,23) ValidTo,x.DayKind,x.Priority,CONVERT(varchar(30),x.PriceVnd) PriceVnd,
 x.IncludedMinutes,x.ExtraBlockMinutes,CONVERT(varchar(30),x.ExtraBlockPriceVnd) ExtraBlockPriceVnd
 FROM pms.RateRule x WHERE x.RoomTypeId=@Type AND x.RatePlanId=@Plan AND x.ValidFrom<@To AND x.ValidTo>@From ORDER BY x.RateRuleId FOR JSON PATH,INCLUDE_NULL_VALUES)) AS rules,
 JSON_QUERY(@calendar) AS calendar
 FROM pms.HotelSettings h JOIN pms.RoomType t ON t.RoomTypeId=@Type JOIN pms.RatePlan r ON r.RatePlanId=@Plan
 JOIN pms.PolicyVersion v ON v.PolicyVersionId=r.PolicyVersionId WHERE h.HotelId=1 AND t.IsActive=1 AND r.IsActive=1
 FOR JSON PATH,WITHOUT_ARRAY_WRAPPER);
 RETURN @result;
END;
GO
-- Shared SQL validation for the published v1 policy. Booking uses this function,
-- never a browser amount or a generic mutation gateway. Node quotes still use G4.
CREATE FUNCTION pms.fn_WebQuotedAmounts(@Type int,@Plan int,@Start datetimeoffset(3),@End datetimeoffset(3))
RETURNS @result TABLE(BaseVnd decimal(19,0),EarlyVnd decimal(19,0),LateVnd decimal(19,0),TotalVnd decimal(19,0),Valid bit)
AS
BEGIN
 DECLARE @from date=CONVERT(date,@Start AT TIME ZONE 'SE Asia Standard Time'),@to date=CONVERT(date,@End AT TIME ZONE 'SE Asia Standard Time'),
 @kind varchar(10),@policy nvarchar(max),@base decimal(19,0)=0,@early decimal(19,0)=0,@late decimal(19,0)=0,@valid bit=1,@date date,
 @rate decimal(19,0),@first decimal(19,0),@last decimal(19,0),@n int,@delay bigint,@side varchar(20),@bands nvarchar(max),@factor decimal(19,0),@den decimal(19,0),@count int;
 SELECT @kind=p.StayType,@policy=v.RulesJson FROM pms.RatePlan p JOIN pms.PolicyVersion v ON v.PolicyVersionId=p.PolicyVersionId WHERE p.RatePlanId=@Plan AND p.IsActive=1;
 IF @End<=@Start OR @End>DATEADD(day,366,@Start) OR @kind IS NULL SET @valid=0;
 IF @kind='NIGHTLY'
 BEGIN
  SET @date=@from;
  IF @to<=@from SET @valid=0;
  WHILE @date<@to AND @valid=1
  BEGIN
   SELECT @n=COUNT(*),@rate=MIN(PriceVnd) FROM pms.RateRule WHERE RatePlanId=@Plan AND RoomTypeId=@Type AND DayKind='BASE' AND ValidFrom<=@date AND ValidTo>@date AND IncludedMinutes IS NULL;
   IF @n<>1 SET @valid=0;
   SET @base+=COALESCE(@rate,0); IF @date=@from SET @first=@rate; SET @last=@rate; SET @date=DATEADD(day,1,@date);
  END;
  SET @side='earlyArrival';
  WHILE @side IS NOT NULL AND @valid=1
  BEGIN
   SET @delay=CASE WHEN @side='earlyArrival' THEN 14*3600000-DATEDIFF_BIG(millisecond,CONVERT(time,'00:00'),CONVERT(time,@Start AT TIME ZONE 'SE Asia Standard Time'))
     ELSE DATEDIFF_BIG(millisecond,CONVERT(time,'00:00'),CONVERT(time,@End AT TIME ZONE 'SE Asia Standard Time'))-12*3600000 END;
   IF @delay>0
   BEGIN
    SET @bands=JSON_QUERY(@policy,'$.'+@side);
    SELECT @count=COUNT(*),@factor=MIN(numerator),@den=MIN(denominator) FROM OPENJSON(@bands)
      WITH(fromMinutes int,toMinutes int,numerator decimal(19,0),denominator decimal(19,0)) b
      WHERE (@side='earlyArrival' AND @delay>CONVERT(bigint,fromMinutes)*60000 AND (toMinutes IS NULL OR @delay<=CONVERT(bigint,toMinutes)*60000))
         OR (@side='lateDeparture' AND @delay>=CONVERT(bigint,fromMinutes)*60000 AND (toMinutes IS NULL OR @delay<CONVERT(bigint,toMinutes)*60000));
    IF @count<>1 OR @den<=0 SET @valid=0;
    ELSE IF @side='earlyArrival' SET @early=FLOOR(CONVERT(decimal(28,6),@first)*@factor/@den+0.5);
    ELSE SET @late=FLOOR(CONVERT(decimal(28,6),@last)*@factor/@den+0.5);
   END;
   SET @side=CASE WHEN @side='earlyArrival' THEN 'lateDeparture' ELSE NULL END;
  END;
 END
 ELSE IF @kind='HOURLY'
 BEGIN
  SELECT @n=COUNT(*),@base=MIN(PriceVnd) FROM pms.RateRule WHERE RatePlanId=@Plan AND RoomTypeId=@Type AND DayKind='BASE'
    AND ValidFrom<=@from AND ValidTo>@from AND IncludedMinutes=360 AND ExtraBlockPriceVnd=0;
  IF @n<>1 OR DATEDIFF_BIG(millisecond,@Start,@End)>360*60000 SET @valid=0;
 END;
 INSERT @result VALUES(COALESCE(@base,0),@early,@late,COALESCE(@base,0)+@early+@late,@valid);
 RETURN;
END;
GO
CREATE FUNCTION pms.fn_WebInventoryUsage(@Type int,@Start datetime2(3),@End datetime2(3))
RETURNS TABLE AS RETURN
WITH Points AS (
 SELECT @Start AtUtc UNION SELECT StartsAtUtc FROM pms.vInventoryDemand WHERE RoomTypeId=@Type AND StartsAtUtc>@Start AND StartsAtUtc<@End
 UNION SELECT EndsAtUtc FROM pms.vInventoryDemand WHERE RoomTypeId=@Type AND EndsAtUtc>@Start AND EndsAtUtc<@End
), Counts AS (
 SELECT p.AtUtc,(SELECT COUNT(*) FROM pms.Room r JOIN pms.RoomType t ON t.RoomTypeId=r.RoomTypeId WHERE r.RoomTypeId=@Type AND r.IsActive=1 AND t.IsActive=1) capacity,
 (SELECT COUNT(*) FROM pms.vInventoryDemand d JOIN pms.BookingRoom b ON b.BookingRoomId=d.BookingRoomId WHERE d.RoomTypeId=@Type AND d.DemandKind='BOOKING' AND b.Status IN('HELD','CONFIRMED') AND d.StartsAtUtc<=p.AtUtc AND d.EndsAtUtc>p.AtUtc) reservedUnreceived,
 (SELECT COUNT(*) FROM pms.vInventoryDemand d JOIN pms.BookingRoom b ON b.BookingRoomId=d.BookingRoomId WHERE d.RoomTypeId=@Type AND d.DemandKind='BOOKING' AND b.Status='IN_HOUSE' AND d.StartsAtUtc<=p.AtUtc AND d.EndsAtUtc>p.AtUtc) occupied,
 (SELECT COUNT(*) FROM pms.Room r WHERE r.RoomTypeId=@Type AND r.IsActive=1 AND (
  EXISTS(SELECT 1 FROM pms.RoomAllocation a WHERE a.RoomId=r.RoomId AND a.BookingRoomId IS NULL AND a.IsCancelled=0 AND a.StartsAtUtc<=p.AtUtc AND a.EndsAtUtc>p.AtUtc)
  OR EXISTS(SELECT 1 FROM pms.MaintenanceTicket t WHERE t.RoomId=r.RoomId AND t.Status IN('OPEN','IN_PROGRESS')))) blocked
 FROM Points p
)
SELECT TOP(1) capacity,reservedUnreceived,occupied,blocked,capacity-reservedUnreceived-occupied-blocked available
FROM Counts ORDER BY reservedUnreceived+occupied+blocked DESC,AtUtc;
GO
CREATE FUNCTION pms.fn_WebZeroDeposits() RETURNS nvarchar(max) AS
BEGIN
 RETURN N'{"collectedVnd":"0","refundedVnd":"0","appliedVnd":"0","retainedVnd":"0","pendingRefundVnd":"0","remainingVnd":"0","receivedAllocationBeforeVnd":"0","receivedAllocationAfterVnd":"0","refundExecution":"NOT_EXECUTED"}';
END;
GO
CREATE FUNCTION pms.fn_WebBookingJson(@BookingId bigint,@Detail bit) RETURNS nvarchar(max) AS
BEGIN
 DECLARE @result nvarchar(max);
 SELECT @result=(SELECT CONVERT(varchar(20),b.BookingId) id,b.Code code,b.BookingKind kind,b.Status status,
 CONVERT(varchar(18),CONVERT(binary(8),b.RowVer),1) version,CONVERT(varchar(20),b.CustomerId) customerId,b.GroupName groupName,b.ContactName contactName,b.ContactPhone contactPhone,
 (SELECT COUNT(*) FROM pms.BookingRoom r WHERE r.BookingId=b.BookingId) roomCount,CONVERT(varchar(23),b.CreatedAtUtc,126)+'Z' createdAtUtc,
 JSON_QUERY(CASE WHEN @Detail=1 THEN (SELECT CONVERT(varchar(20),r.BookingRoomId) id,CONVERT(varchar(20),r.RoomTypeId) roomTypeId,CONVERT(varchar(20),r.RatePlanId) ratePlanId,
 CONVERT(varchar(20),r.PolicyVersionId) policyVersionId,r.StayType stayType,CONVERT(char(10),r.ArrivalDate,23) arrivalDate,CONVERT(char(10),r.DepartureDate,23) departureDate,
 CONVERT(varchar(23),r.StartsAtUtc,126)+'Z' startsAtUtc,CONVERT(varchar(23),r.EndsAtUtc,126)+'Z' endsAtUtc,r.Adults adults,r.Children children,r.Status status,
 CONVERT(varchar(18),CONVERT(binary(8),r.RowVer),1) version,r.CancellationReason cancellationReason,
 CONVERT(varchar(30),r.QuotedTotalVnd) quotedRoomBaseVnd,JSON_VALUE(r.RateSnapshotJson,'$.boundarySurchargesVnd') estimatedBoundarySurchargesVnd,
 JSON_VALUE(r.RateSnapshotJson,'$.accommodationTotalVnd') estimatedAccommodationTotalVnd,CASE WHEN r.Status='HELD' THEN 'ESTIMATE' ELSE 'LOCKED' END priceState,
 JSON_QUERY((SELECT CONVERT(varchar(20),a.AllocationId) id,CONVERT(varchar(20),a.RoomId) roomId,CONVERT(varchar(18),CONVERT(binary(8),a.RowVer),1) version,
 CONVERT(varchar(23),a.StartsAtUtc,126)+'Z' startsAtUtc,CONVERT(varchar(23),a.EndsAtUtc,126)+'Z' endsAtUtc FROM pms.RoomAllocation a WHERE a.BookingRoomId=r.BookingRoomId AND a.IsCancelled=0 ORDER BY a.AllocationId FOR JSON PATH)) allocations,
 JSON_QUERY((SELECT CONVERT(varchar(20),g.CustomerId) customerId,g.IsLead isLead FROM pms.BookingGuest g WHERE g.BookingRoomId=r.BookingRoomId ORDER BY g.CustomerId FOR JSON PATH)) guests
 FROM pms.BookingRoom r WHERE r.BookingId=b.BookingId ORDER BY r.LineNumber FOR JSON PATH,INCLUDE_NULL_VALUES) END) rooms,
 JSON_QUERY(CASE WHEN @Detail=1 AND NOT EXISTS(SELECT 1 FROM pms.Payment WHERE BookingId=b.BookingId)
 AND NOT EXISTS(SELECT 1 FROM pms.DepositAccount WHERE BookingId=b.BookingId) THEN pms.fn_WebZeroDeposits() END) depositSummary
 FROM pms.Booking b WHERE b.BookingId=@BookingId FOR JSON PATH,INCLUDE_NULL_VALUES,WITHOUT_ARRAY_WRAPPER);
 RETURN @result;
END;
