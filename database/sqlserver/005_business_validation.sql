-- Version 2, part 2. Checks the FINAL state of an atomic business command.
CREATE OR ALTER PROCEDURE pms.usp_AssertBusinessState
AS
BEGIN
 SET NOCOUNT ON;
 EXEC pms.usp_AssertInventory;
 IF EXISTS(SELECT 1 FROM pms.HotelSettings h LEFT JOIN pms.BusinessDay d ON d.BusinessDate=h.WorkingDate
           WHERE d.Status<>'OPEN') THROW 52100,'Working date must be the open business day.',1;
 IF EXISTS(SELECT 1 FROM pms.Booking b WHERE NOT EXISTS(SELECT 1 FROM pms.BookingRoom r WHERE r.BookingId=b.BookingId))
   THROW 52101,'A booking must contain at least one room.',1;
 IF EXISTS(SELECT 1 FROM pms.BookingRoom b JOIN pms.RoomType t ON t.RoomTypeId=b.RoomTypeId
     WHERE b.Adults+b.Children>t.MaxOccupancy OR
       b.ArrivalDate<>CONVERT(date,DATEADD(hour,7,b.StartsAtUtc)) OR b.DepartureDate<>CONVERT(date,DATEADD(hour,7,b.EndsAtUtc)))
   THROW 52102,'Capacity or local booking dates do not match the interval.',1;
 IF EXISTS(SELECT 1 FROM pms.BookingRoom b OUTER APPLY(
       SELECT COUNT(*) n,SUM(PriceVnd) total,MIN(NightDate) firstNight,MAX(NightDate) lastNight
       FROM pms.BookingNightRate x WHERE x.BookingRoomId=b.BookingRoomId) p
     WHERE b.StayType='NIGHTLY' AND (p.n<>DATEDIFF(day,b.ArrivalDate,b.DepartureDate)
       OR p.total<>b.QuotedTotalVnd OR p.firstNight<>b.ArrivalDate OR p.lastNight<>DATEADD(day,-1,b.DepartureDate)))
   THROW 52103,'Nightly quote must match a complete price snapshot for every night.',1;
 IF EXISTS(SELECT 1 FROM pms.BookingRoom b CROSS APPLY(SELECT
       TRY_CONVERT(int,JSON_VALUE(b.RateSnapshotJson,'$.includedMinutes')) included,
       TRY_CONVERT(int,JSON_VALUE(b.RateSnapshotJson,'$.extraMinutes')) blockMinutes,
       TRY_CONVERT(decimal(19,0),JSON_VALUE(b.RateSnapshotJson,'$.baseVnd')) baseVnd,
       TRY_CONVERT(decimal(19,0),JSON_VALUE(b.RateSnapshotJson,'$.extraVnd')) extraVnd) p
     WHERE b.StayType='HOURLY' AND (p.included IS NULL OR p.included<=0 OR p.blockMinutes IS NULL OR p.blockMinutes<=0
       OR p.baseVnd IS NULL OR p.baseVnd<0 OR p.extraVnd IS NULL OR p.extraVnd<0 OR
       b.QuotedTotalVnd<>p.baseVnd+CASE WHEN DATEDIFF_BIG(millisecond,b.StartsAtUtc,b.EndsAtUtc)>CONVERT(bigint,p.included)*60000
         THEN CEILING((DATEDIFF_BIG(millisecond,b.StartsAtUtc,b.EndsAtUtc)-CONVERT(bigint,p.included)*60000)/60000.0/NULLIF(p.blockMinutes,0))*p.extraVnd ELSE 0 END))
   THROW 52104,'Hourly quote must match its explicit minute-block price snapshot.',1;
 IF EXISTS(SELECT 1 FROM pms.BookingRoom b JOIN pms.RatePlan r ON r.RatePlanId=b.RatePlanId
     WHERE b.StayType<>r.StayType OR b.PolicyVersionId IS NULL OR b.PolicyVersionId<>r.PolicyVersionId)
   THROW 52105,'Rate plan and policy snapshot mismatch.',1;
 IF EXISTS(SELECT 1 FROM pms.BookingRoom WHERE RatePlanId IS NULL OR PolicyVersionId IS NULL)
   THROW 52105,'Every booking room requires its agreed rate plan and policy version.',1;
 IF EXISTS(SELECT 1 FROM pms.BookingNightRate n JOIN pms.BookingRoom b ON b.BookingRoomId=n.BookingRoomId WHERE b.StayType='HOURLY')
   THROW 52105,'Hourly bookings cannot also carry nightly prices.',1;
 IF EXISTS(SELECT 1 FROM pms.RateRule a JOIN pms.RateRule b ON a.RateRuleId<b.RateRuleId
    AND a.RoomTypeId=b.RoomTypeId AND a.RatePlanId=b.RatePlanId AND a.DayKind=b.DayKind AND a.Priority=b.Priority
    AND a.ValidFrom<b.ValidTo AND b.ValidFrom<a.ValidTo)
   THROW 52105,'Rate rules with the same priority and day kind must not overlap.',1;
 IF EXISTS(SELECT 1 FROM pms.RoomAllocation a JOIN pms.BookingRoom b ON b.BookingRoomId=a.BookingRoomId
     JOIN pms.Room r ON r.RoomId=a.RoomId JOIN pms.RoomType t ON t.RoomTypeId=r.RoomTypeId
     WHERE a.IsCancelled=0 AND b.Status IN ('HELD','CONFIRMED','IN_HOUSE') AND b.Adults+b.Children>t.MaxOccupancy)
   THROW 52106,'Assigned room cannot accommodate the booked guests.',1;
 IF EXISTS(SELECT 1 FROM pms.RoomAllocation a JOIN pms.MaintenanceTicket t ON t.TicketId=a.TicketId WHERE a.RoomId<>t.RoomId)
   THROW 52107,'Maintenance block belongs to another room.',1;
 IF EXISTS(SELECT 1 FROM pms.Stay s JOIN pms.BookingRoom b ON b.BookingRoomId=s.BookingRoomId
     WHERE (s.Status='IN_HOUSE' AND (b.Status<>'IN_HOUSE' OR s.ExpectedOutAtUtc<>b.EndsAtUtc OR s.CheckedInAtUtc<b.StartsAtUtc
       OR (SELECT COUNT(*) FROM pms.StayRoomSegment g WHERE g.StayId=s.StayId AND g.DepartedAtUtc IS NULL)<>1))
     OR (s.Status='CHECKED_OUT' AND (b.Status<>'COMPLETED' OR EXISTS(SELECT 1 FROM pms.StayRoomSegment g WHERE g.StayId=s.StayId AND g.DepartedAtUtc IS NULL)
       OR NOT EXISTS(SELECT 1 FROM pms.StaySettlement x WHERE x.StayId=s.StayId))))
   THROW 52108,'Stay, booking, current room and checkout snapshot must agree.',1;
 IF EXISTS(SELECT 1 FROM pms.BookingRoom b WHERE b.Status IN ('IN_HOUSE','COMPLETED')
       AND NOT EXISTS(SELECT 1 FROM pms.Stay s WHERE s.BookingRoomId=b.BookingRoomId))
   THROW 52109,'An occupied/completed booking room requires a stay.',1;
 IF EXISTS(SELECT 1 FROM pms.StayRoomSegment g JOIN pms.Stay s ON s.StayId=g.StayId
     JOIN pms.RoomAllocation a ON a.AllocationId=g.AllocationId JOIN pms.Room r ON r.RoomId=g.RoomId
     WHERE a.BookingRoomId IS NULL OR a.BookingRoomId<>s.BookingRoomId OR g.ArrivedAtUtc<s.CheckedInAtUtc
       OR g.ArrivedAtUtc<a.StartsAtUtc OR g.ArrivedAtUtc>=a.EndsAtUtc
       OR (g.DepartedAtUtc IS NULL AND (a.IsCancelled=1 OR r.IsActive=0 OR a.EndsAtUtc<s.ExpectedOutAtUtc))
       OR (s.CheckedOutAtUtc IS NOT NULL AND (g.DepartedAtUtc IS NULL OR g.DepartedAtUtc>s.CheckedOutAtUtc)))
   THROW 52110,'Stay segment is not linked to its own valid room allocation.',1;
 IF EXISTS(SELECT 1 FROM pms.StayRoomSegment a JOIN pms.StayRoomSegment b ON a.SegmentId<b.SegmentId
     AND (a.RoomId=b.RoomId OR a.StayId=b.StayId)
     AND a.ArrivedAtUtc<COALESCE(b.DepartedAtUtc,CONVERT(datetime2,'9999-12-31'))
     AND b.ArrivedAtUtc<COALESCE(a.DepartedAtUtc,CONVERT(datetime2,'9999-12-31')))
   THROW 52111,'Actual room occupancy segments overlap.',1;
 IF EXISTS(SELECT 1 FROM pms.Stay s JOIN pms.BookingRoom b ON b.BookingRoomId=s.BookingRoomId
     WHERE NOT EXISTS(SELECT 1 FROM pms.StayGuest g WHERE g.StayId=s.StayId AND g.IsLead=1)
       OR (SELECT COUNT(*) FROM pms.StayGuest g WHERE g.StayId=s.StayId)>b.Adults+b.Children)
   THROW 52112,'Stay requires a lead guest and must respect its declared guest count.',1;
 IF EXISTS(SELECT 1 FROM pms.StayGuest g JOIN pms.Stay s ON s.StayId=g.StayId
     WHERE g.ArrivedAtUtc<s.CheckedInAtUtc OR (s.Status='CHECKED_OUT' AND (g.DepartedAtUtc IS NULL OR g.DepartedAtUtc>s.CheckedOutAtUtc)))
   THROW 52113,'Guest attendance is outside its stay.',1;
 IF EXISTS(SELECT 1 FROM pms.Stay s JOIN pms.StayRoomSegment g ON g.StayId=s.StayId
     WHERE s.Status='CHECKED_OUT' AND NOT EXISTS(SELECT 1 FROM pms.MinibarAudit m
       WHERE m.StayId=s.StayId AND m.RoomId=g.RoomId AND m.Status='CONFIRMED' AND m.CheckedAtUtc>=g.ArrivedAtUtc))
   THROW 52114,'Checkout requires confirmed minibar inspection for every occupied room.',1;
 IF EXISTS(SELECT 1 FROM pms.MinibarAudit m WHERE NOT EXISTS(SELECT 1 FROM pms.StayRoomSegment g
     WHERE g.StayId=m.StayId AND g.RoomId=m.RoomId AND m.CheckedAtUtc>=g.ArrivedAtUtc))
   THROW 52115,'Minibar inspection does not belong to an occupied room.',1;
 IF EXISTS(SELECT 1 FROM pms.MinibarAuditLine l JOIN pms.MinibarAudit a ON a.MinibarAuditId=l.MinibarAuditId
     JOIN pms.Service v ON v.ServiceId=l.ServiceId
     LEFT JOIN pms.ServiceOrderLine sl ON sl.ServiceOrderLineId=l.ServiceOrderLineId
     LEFT JOIN pms.ServiceOrder so ON so.ServiceOrderId=sl.ServiceOrderId
     WHERE v.Category<>'MINIBAR' OR (a.Status='CONFIRMED' AND l.ConsumedQuantity>0 AND
       (sl.ServiceOrderLineId IS NULL OR sl.ServiceId<>l.ServiceId OR sl.Quantity<>l.ConsumedQuantity OR so.StayId<>a.StayId OR so.Status<>'DELIVERED')))
   THROW 52116,'Consumed minibar items must have matching delivered service lines.',1;
 IF EXISTS(SELECT 1 FROM pms.ServiceOrder o WHERE NOT EXISTS(SELECT 1 FROM pms.ServiceOrderLine l WHERE l.ServiceOrderId=o.ServiceOrderId))
   THROW 52117,'Service order must contain lines.',1;
 IF EXISTS(SELECT 1 FROM pms.ServiceOrderLine l JOIN pms.ServiceOrder o ON o.ServiceOrderId=l.ServiceOrderId
     LEFT JOIN pms.FolioEntry e ON e.ServiceOrderLineId=l.ServiceOrderLineId
     WHERE o.Status IN ('DELIVERED','CANCELLED') AND (e.FolioEntryId IS NULL OR e.AmountVnd<>l.AmountVnd OR e.StayId IS NULL OR e.StayId<>o.StayId OR e.Category<>'SERVICE'))
   THROW 52118,'Delivered service requires exactly one matching charge.',1;
 IF EXISTS(SELECT 1 FROM pms.ServiceOrder o JOIN pms.ServiceOrderLine l ON l.ServiceOrderId=o.ServiceOrderId
     JOIN pms.FolioEntry e ON e.ServiceOrderLineId=l.ServiceOrderLineId
     WHERE o.Status='CANCELLED' AND COALESCE((SELECT SUM(c.AmountVnd) FROM pms.FolioEntry c WHERE c.ReversesEntryId=e.FolioEntryId),0)<>e.AmountVnd)
   THROW 52119,'Cancelling delivered services requires a full linked credit.',1;

 -- MONEY: every successful cash movement is allocated exactly once in total.
 IF EXISTS(SELECT 1 FROM pms.Payment p OUTER APPLY(
     SELECT SUM(x.AmountVnd) amount FROM (
       SELECT AmountVnd FROM pms.FolioEntry e WHERE e.PaymentId=p.PaymentId
       UNION ALL SELECT AmountVnd FROM pms.DepositMovement d WHERE d.PaymentId=p.PaymentId) x) a
     WHERE (p.Status='SUCCEEDED' AND COALESCE(a.amount,0)<>p.AmountVnd)
       OR (p.Status<>'SUCCEEDED' AND COALESCE(a.amount,0)<>0))
   THROW 52200,'Successful payments must be fully allocated; pending/failed payments cannot be spent.',1;
 IF EXISTS(SELECT 1 FROM pms.Payment p JOIN pms.ApiRequest q ON q.RequestId=p.RequestId
     WHERE p.RecordedBy<>q.ActorId)
   THROW 52201,'Payment actor must match its idempotent request.',1;
 IF EXISTS(SELECT 1 FROM pms.Payment p LEFT JOIN pms.CashierShift s ON s.ShiftId=p.ShiftId
     WHERE p.Method='CASH' AND (s.ShiftId IS NULL OR s.CashierId<>p.RecordedBy OR s.BusinessDate<>p.BusinessDate))
   THROW 52202,'Cash payment must belong to its cashier shift and business date.',1;
 IF EXISTS(SELECT 1 FROM pms.Payment p JOIN pms.Payment o ON o.PaymentId=p.OriginalPaymentId
     JOIN pms.RefundRequest r ON r.RefundRequestId=p.RefundRequestId
     WHERE p.Direction='OUT' AND (o.Direction<>'IN' OR o.Status<>'SUCCEEDED' OR o.BookingId<>p.BookingId
       OR r.OriginalPaymentId<>o.PaymentId OR r.AmountVnd<>p.AmountVnd
       OR (p.Status='SUCCEEDED' AND (r.Status<>'COMPLETED' OR r.RefundPaymentId IS NULL OR r.RefundPaymentId<>p.PaymentId))
       OR (p.Status='PENDING' AND r.Status<>'APPROVED')))
   THROW 52203,'Refund payout must match the approved source, amount and completed request.',1;
 IF EXISTS(SELECT 1 FROM pms.RefundRequest r JOIN pms.Payment p ON p.PaymentId=r.OriginalPaymentId
     LEFT JOIN pms.Folio f ON f.FolioId=r.FolioId LEFT JOIN pms.DepositAccount a ON a.DepositAccountId=r.DepositAccountId
     WHERE p.Direction<>'IN' OR p.Status<>'SUCCEEDED' OR COALESCE(f.BookingId,a.BookingId)<>p.BookingId
       OR (r.FolioId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM pms.FolioEntry e WHERE e.FolioId=r.FolioId AND e.PaymentId=p.PaymentId AND e.Kind='PAYMENT'))
       OR (r.DepositAccountId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM pms.DepositMovement m WHERE m.DepositAccountId=r.DepositAccountId AND m.PaymentId=p.PaymentId AND m.Kind='RECEIVE')))
   THROW 52204,'Refund must target the original payment allocation.',1;
 IF EXISTS(SELECT 1 FROM pms.RefundRequest r JOIN pms.Payment p ON p.PaymentId=r.OriginalPaymentId
     WHERE r.Status IN ('PENDING','APPROVED','COMPLETED') GROUP BY p.PaymentId,p.AmountVnd HAVING SUM(r.AmountVnd)>p.AmountVnd)
   THROW 52205,'Completed and reserved refunds exceed the original receipt.',1;
 IF EXISTS(SELECT 1 FROM pms.RefundRequest r WHERE r.Status IN ('PENDING','APPROVED','COMPLETED')
     GROUP BY r.OriginalPaymentId,r.FolioId,r.DepositAccountId
     HAVING SUM(r.AmountVnd)>CASE WHEN r.FolioId IS NOT NULL THEN COALESCE((SELECT SUM(e.AmountVnd) FROM pms.FolioEntry e
       WHERE e.PaymentId=r.OriginalPaymentId AND e.FolioId=r.FolioId AND e.Kind='PAYMENT'),0)
       ELSE COALESCE((SELECT SUM(m.AmountVnd) FROM pms.DepositMovement m
       WHERE m.PaymentId=r.OriginalPaymentId AND m.DepositAccountId=r.DepositAccountId AND m.Kind='RECEIVE'),0) END)
   THROW 52205,'Refund reservations exceed this specific original allocation.',1;
 IF EXISTS(SELECT 1 FROM pms.RefundRequest r LEFT JOIN pms.Payment p ON p.PaymentId=r.RefundPaymentId
     WHERE r.Status='COMPLETED' AND (p.Status<>'SUCCEEDED' OR p.Direction<>'OUT' OR p.RefundRequestId<>r.RefundRequestId))
   THROW 52206,'Completed refund requires its successful payout.',1;
 IF EXISTS(SELECT 1 FROM pms.vDepositBalance b WHERE b.BalanceVnd < COALESCE((SELECT SUM(r.AmountVnd)
     FROM pms.RefundRequest r WHERE r.DepositAccountId=b.DepositAccountId AND r.Status IN ('PENDING','APPROVED')),0))
   THROW 52207,'Deposit cannot be negative or consume money reserved for refunds.',1;
 IF EXISTS(SELECT 1 FROM pms.vFolioBalance b CROSS APPLY(SELECT SUM(r.AmountVnd) reserved
     FROM pms.RefundRequest r WHERE r.FolioId=b.FolioId AND r.Status IN ('PENDING','APPROVED')) r
     WHERE r.reserved>0 AND -b.BalanceVnd<r.reserved)
   THROW 52208,'Folio refunds exceed customer credit available after other operations.',1;
 IF EXISTS(SELECT 1 FROM pms.DepositMovement m JOIN pms.DepositAccount a ON a.DepositAccountId=m.DepositAccountId
     JOIN pms.Payment p ON p.PaymentId=m.PaymentId LEFT JOIN pms.RefundRequest r ON r.RefundRequestId=p.RefundRequestId
     WHERE p.Status<>'SUCCEEDED' OR p.BookingId<>a.BookingId
       OR (m.Kind='RECEIVE' AND (p.Direction<>'IN' OR p.Purpose<>CASE WHEN a.Kind='BOOKING' THEN 'BOOKING_DEPOSIT' ELSE 'GUARANTEE_DEPOSIT' END))
       OR (m.Kind='REFUND' AND (p.Direction<>'OUT' OR r.DepositAccountId IS NULL OR r.DepositAccountId<>a.DepositAccountId)))
   THROW 52209,'Deposit cash movement does not match its successful payment.',1;
 IF EXISTS(SELECT 1 FROM pms.DepositMovement m LEFT JOIN pms.FolioEntry e ON e.DepositMovementId=m.DepositMovementId
     JOIN pms.DepositAccount a ON a.DepositAccountId=m.DepositAccountId LEFT JOIN pms.Folio f ON f.FolioId=e.FolioId
     WHERE m.Kind IN ('APPLY','UNAPPLY') AND (e.FolioEntryId IS NULL OR e.AmountVnd<>m.AmountVnd
       OR e.Kind<>CASE WHEN m.Kind='APPLY' THEN 'DEPOSIT_APPLY' ELSE 'DEPOSIT_UNAPPLY' END OR f.BookingId<>a.BookingId
       OR (a.Kind='GUARANTEE' AND (f.BookingRoomId IS NULL OR f.BookingRoomId<>a.BookingRoomId))))
   THROW 52210,'Deposit application must have one matching folio entry in the correct booking.',1;
 IF EXISTS(SELECT 1 FROM pms.DepositMovement m JOIN pms.DepositMovement o ON o.DepositMovementId=m.ReversesMovementId
     JOIN pms.FolioEntry me ON me.DepositMovementId=m.DepositMovementId JOIN pms.FolioEntry oe ON oe.DepositMovementId=o.DepositMovementId
     WHERE m.Kind<>'UNAPPLY' OR o.Kind<>'APPLY' OR m.AmountVnd<>o.AmountVnd OR m.DepositAccountId<>o.DepositAccountId OR me.FolioId<>oe.FolioId)
   THROW 52211,'Deposit reversal must exactly undo its original application.',1;
 IF EXISTS(SELECT 1 FROM pms.FolioEntry e JOIN pms.Folio f ON f.FolioId=e.FolioId
     LEFT JOIN pms.Payment p ON p.PaymentId=e.PaymentId LEFT JOIN pms.RefundRequest r ON r.RefundRequestId=p.RefundRequestId
     LEFT JOIN pms.Stay s ON s.StayId=e.StayId LEFT JOIN pms.BookingRoom b ON b.BookingRoomId=s.BookingRoomId
     WHERE (e.PaymentId IS NOT NULL AND (p.Status<>'SUCCEEDED' OR p.BookingId<>f.BookingId
         OR (e.Kind='PAYMENT' AND (p.Direction<>'IN' OR p.Purpose NOT IN ('SETTLEMENT','SERVICE')))
         OR (e.Kind='REFUND' AND (p.Direction<>'OUT' OR r.FolioId IS NULL OR r.FolioId<>f.FolioId))))
       OR (e.StayId IS NOT NULL AND (b.BookingId<>f.BookingId OR (f.BookingRoomId IS NOT NULL AND f.BookingRoomId<>b.BookingRoomId))))
   THROW 52212,'Folio entries cannot use another booking, stay or payment.',1;
 IF EXISTS(SELECT 1 FROM pms.FolioEntry e JOIN pms.DepositMovement m ON m.DepositMovementId=e.DepositMovementId
     WHERE m.Kind NOT IN ('APPLY','UNAPPLY')) THROW 52213,'Cash deposit movements cannot be applied as folio credits.',1;
 IF EXISTS(SELECT 1 FROM pms.FolioEntry e JOIN pms.FolioEntry o ON o.FolioEntryId=e.ReversesEntryId
     WHERE o.Kind<>'CHARGE' OR e.FolioId<>o.FolioId OR e.Category<>o.Category OR ISNULL(e.StayId,0)<>ISNULL(o.StayId,0))
   THROW 52214,'Charge credit must reference the same folio, stay and category.',1;
 IF EXISTS(SELECT 1 FROM pms.FolioEntry e JOIN pms.FolioEntry o ON o.FolioEntryId=e.ReversesEntryId
     GROUP BY o.FolioEntryId,o.AmountVnd HAVING SUM(e.AmountVnd)>o.AmountVnd)
   THROW 52215,'Total credits exceed the original charge.',1;
 IF EXISTS(SELECT 1 FROM pms.FolioEntry WHERE Kind='CHARGE_CREDIT' AND ReversesEntryId IS NULL AND Category<>'DISCOUNT')
   THROW 52216,'Non-discount charge credits require a source charge.',1;
 IF EXISTS(SELECT 1 FROM pms.FolioEntry e JOIN pms.Folio f ON f.FolioId=e.FolioId WHERE e.TransferPairId IS NOT NULL
     GROUP BY e.TransferPairId HAVING COUNT(*)<>2 OR SUM(e.SignedAmountVnd)<>0 OR COUNT(DISTINCT e.FolioId)<>2 OR COUNT(DISTINCT f.BookingId)<>1)
   THROW 52217,'Folio transfer must contain two balanced sides within one booking.',1;
 IF EXISTS(SELECT 1 FROM pms.vFolioBalance WHERE Status='CLOSED' AND BalanceVnd<>0)
   THROW 52218,'A folio with debt or customer credit cannot be closed.',1;
 IF EXISTS(SELECT 1 FROM pms.FolioEntry WHERE Kind IN ('CHARGE','CHARGE_CREDIT')
     GROUP BY FolioId HAVING SUM(SignedAmountVnd)<0)
   THROW 52219,'Discounts and charge credits cannot exceed charges.',1;
 IF EXISTS(SELECT 1 FROM pms.Stay s JOIN pms.BookingRoom b ON b.BookingRoomId=s.BookingRoomId
     OUTER APPLY(SELECT SUM(SignedAmountVnd) roomTotal FROM pms.FolioEntry e WHERE e.StayId=s.StayId AND e.Category='ROOM') a
     WHERE COALESCE(a.roomTotal,0)<>b.QuotedTotalVnd)
   THROW 52220,'Net room charges must equal the agreed nightly/hourly quote.',1;
 IF EXISTS(SELECT 1 FROM pms.StaySettlement x JOIN pms.Stay s ON s.StayId=x.StayId
     OUTER APPLY(SELECT SUM(CASE WHEN Category='ROOM' THEN SignedAmountVnd ELSE 0 END) roomTotal,
        SUM(CASE WHEN Category='SERVICE' THEN SignedAmountVnd ELSE 0 END) serviceTotal,
        SUM(CASE WHEN Category IN ('SURCHARGE','CANCELLATION') THEN SignedAmountVnd ELSE 0 END) surchargeTotal,
        -SUM(CASE WHEN Category='DISCOUNT' THEN SignedAmountVnd ELSE 0 END) discountTotal
       FROM pms.FolioEntry e WHERE e.StayId=s.StayId AND e.Kind IN ('CHARGE','CHARGE_CREDIT')) p
     WHERE s.Status<>'CHECKED_OUT' OR x.RoomAmountVnd<>COALESCE(p.roomTotal,0) OR x.ServiceAmountVnd<>COALESCE(p.serviceTotal,0)
       OR x.SurchargeVnd<>COALESCE(p.surchargeTotal,0) OR x.DiscountVnd<>COALESCE(p.discountTotal,0))
   THROW 52221,'Checkout snapshot must match the actual posted charges.',1;
 IF EXISTS(SELECT 1 FROM pms.Stay s JOIN pms.Folio f ON f.BookingRoomId=s.BookingRoomId
     JOIN pms.vFolioBalance v ON v.FolioId=f.FolioId WHERE s.Status='CHECKED_OUT' AND v.BalanceVnd>0)
   THROW 52222,'Checkout cannot leave personal debt; transfer eligible group debt to master first.',1;

 -- DOCUMENTS, SHIFTS AND BUSINESS DAY CLOSURE.
 IF EXISTS(SELECT 1 FROM pms.Invoice i OUTER APPLY(SELECT COUNT(*) n,SUM(NetVnd) net,SUM(TaxVnd) tax,SUM(TotalVnd) total
       FROM pms.InvoiceLine l WHERE l.InvoiceId=i.InvoiceId) a
     WHERE i.Status='ISSUED' AND (a.n=0 OR a.net<>i.NetVnd OR a.tax<>i.TaxVnd OR a.total<>i.TotalVnd))
   THROW 52300,'Issued invoice header must equal its complete line totals.',1;
 IF EXISTS(SELECT 1 FROM pms.InvoiceLine l JOIN pms.Invoice i ON i.InvoiceId=l.InvoiceId
     JOIN pms.FolioEntry e ON e.FolioEntryId=l.FolioEntryId WHERE e.FolioId<>i.FolioId OR e.Kind NOT IN ('CHARGE','CHARGE_CREDIT')
       OR (i.DocumentKind<>'ADJUSTMENT' AND l.TotalVnd<>e.SignedAmountVnd))
   THROW 52301,'Invoice line must refer to a matching charge in its own folio.',1;
 IF EXISTS(SELECT 1 FROM pms.Invoice i JOIN pms.InvoiceLine l ON l.InvoiceId=i.InvoiceId
     WHERE i.Status='ISSUED' AND l.FolioEntryId IS NULL)
   THROW 52301,'Issued documents must be based on posted folio charges.',1;
 IF EXISTS(SELECT 1 FROM pms.InvoiceLine l JOIN pms.Invoice i ON i.InvoiceId=l.InvoiceId
     WHERE i.Status='ISSUED' AND i.DocumentKind<>'ADJUSTMENT' AND l.FolioEntryId IS NOT NULL
     GROUP BY l.FolioEntryId,i.DocumentKind HAVING COUNT(*)>1)
   THROW 52302,'Charge is already included in an issued document of this kind.',1;
 IF EXISTS(SELECT 1 FROM pms.InvoiceLine WHERE NetVnd<>ROUND(Quantity*UnitPriceVnd,0)
     OR (TaxRate IS NOT NULL AND TaxVnd<>ROUND(NetVnd*TaxRate/100,0)))
   THROW 52303,'Invoice quantities, unit prices and tax do not reconcile.',1;
 IF EXISTS(SELECT 1 FROM pms.CashierShift s OUTER APPLY(SELECT SUM(CASE WHEN Direction='IN' THEN AmountVnd ELSE -AmountVnd END) cash
       FROM pms.Payment p WHERE p.ShiftId=s.ShiftId AND p.Status='SUCCEEDED' AND p.Method='CASH') a
     WHERE s.ClosedAtUtc IS NOT NULL AND (s.ExpectedCashVnd<>s.OpeningCashVnd+COALESCE(a.cash,0)
       OR (s.CountedCashVnd<>s.ExpectedCashVnd AND NULLIF(LTRIM(RTRIM(s.Notes)),'') IS NULL)
       OR EXISTS(SELECT 1 FROM pms.Payment p WHERE p.ShiftId=s.ShiftId AND p.Status='PENDING')))
   THROW 52304,'Closed shift must reconcile cash and resolve pending payments.',1;
 IF EXISTS(SELECT 1 FROM pms.BusinessDay d LEFT JOIN pms.vCashFlowDaily c ON c.BusinessDate=d.BusinessDate
     LEFT JOIN pms.vSettledRevenueDaily r ON r.BusinessDate=d.BusinessDate
     WHERE d.Status='CLOSED' AND (d.CollectedVnd IS NULL OR d.RefundedVnd IS NULL OR d.SettledRevenueVnd IS NULL OR d.OutstandingVnd IS NULL
       OR d.CollectedVnd<>COALESCE(c.CollectedVnd,0) OR d.RefundedVnd<>COALESCE(c.RefundedVnd,0)
       OR d.SettledRevenueVnd<>COALESCE(r.SettledRevenueVnd,0)
       OR EXISTS(SELECT 1 FROM pms.CashierShift s WHERE s.BusinessDate=d.BusinessDate AND s.ClosedAtUtc IS NULL)
       OR EXISTS(SELECT 1 FROM pms.Payment p WHERE p.BusinessDate=d.BusinessDate AND p.Status='PENDING')))
   THROW 52305,'Closed business day must reconcile transactions and close shifts.',1;
 IF EXISTS(SELECT 1 FROM pms.HousekeepingTask WHERE Status='COMPLETED' AND InspectedBy IS NULL)
   THROW 52306,'Completed housekeeping work must be inspected.',1;
 IF EXISTS(SELECT 1 FROM pms.LostFound WHERE Status<>'STORED' AND (ResolvedAtUtc IS NULL
       OR (Status='RETURNED' AND ReturnedToCustomerId IS NULL)))
   THROW 52307,'Resolved lost property requires recipient/disposition evidence.',1;
 IF EXISTS(SELECT 1 FROM pms.ExceptionCase WHERE Status<>'OPEN' AND (ResolvedBy IS NULL OR ResolvedAtUtc IS NULL OR NULLIF(Resolution,'') IS NULL))
   THROW 52308,'Resolved exception requires actor, time and explanation.',1;
END;
GO
