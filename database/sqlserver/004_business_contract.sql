-- Version 2 migration, part 1. Apply 004..007 on ONE connection/transaction.
SET XACT_ABORT ON; SET NOCOUNT ON; SET ANSI_NULLS ON; SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON; SET ANSI_WARNINGS ON; SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON; SET NUMERIC_ROUNDABORT OFF;
IF NOT EXISTS(SELECT 1 FROM pms.SchemaVersion WHERE Version=1)
 OR EXISTS(SELECT 1 FROM pms.SchemaVersion WHERE Version=2)
 THROW 52000,'Expected schema version 1; migration stopped.',1;
BEGIN TRANSACTION;
EXEC pms.usp_LockInventory;

CREATE TABLE pms.PrincipalBinding (
    PrincipalSid varbinary(85) NOT NULL PRIMARY KEY,
    UserId bigint NOT NULL UNIQUE REFERENCES pms.AppUser(UserId)
);
CREATE TABLE pms.CommandExecution (
    SessionId int NOT NULL PRIMARY KEY,
    RequestId uniqueidentifier NOT NULL UNIQUE REFERENCES pms.ApiRequest(RequestId)
);
-- DBA-controlled allowlist. Clients cannot supply SQL, columns outside this list,
-- actor identity, RequestId, or bypass the mandatory final validation.
CREATE TABLE pms.MutationRule (
    Operation varchar(40) NOT NULL,
    Entity sysname NOT NULL,
    Verb varchar(6) NOT NULL CHECK(Verb IN ('insert','update','delete')),
    PermissionCode varchar(80) NOT NULL REFERENCES pms.Permission(Code),
    AllowedColumns nvarchar(2000) NOT NULL,
    PRIMARY KEY(Operation,Entity,Verb)
);
CREATE TABLE pms.StatusTransition (
    Entity sysname NOT NULL, FromStatus varchar(30) NOT NULL, ToStatus varchar(30) NOT NULL,
    PRIMARY KEY(Entity,FromStatus,ToStatus)
);
ALTER TABLE pms.RefundRequest ADD FolioId bigint NULL REFERENCES pms.Folio(FolioId),
    DepositAccountId bigint NULL REFERENCES pms.DepositAccount(DepositAccountId);
ALTER TABLE pms.Payment ADD RefundRequestId bigint NULL REFERENCES pms.RefundRequest(RefundRequestId);
GO
ALTER TABLE pms.RefundRequest WITH CHECK ADD CONSTRAINT CK_Refund_Source
 CHECK((FolioId IS NOT NULL AND DepositAccountId IS NULL) OR (FolioId IS NULL AND DepositAccountId IS NOT NULL));
ALTER TABLE pms.Payment WITH CHECK ADD CONSTRAINT CK_Payment_RefundRequest
 CHECK((Direction='OUT' AND RefundRequestId IS NOT NULL) OR (Direction='IN' AND RefundRequestId IS NULL));
ALTER TABLE pms.HotelSettings WITH CHECK ADD CONSTRAINT CK_Hotel_VietnamTimeZone
 CHECK(TimeZoneId='SE Asia Standard Time');
CREATE UNIQUE INDEX UX_Payment_RefundRequest ON pms.Payment(RefundRequestId) WHERE RefundRequestId IS NOT NULL;

INSERT pms.StatusTransition VALUES
('BookingRoom','HELD','CONFIRMED'),('BookingRoom','HELD','CANCELLED'),('BookingRoom','HELD','NO_SHOW'),
('BookingRoom','CONFIRMED','IN_HOUSE'),('BookingRoom','CONFIRMED','CANCELLED'),('BookingRoom','CONFIRMED','NO_SHOW'),
('BookingRoom','IN_HOUSE','COMPLETED'),
('Stay','IN_HOUSE','CHECKED_OUT'),
('Payment','PENDING','SUCCEEDED'),('Payment','PENDING','FAILED'),('Payment','PENDING','CANCELLED'),
('RefundRequest','PENDING','APPROVED'),('RefundRequest','PENDING','REJECTED'),('RefundRequest','PENDING','CANCELLED'),
('RefundRequest','APPROVED','COMPLETED'),('RefundRequest','APPROVED','CANCELLED'),
('Folio','OPEN','CLOSED'),('BusinessDay','OPEN','CLOSED'),
('ServiceOrder','OPEN','DELIVERED'),('ServiceOrder','OPEN','CANCELLED'),('ServiceOrder','DELIVERED','CANCELLED'),
('MinibarAudit','PENDING','CONFIRMED'),('MinibarAudit','PENDING','DISPUTED'),('MinibarAudit','DISPUTED','CONFIRMED'),
('HousekeepingTask','PENDING','IN_PROGRESS'),('HousekeepingTask','PENDING','CANCELLED'),
('HousekeepingTask','IN_PROGRESS','INSPECTING'),('HousekeepingTask','IN_PROGRESS','CANCELLED'),
('HousekeepingTask','INSPECTING','IN_PROGRESS'),('HousekeepingTask','INSPECTING','COMPLETED'),
('MaintenanceTicket','OPEN','IN_PROGRESS'),('MaintenanceTicket','OPEN','CANCELLED'),('MaintenanceTicket','IN_PROGRESS','RESOLVED'),
('LostFound','STORED','RETURNED'),('LostFound','STORED','DISPOSED'),
('ExceptionCase','OPEN','RESOLVED'),('ExceptionCase','OPEN','REJECTED'),
('Invoice','DRAFT','PENDING'),('Invoice','DRAFT','ISSUED'),('Invoice','DRAFT','CANCELLED'),
('Invoice','PENDING','ISSUED'),('Invoice','PENDING','FAILED'),('Invoice','FAILED','PENDING');

INSERT pms.MutationRule VALUES
('BOOKING','Booking','insert','createBooking','Code,BookingKind,CustomerId,OrganizationId,GroupName,ContactName,ContactPhone,ContactEmail,SourceCode,Status,Notes'),
('BOOKING','BookingRoom','insert','createBooking','BookingId,LineNumber,RoomTypeId,RatePlanId,PolicyVersionId,StayType,ArrivalDate,DepartureDate,StartsAtUtc,EndsAtUtc,Adults,Children,Status,HoldExpiresAtUtc,QuotedTotalVnd,RateSnapshotJson'),
('BOOKING','BookingNightRate','insert','createBooking','BookingRoomId,NightDate,PriceVnd,RateReason'),
('BOOKING','BookingGuest','insert','createBooking','BookingRoomId,CustomerId,IsLead'),
('BOOKING','RoomAllocation','insert','createBooking','RoomId,BookingRoomId,StartsAtUtc,EndsAtUtc'),
('BOOKING','Folio','insert','createBooking','Code,BookingId,BookingRoomId,Kind,PayerCustomerId,PayerOrganizationId'),
('BOOKING','DepositAccount','insert','createBooking','BookingId,BookingRoomId,Kind'),
('BOOKING','Customer','insert','createBooking','Code,FullName,Phone,Email,DateOfBirth,NationalityCode,Address,Notes'),
('CANCEL_BOOKING','BookingRoom','update','cancelBooking','Status'),
('CANCEL_BOOKING','RoomAllocation','update','cancelBooking','IsCancelled'),
('ASSIGN_ROOM','RoomAllocation','insert','createBooking','RoomId,BookingRoomId,StartsAtUtc,EndsAtUtc'),
('ASSIGN_ROOM','RoomAllocation','update','createBooking','IsCancelled'),
('CHECK_IN','BookingRoom','update','manageCheckIn','Status'),
('CHECK_IN','Stay','insert','manageCheckIn','Code,BookingRoomId,Status,CheckedInAtUtc,ExpectedOutAtUtc,PricingSnapshotJson'),
('CHECK_IN','StayRoomSegment','insert','manageCheckIn','StayId,AllocationId,RoomId,ArrivedAtUtc'),
('CHECK_IN','StayGuest','insert','manageCheckIn','StayId,CustomerId,ArrivedAtUtc,IsLead'),
('CHECK_IN','FolioEntry','insert','manageCheckIn','FolioId,StayId,Kind,Category,AmountVnd,Description,OperationKey'),
('CHANGE_STAY','BookingRoom','update','manageCheckIn','ArrivalDate,DepartureDate,StartsAtUtc,EndsAtUtc,QuotedTotalVnd,RateSnapshotJson'),
('CHANGE_STAY','BookingNightRate','insert','manageCheckIn','BookingRoomId,NightDate,PriceVnd,RateReason'),
('CHANGE_STAY','BookingNightRate','update','manageCheckIn','PriceVnd,RateReason'),
('CHANGE_STAY','BookingNightRate','delete','manageCheckIn',''),
('CHANGE_STAY','RoomAllocation','update','manageCheckIn','StartsAtUtc,EndsAtUtc'),
('CHANGE_STAY','Stay','update','manageCheckIn','ExpectedOutAtUtc,PricingSnapshotJson'),
('CHANGE_STAY','FolioEntry','insert','manageCheckIn','FolioId,StayId,Kind,Category,AmountVnd,Description,ReversesEntryId,OperationKey'),
('TRANSFER_ROOM','RoomAllocation','update','manageRoomTransfer','EndsAtUtc'),
('TRANSFER_ROOM','RoomAllocation','insert','manageRoomTransfer','RoomId,BookingRoomId,StartsAtUtc,EndsAtUtc'),
('TRANSFER_ROOM','StayRoomSegment','update','manageRoomTransfer','DepartedAtUtc,TransferReason'),
('TRANSFER_ROOM','StayRoomSegment','insert','manageRoomTransfer','StayId,AllocationId,RoomId,ArrivedAtUtc,TransferReason'),
('CHECK_OUT','StayRoomSegment','update','manageCheckOut','DepartedAtUtc'),
('CHECK_OUT','StayGuest','update','manageCheckOut','DepartedAtUtc'),
('CHECK_OUT','Stay','update','manageCheckOut','Status,CheckedOutAtUtc'),
('CHECK_OUT','BookingRoom','update','manageCheckOut','Status'),
('CHECK_OUT','StaySettlement','insert','manageCheckOut','StayId,TotalAmountVnd,RoomAmountVnd,ServiceAmountVnd,SurchargeVnd,DiscountVnd,SnapshotJson'),
('CHECK_OUT','Folio','update','manageCheckOut','Status,ClosedAtUtc'),
('SERVICE','ServiceOrder','insert','addServiceOrder','StayId,Status'),
('SERVICE','ServiceOrder','update','addServiceOrder','Status'),
('SERVICE','ServiceOrderLine','insert','addServiceOrder','ServiceOrderId,ServiceId,Description,Quantity,UnitPriceVnd,AmountVnd'),
('SERVICE','FolioEntry','insert','addServiceOrder','FolioId,StayId,Kind,Category,AmountVnd,Description,ServiceOrderLineId,OperationKey'),
('CANCEL_SERVICE','ServiceOrder','update','cancelServiceOrder','Status,CancellationReason'),
('CANCEL_SERVICE','FolioEntry','insert','cancelServiceOrder','FolioId,StayId,Kind,Category,AmountVnd,Description,ReversesEntryId,OperationKey'),
('ADJUST_CHARGE','FolioEntry','insert','systemConfig','FolioId,StayId,Kind,Category,AmountVnd,Description,ReversesEntryId,OperationKey'),
('MINIBAR','MinibarAudit','insert','manageHousekeepingTasks','StayId,RoomId,Status,Notes'),
('MINIBAR','MinibarAudit','update','manageHousekeepingTasks','Status,Notes'),
('MINIBAR','MinibarAuditLine','insert','manageHousekeepingTasks','MinibarAuditId,ServiceId,ConsumedQuantity,ServiceOrderLineId'),
('MINIBAR','ServiceOrder','insert','manageHousekeepingTasks','StayId,Status'),
('MINIBAR','ServiceOrderLine','insert','manageHousekeepingTasks','ServiceOrderId,ServiceId,Description,Quantity,UnitPriceVnd,AmountVnd'),
('MINIBAR','FolioEntry','insert','manageHousekeepingTasks','FolioId,StayId,Kind,Category,AmountVnd,Description,ServiceOrderLineId,OperationKey'),
('COLLECT','Payment','insert','collectPayment','Code,BookingId,Direction,Purpose,AmountVnd,Method,Status,ShiftId'),
('COLLECT','FolioEntry','insert','collectPayment','FolioId,Kind,AmountVnd,Description,PaymentId,OperationKey'),
('COLLECT','DepositMovement','insert','collectPayment','DepositAccountId,Kind,AmountVnd,PaymentId,OperationKey'),
('CANCEL_PAYMENT','Payment','update','collectPayment','Status'),
('APPLY_DEPOSIT','DepositMovement','insert','collectPayment','DepositAccountId,Kind,AmountVnd,ReversesMovementId,OperationKey'),
('APPLY_DEPOSIT','FolioEntry','insert','collectPayment','FolioId,Kind,AmountVnd,Description,DepositMovementId,OperationKey'),
('TRANSFER_FOLIO','FolioEntry','insert','collectPayment','FolioId,Kind,AmountVnd,Description,TransferPairId,OperationKey'),
('REQUEST_REFUND','RefundRequest','insert','collectPayment','OriginalPaymentId,AmountVnd,Reason,Status,FolioId,DepositAccountId'),
('APPROVE_REFUND','RefundRequest','update','approveRefund','Status'),
('COMPLETE_REFUND','Payment','insert','collectPayment','Code,BookingId,OriginalPaymentId,RefundRequestId,Direction,Purpose,AmountVnd,Method,Status,ShiftId'),
('COMPLETE_REFUND','RefundRequest','update','collectPayment','Status,RefundPaymentId'),
('COMPLETE_REFUND','FolioEntry','insert','collectPayment','FolioId,Kind,AmountVnd,Description,PaymentId,OperationKey'),
('COMPLETE_REFUND','DepositMovement','insert','collectPayment','DepositAccountId,Kind,AmountVnd,PaymentId,OperationKey'),
('CLOSE_FOLIO','Folio','update','collectPayment','Status,ClosedAtUtc'),
('SHIFT','CashierShift','insert','collectPayment','BusinessDate,OpeningCashVnd,Notes'),
('SHIFT','CashierShift','update','collectPayment','ClosedAtUtc,CountedCashVnd,ExpectedCashVnd,Notes'),
('CLOSE_DAY','BusinessDay','update','systemConfig','Status,ClosedAtUtc,CollectedVnd,RefundedVnd,SettledRevenueVnd,OutstandingVnd,SnapshotJson'),
('CLOSE_DAY','BusinessDay','insert','systemConfig','BusinessDate'),
('CLOSE_DAY','HotelSettings','update','systemConfig','WorkingDate'),
('RECEIPT','Invoice','insert','printVatInvoice','FolioId,InternalNumber,DocumentKind,AdjustsInvoiceId,Status,BuyerName,BuyerTaxCode,BuyerAddress,NetVnd,TaxVnd,TotalVnd,IssuedAtUtc'),
('RECEIPT','Invoice','update','printVatInvoice','Status,IssuedAtUtc'),
('RECEIPT','InvoiceLine','insert','printVatInvoice','InvoiceId,LineNumber,FolioEntryId,Description,Quantity,UnitPriceVnd,NetVnd,TaxRate,TaxVnd,TotalVnd'),
('CLEANING','Room','update','updateCleanStatus','CleanStatus'),
('CLEANING','HousekeepingTask','insert','manageHousekeepingTasks','RoomId,StayId,TaskType,Status,AssignedTo,Notes'),
('CLEANING','HousekeepingTask','update','manageHousekeepingTasks','Status,AssignedTo,CompletedAtUtc,Notes'),
('MAINTENANCE','MaintenanceTicket','insert','reportMaintenance','RoomId,Description,Priority,Status,AssignedTo'),
('MAINTENANCE','MaintenanceTicket','update','reportMaintenance','Status,AssignedTo,ResolvedAtUtc'),
('BLOCK_ROOM','RoomAllocation','insert','systemConfig','RoomId,TicketId,BlockReason,StartsAtUtc,EndsAtUtc'),
('BLOCK_ROOM','RoomAllocation','update','systemConfig','EndsAtUtc,IsCancelled'),
('LOST_FOUND','LostFound','insert','manageHousekeepingTasks','RoomId,StayId,Description,StorageLocation,Status,FoundAtUtc,Notes'),
('LOST_FOUND','LostFound','update','manageHousekeepingTasks','Status,ReturnedToCustomerId,ResolvedAtUtc,Notes'),
('EXCEPTION','ExceptionCase','insert','manageCheckIn','BookingId,StayId,RoomId,Kind,Description,Status'),
('EXCEPTION','ExceptionCase','update','systemConfig','Status,Resolution'),
('CUSTOMER','Customer','insert','createBooking','Code,FullName,Phone,Email,DateOfBirth,NationalityCode,Address,Notes'),
('CUSTOMER','Customer','update','createBooking','FullName,Phone,Email,DateOfBirth,NationalityCode,Address,Notes'),
('CUSTOMER','CustomerIdentity','insert','createBooking','CustomerId,DocumentType,NumberCiphertext,NumberHmac,KeyVersion,IssuingCountry,ExpiresOn'),
('CONFIG','Organization','insert','systemConfig','Name,TaxCode,BillingAddress,ContactName,Phone,Email'),
('CONFIG','RoomType','insert','editRoomClasses','Code,Name,AreaM2,StandardOccupancy,MaxOccupancy,BedConfiguration,AmenitiesJson,Description'),
('CONFIG','RoomType','update','editRoomClasses','Name,AreaM2,StandardOccupancy,MaxOccupancy,BedConfiguration,AmenitiesJson,Description,IsActive'),
('CONFIG','Room','insert','editRoomClasses','Number,RoomTypeId,FloorLabel,CleanStatus,Notes'),
('CONFIG','Room','update','editRoomClasses','FloorLabel,IsActive,Notes'),
('CONFIG','PolicyVersion','insert','systemConfig','Code,Version,EffectiveFromUtc,RulesJson'),
('CONFIG','RatePlan','insert','editRoomClasses','Code,Name,StayType,PolicyVersionId'),
('CONFIG','RatePlan','update','editRoomClasses','IsActive'),
('CONFIG','RateRule','insert','editRoomClasses','RatePlanId,RoomTypeId,ValidFrom,ValidTo,DayKind,Priority,PriceVnd,IncludedMinutes,ExtraBlockMinutes,ExtraBlockPriceVnd'),
('CONFIG','Service','insert','systemConfig','Code,Name,Category,Unit,PriceVnd'),
('CONFIG','Service','update','systemConfig','Name,Category,Unit,PriceVnd,IsActive'),
('RBAC','AppRole','insert','systemConfig','Code,Name'),
('RBAC','AppRole','update','systemConfig','Name,IsActive'),
('RBAC','RolePermission','insert','systemConfig','RoleId,PermissionId'),
('RBAC','RolePermission','delete','systemConfig',''),
('RBAC','UserRole','insert','systemConfig','UserId,RoleId'),
('RBAC','UserRole','delete','systemConfig','');
GO
