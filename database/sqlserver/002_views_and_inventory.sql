-- Re-runnable definitions. These are database building blocks, NOT complete booking/payment APIs.
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO
CREATE OR ALTER VIEW pms.vRoomStatus AS
SELECT r.RoomId,r.Number,r.RoomTypeId,r.FloorLabel,r.CleanStatus,
       CASE WHEN s.SegmentId IS NULL THEN 'VACANT' ELSE 'OCCUPIED' END AS StayStatus,
       CASE WHEN r.IsActive=0 THEN 'INACTIVE'
            WHEN EXISTS(SELECT 1 FROM pms.RoomAllocation a WHERE a.RoomId=r.RoomId
              AND a.BookingRoomId IS NULL AND a.IsCancelled=0
              AND a.StartsAtUtc<=SYSUTCDATETIME() AND a.EndsAtUtc>SYSUTCDATETIME()) THEN 'MAINTENANCE'
            ELSE 'ACTIVE' END AS ExploitationStatus,
       s.StayId
FROM pms.Room r
LEFT JOIN pms.StayRoomSegment s ON s.RoomId=r.RoomId AND s.DepartedAtUtc IS NULL;
GO
CREATE OR ALTER VIEW pms.vFolioBalance AS
SELECT f.FolioId,f.BookingId,f.BookingRoomId,f.Kind,f.Status,
       COALESCE(SUM(e.SignedAmountVnd),0) AS BalanceVnd
FROM pms.Folio f LEFT JOIN pms.FolioEntry e ON e.FolioId=f.FolioId
GROUP BY f.FolioId,f.BookingId,f.BookingRoomId,f.Kind,f.Status;
GO
CREATE OR ALTER VIEW pms.vDepositBalance AS
SELECT a.DepositAccountId,a.BookingId,a.BookingRoomId,a.Kind,
       COALESCE(SUM(CASE WHEN m.Kind IN ('RECEIVE','UNAPPLY') THEN m.AmountVnd ELSE -m.AmountVnd END),0) AS BalanceVnd
FROM pms.DepositAccount a LEFT JOIN pms.DepositMovement m ON m.DepositAccountId=a.DepositAccountId
GROUP BY a.DepositAccountId,a.BookingId,a.BookingRoomId,a.Kind;
GO
CREATE OR ALTER VIEW pms.vCashFlowDaily AS
SELECT BusinessDate,
       SUM(CASE WHEN Direction='IN' THEN AmountVnd ELSE 0 END) AS CollectedVnd,
       SUM(CASE WHEN Direction='OUT' THEN AmountVnd ELSE 0 END) AS RefundedVnd,
       SUM(CASE WHEN Direction='IN' THEN AmountVnd ELSE -AmountVnd END) AS NetCashFlowVnd
FROM pms.Payment WHERE Status='SUCCEEDED' GROUP BY BusinessDate;
GO
CREATE OR ALTER VIEW pms.vSettledRevenueDaily AS
SELECT BusinessDate,SUM(TotalAmountVnd) AS SettledRevenueVnd,COUNT_BIG(*) AS SettledStays
FROM pms.StaySettlement GROUP BY BusinessDate;
GO
-- Split each booking-room into assigned and unassigned segments. Assignment REPLACES
-- demand for that segment, never adds a second room. Upgrades/transfers consume the
-- actual room type; unassigned gaps consume the requested room type.
CREATE OR ALTER VIEW pms.vInventoryDemand AS
WITH ActiveBooking AS (
    SELECT BookingRoomId,RoomTypeId,StartsAtUtc,EndsAtUtc FROM pms.BookingRoom
    WHERE Status IN ('HELD','CONFIRMED','IN_HOUSE')
), Points AS (
    SELECT BookingRoomId,StartsAtUtc AS AtUtc FROM ActiveBooking
    UNION SELECT BookingRoomId,EndsAtUtc FROM ActiveBooking
    UNION SELECT a.BookingRoomId,a.StartsAtUtc FROM pms.RoomAllocation a
      JOIN ActiveBooking b ON b.BookingRoomId=a.BookingRoomId WHERE a.IsCancelled=0
    UNION SELECT a.BookingRoomId,a.EndsAtUtc FROM pms.RoomAllocation a
      JOIN ActiveBooking b ON b.BookingRoomId=a.BookingRoomId WHERE a.IsCancelled=0
), Segments AS (
    SELECT BookingRoomId,AtUtc AS StartsAtUtc,
           LEAD(AtUtc) OVER(PARTITION BY BookingRoomId ORDER BY AtUtc) AS EndsAtUtc
    FROM Points
)
SELECT b.BookingRoomId,COALESCE(r.RoomTypeId,b.RoomTypeId) AS RoomTypeId,
       s.StartsAtUtc,s.EndsAtUtc,CONVERT(varchar(12),'BOOKING') AS DemandKind
FROM Segments s JOIN ActiveBooking b ON b.BookingRoomId=s.BookingRoomId
LEFT JOIN pms.RoomAllocation a ON a.BookingRoomId=b.BookingRoomId AND a.IsCancelled=0
    AND a.StartsAtUtc<=s.StartsAtUtc AND a.EndsAtUtc>=s.EndsAtUtc
LEFT JOIN pms.Room r ON r.RoomId=a.RoomId
WHERE s.EndsAtUtc IS NOT NULL AND s.StartsAtUtc>=b.StartsAtUtc AND s.EndsAtUtc<=b.EndsAtUtc
UNION ALL
SELECT NULL,r.RoomTypeId,a.StartsAtUtc,a.EndsAtUtc,'BLOCK'
FROM pms.RoomAllocation a JOIN pms.Room r ON r.RoomId=a.RoomId
WHERE a.BookingRoomId IS NULL AND a.IsCancelled=0 AND r.IsActive=1;
GO
CREATE OR ALTER PROCEDURE pms.usp_LockInventory
    @TimeoutMs int = 10000
AS
BEGIN
    SET NOCOUNT ON;
    IF @@TRANCOUNT=0 THROW 51001,'Inventory writes require an explicit transaction.',1;
    IF @TimeoutMs<0 OR @TimeoutMs>30000 THROW 51001,'Lock timeout must be 0..30000 ms.',1;
    DECLARE @result int;
    EXEC @result=sys.sp_getapplock @Resource=N'SongLam:Inventory',
      @LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=@TimeoutMs;
    IF @result<0 THROW 51002,'Could not acquire inventory lock; retry the complete transaction.',1;
END;
GO
CREATE OR ALTER PROCEDURE pms.usp_AssertInventory
AS
BEGIN
    SET NOCOUNT ON;
    IF @@TRANCOUNT=0 OR COALESCE(APPLOCK_MODE('public','SongLam:Inventory','Transaction'),'NoLock')<>'Exclusive'
        THROW 51003,'Acquire inventory lock BEFORE reading or changing inventory.',1;
    -- Use READ COMMITTED, not transaction SNAPSHOT, for the complete transaction.
    IF EXISTS (
        SELECT 1 FROM pms.RoomAllocation a JOIN pms.BookingRoom b ON b.BookingRoomId=a.BookingRoomId
        JOIN pms.Room r ON r.RoomId=a.RoomId
        WHERE a.IsCancelled=0 AND b.Status IN ('HELD','CONFIRMED','IN_HOUSE')
        AND (a.StartsAtUtc<b.StartsAtUtc OR a.EndsAtUtc>b.EndsAtUtc OR r.IsActive=0)
    ) THROW 51004,'Assignment is outside the booking interval or uses an inactive room.',1;

    SELECT a.AllocationId,a.RoomId,a.BookingRoomId,a.StartsAtUtc,a.EndsAtUtc
    INTO #ActiveAllocation FROM pms.RoomAllocation a
    LEFT JOIN pms.BookingRoom b ON b.BookingRoomId=a.BookingRoomId
    WHERE a.IsCancelled=0 AND (a.BookingRoomId IS NULL OR b.Status IN ('HELD','CONFIRMED','IN_HOUSE'));

    IF EXISTS (
        SELECT 1 FROM #ActiveAllocation a JOIN #ActiveAllocation b ON a.AllocationId<b.AllocationId
        AND (a.RoomId=b.RoomId OR a.BookingRoomId=b.BookingRoomId)
        AND a.StartsAtUtc<b.EndsAtUtc AND b.StartsAtUtc<a.EndsAtUtc
    ) THROW 51005,'Overlapping room assignments or maintenance blocks.',1;

    -- Sweep event boundaries. Summing deltas at the same instant preserves [start,end).
    -- Checking only how many bookings intersect a whole date range is incorrect.
    DECLARE @overbooked bit=0;
    ;WITH Events AS (
        SELECT RoomTypeId,StartsAtUtc AS AtUtc,1 AS Delta FROM pms.vInventoryDemand
        UNION ALL SELECT RoomTypeId,EndsAtUtc,-1 FROM pms.vInventoryDemand
    ), Deltas AS (
        SELECT RoomTypeId,AtUtc,SUM(Delta) AS Delta FROM Events GROUP BY RoomTypeId,AtUtc
    ), Usage AS (
        SELECT RoomTypeId,AtUtc,SUM(Delta) OVER(PARTITION BY RoomTypeId ORDER BY AtUtc ROWS UNBOUNDED PRECEDING) AS Used
        FROM Deltas
    ), Capacity AS (
        SELECT rt.RoomTypeId,COUNT(r.RoomId) AS Total FROM pms.RoomType rt
        LEFT JOIN pms.Room r ON r.RoomTypeId=rt.RoomTypeId AND r.IsActive=1 AND rt.IsActive=1
        GROUP BY rt.RoomTypeId
    )
    SELECT TOP(1) @overbooked=1 FROM Usage u JOIN Capacity c ON c.RoomTypeId=u.RoomTypeId WHERE u.Used>c.Total;
    IF @overbooked=1 THROW 51006,'Room type capacity exceeded, including unassigned bookings and blocks.',1;
END;
GO
-- Append-only history; corrections must be additional, linked entries.
CREATE OR ALTER TRIGGER pms.tr_FolioEntry_Immutable ON pms.FolioEntry INSTEAD OF UPDATE, DELETE AS
BEGIN
    THROW 51010,'Folio entries are immutable; post a linked correction.',1;
END;
GO
CREATE OR ALTER TRIGGER pms.tr_DepositMovement_Immutable ON pms.DepositMovement INSTEAD OF UPDATE, DELETE AS
BEGIN
    THROW 51010,'Deposit movements are immutable; post a linked correction.',1;
END;
GO
CREATE OR ALTER TRIGGER pms.tr_AuditLog_Immutable ON pms.AuditLog INSTEAD OF UPDATE, DELETE AS
BEGIN
    THROW 51010,'Audit history is immutable.',1;
END;
GO
CREATE OR ALTER TRIGGER pms.tr_StaySettlement_Immutable ON pms.StaySettlement INSTEAD OF UPDATE, DELETE AS
BEGIN
    THROW 51010,'Checkout snapshot is immutable; use financial adjustment entries.',1;
END;
GO
