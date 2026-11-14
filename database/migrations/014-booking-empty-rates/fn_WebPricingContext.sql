
ALTER FUNCTION pms.fn_WebPricingContext(@Type int,@Plan int,@From date,@To date) RETURNS nvarchar(max)
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
 JSON_QUERY(COALESCE((SELECT CONVERT(varchar(20),x.RateRuleId) RateRuleId,CONVERT(varchar(20),x.RatePlanId) RatePlanId,CONVERT(varchar(20),x.RoomTypeId) RoomTypeId,
 CONVERT(char(10),x.ValidFrom,23) ValidFrom,CONVERT(char(10),x.ValidTo,23) ValidTo,x.DayKind,x.Priority,CONVERT(varchar(30),x.PriceVnd) PriceVnd,
 x.IncludedMinutes,x.ExtraBlockMinutes,CONVERT(varchar(30),x.ExtraBlockPriceVnd) ExtraBlockPriceVnd
 FROM pms.RateRule x WHERE x.RoomTypeId=@Type AND x.RatePlanId=@Plan AND x.ValidFrom<@To AND x.ValidTo>@From ORDER BY x.RateRuleId FOR JSON PATH,INCLUDE_NULL_VALUES),N'[]')) AS rules,
 JSON_QUERY(@calendar) AS calendar
 FROM pms.HotelSettings h JOIN pms.RoomType t ON t.RoomTypeId=@Type JOIN pms.RatePlan r ON r.RatePlanId=@Plan
 JOIN pms.PolicyVersion v ON v.PolicyVersionId=r.PolicyVersionId WHERE h.HotelId=1 AND t.IsActive=1 AND r.IsActive=1
 FOR JSON PATH,WITHOUT_ARRAY_WRAPPER);
 RETURN REPLACE(@result,N'\/',N'/');
END;
