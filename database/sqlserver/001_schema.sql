-- Song Lam PMS - SQL Server 2022. Run once in a NEW, explicitly selected database.
-- No sample customers, bookings, revenue or default passwords are inserted.
SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;
IF DB_NAME() IN ('master','model','msdb','tempdb') THROW 51000, 'Select a dedicated application database.', 1;
IF SCHEMA_ID('pms') IS NOT NULL THROW 51000, 'pms schema already exists; use a versioned migration.', 1;
BEGIN TRANSACTION;
EXEC('CREATE SCHEMA pms AUTHORIZATION dbo');

CREATE TABLE pms.SchemaVersion (
    Version int NOT NULL PRIMARY KEY,
    AppliedAtUtc datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE TABLE pms.AppRole (
    RoleId int IDENTITY PRIMARY KEY,
    Code varchar(40) NOT NULL UNIQUE,
    Name nvarchar(120) NOT NULL,
    IsActive bit NOT NULL DEFAULT 1
);
CREATE TABLE pms.Permission (
    PermissionId int IDENTITY PRIMARY KEY,
    Code varchar(80) NOT NULL UNIQUE,
    Description nvarchar(250) NOT NULL
);
CREATE TABLE pms.RolePermission (
    RoleId int NOT NULL REFERENCES pms.AppRole(RoleId),
    PermissionId int NOT NULL REFERENCES pms.Permission(PermissionId),
    PRIMARY KEY(RoleId, PermissionId)
);
CREATE TABLE pms.AppUser (
    UserId bigint IDENTITY PRIMARY KEY,
    Username nvarchar(100) NOT NULL UNIQUE,
    FullName nvarchar(160) NOT NULL,
    Email nvarchar(254) NULL,
    PasswordHash varchar(512) NULL,
    ExternalSubject varchar(200) NULL,
    IsActive bit NOT NULL DEFAULT 0,
    CreatedAtUtc datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
    RowVer rowversion NOT NULL,
    CHECK (IsActive = 0 OR PasswordHash IS NOT NULL OR ExternalSubject IS NOT NULL)
);
CREATE UNIQUE INDEX UX_User_ExternalSubject ON pms.AppUser(ExternalSubject) WHERE ExternalSubject IS NOT NULL;
CREATE TABLE pms.UserRole (
    UserId bigint NOT NULL REFERENCES pms.AppUser(UserId),
    RoleId int NOT NULL REFERENCES pms.AppRole(RoleId),
    PRIMARY KEY(UserId, RoleId)
);
CREATE TABLE pms.BusinessDay (
    BusinessDate date NOT NULL PRIMARY KEY,
    Status varchar(10) NOT NULL DEFAULT 'OPEN' CHECK(Status IN ('OPEN','CLOSED')),
    OpenSlot AS CASE WHEN Status = 'OPEN' THEN 1 ELSE NULL END,
    ClosedAtUtc datetime2(3) NULL,
    ClosedBy bigint NULL REFERENCES pms.AppUser(UserId),
    CollectedVnd decimal(19,0) NULL,
    RefundedVnd decimal(19,0) NULL,
    SettledRevenueVnd decimal(19,0) NULL,
    OutstandingVnd decimal(19,0) NULL,
    SnapshotJson nvarchar(max) NULL CHECK(SnapshotJson IS NULL OR ISJSON(SnapshotJson)=1),
    RowVer rowversion NOT NULL,
    CHECK ((Status='OPEN' AND ClosedAtUtc IS NULL AND ClosedBy IS NULL) OR
           (Status='CLOSED' AND ClosedAtUtc IS NOT NULL AND ClosedBy IS NOT NULL AND SnapshotJson IS NOT NULL))
);
-- Filter on the base column (SQL Server does not allow a computed column in the filter).
CREATE UNIQUE INDEX UX_BusinessDay_OneOpen ON pms.BusinessDay(Status) WHERE Status='OPEN';
CREATE TABLE pms.HotelSettings (
    HotelId tinyint NOT NULL PRIMARY KEY CHECK(HotelId=1),
    Name nvarchar(200) NOT NULL,
    Address nvarchar(500) NULL,
    Phone varchar(30) NULL,
    Email nvarchar(254) NULL,
    TaxCode varchar(30) NULL,
    TimeZoneId varchar(60) NOT NULL DEFAULT 'SE Asia Standard Time',
    Currency char(3) NOT NULL DEFAULT 'VND' CHECK(Currency='VND'),
    WorkingDate date NOT NULL REFERENCES pms.BusinessDay(BusinessDate),
    CheckInTime time(0) NOT NULL DEFAULT '14:00',
    CheckOutTime time(0) NOT NULL DEFAULT '12:00',
    RowVer rowversion NOT NULL
);
CREATE TABLE pms.Organization (
    OrganizationId bigint IDENTITY PRIMARY KEY,
    Name nvarchar(200) NOT NULL,
    TaxCode varchar(30) NULL,
    BillingAddress nvarchar(500) NULL,
    ContactName nvarchar(160) NULL,
    Phone varchar(30) NULL,
    Email nvarchar(254) NULL,
    IsActive bit NOT NULL DEFAULT 1
);
CREATE TABLE pms.Customer (
    CustomerId bigint IDENTITY PRIMARY KEY,
    Code varchar(40) NOT NULL UNIQUE,
    FullName nvarchar(160) NOT NULL,
    Phone varchar(30) NULL,
    Email nvarchar(254) NULL,
    DateOfBirth date NULL,
    NationalityCode char(2) NULL,
    Address nvarchar(500) NULL,
    Notes nvarchar(1000) NULL,
    CreatedAtUtc datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
    IsActive bit NOT NULL DEFAULT 1,
    RowVer rowversion NOT NULL
);
CREATE INDEX IX_Customer_Phone ON pms.Customer(Phone);
CREATE TABLE pms.CustomerIdentity (
    IdentityId bigint IDENTITY PRIMARY KEY,
    CustomerId bigint NOT NULL REFERENCES pms.Customer(CustomerId),
    DocumentType varchar(20) NOT NULL CHECK(DocumentType IN ('NATIONAL_ID','PASSPORT','OTHER')),
    NumberCiphertext varbinary(max) NOT NULL,
    NumberHmac binary(32) NOT NULL,
    KeyVersion varchar(30) NOT NULL,
    IssuingCountry char(2) NOT NULL,
    ExpiresOn date NULL,
    UNIQUE(DocumentType, IssuingCountry, NumberHmac)
);
CREATE TABLE pms.RoomType (
    RoomTypeId int IDENTITY PRIMARY KEY,
    Code varchar(30) NOT NULL UNIQUE,
    Name nvarchar(120) NOT NULL,
    AreaM2 decimal(8,2) NULL CHECK(AreaM2>0),
    StandardOccupancy smallint NOT NULL CHECK(StandardOccupancy>0),
    MaxOccupancy smallint NOT NULL,
    BedConfiguration nvarchar(250) NULL,
    AmenitiesJson nvarchar(max) NULL CHECK(AmenitiesJson IS NULL OR ISJSON(AmenitiesJson)=1),
    Description nvarchar(1000) NULL,
    IsActive bit NOT NULL DEFAULT 1,
    RowVer rowversion NOT NULL,
    CHECK(MaxOccupancy>=StandardOccupancy)
);
CREATE TABLE pms.Room (
    RoomId int IDENTITY PRIMARY KEY,
    Number varchar(20) NOT NULL UNIQUE,
    RoomTypeId int NOT NULL REFERENCES pms.RoomType(RoomTypeId),
    FloorLabel nvarchar(30) NOT NULL,
    CleanStatus varchar(12) NOT NULL DEFAULT 'DIRTY' CHECK(CleanStatus IN ('CLEAN','DIRTY','CLEANING','INSPECTING')),
    IsActive bit NOT NULL DEFAULT 1,
    Notes nvarchar(500) NULL,
    RowVer rowversion NOT NULL
);
CREATE INDEX IX_Room_Type ON pms.Room(RoomTypeId, IsActive);
CREATE TABLE pms.PolicyVersion (
    PolicyVersionId int IDENTITY PRIMARY KEY,
    Code varchar(40) NOT NULL,
    Version int NOT NULL CHECK(Version>0),
    EffectiveFromUtc datetime2(3) NOT NULL,
    RulesJson nvarchar(max) NOT NULL CHECK(ISJSON(RulesJson)=1),
    CreatedBy bigint NOT NULL REFERENCES pms.AppUser(UserId),
    CreatedAtUtc datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
    UNIQUE(Code, Version)
);
CREATE TABLE pms.RatePlan (
    RatePlanId int IDENTITY PRIMARY KEY,
    Code varchar(30) NOT NULL UNIQUE,
    Name nvarchar(120) NOT NULL,
    StayType varchar(10) NOT NULL CHECK(StayType IN ('NIGHTLY','HOURLY')),
    PolicyVersionId int NOT NULL REFERENCES pms.PolicyVersion(PolicyVersionId),
    IsActive bit NOT NULL DEFAULT 1
);
CREATE TABLE pms.RateRule (
    RateRuleId bigint IDENTITY PRIMARY KEY,
    RatePlanId int NOT NULL REFERENCES pms.RatePlan(RatePlanId),
    RoomTypeId int NOT NULL REFERENCES pms.RoomType(RoomTypeId),
    ValidFrom date NOT NULL,
    ValidTo date NOT NULL,
    DayKind varchar(10) NOT NULL CHECK(DayKind IN ('BASE','WEEKEND','HOLIDAY','SPECIFIC')),
    Priority smallint NOT NULL DEFAULT 0,
    PriceVnd decimal(19,0) NOT NULL CHECK(PriceVnd>=0),
    IncludedMinutes int NULL CHECK(IncludedMinutes>0),
    ExtraBlockMinutes int NULL CHECK(ExtraBlockMinutes>0),
    ExtraBlockPriceVnd decimal(19,0) NULL CHECK(ExtraBlockPriceVnd>=0),
    CHECK(ValidTo>ValidFrom),
    CHECK((IncludedMinutes IS NULL AND ExtraBlockMinutes IS NULL AND ExtraBlockPriceVnd IS NULL) OR
          (IncludedMinutes IS NOT NULL AND ExtraBlockMinutes IS NOT NULL AND ExtraBlockPriceVnd IS NOT NULL))
);
CREATE INDEX IX_RateRule_Lookup ON pms.RateRule(RoomTypeId,RatePlanId,ValidFrom,ValidTo);
CREATE TABLE pms.Booking (
    BookingId bigint IDENTITY PRIMARY KEY,
    Code varchar(40) NOT NULL UNIQUE,
    BookingKind varchar(12) NOT NULL CHECK(BookingKind IN ('INDIVIDUAL','GROUP','WALK_IN')),
    CustomerId bigint NOT NULL REFERENCES pms.Customer(CustomerId),
    OrganizationId bigint NULL REFERENCES pms.Organization(OrganizationId),
    GroupName nvarchar(200) NULL,
    ContactName nvarchar(160) NOT NULL,
    ContactPhone varchar(30) NULL,
    ContactEmail nvarchar(254) NULL,
    SourceCode varchar(40) NULL,
    Status varchar(24) NOT NULL CHECK(Status IN ('PENDING','CONFIRMED','PARTIALLY_CHECKED_IN','CHECKED_IN','COMPLETED','CANCELLED','NO_SHOW')),
    Notes nvarchar(2000) NULL,
    CreatedBy bigint NOT NULL REFERENCES pms.AppUser(UserId),
    CreatedAtUtc datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
    RowVer rowversion NOT NULL,
    CHECK(BookingKind<>'GROUP' OR GroupName IS NOT NULL)
);
CREATE TABLE pms.BookingRoom (
    BookingRoomId bigint IDENTITY PRIMARY KEY,
    BookingId bigint NOT NULL REFERENCES pms.Booking(BookingId),
    LineNumber int NOT NULL CHECK(LineNumber>0),
    RoomTypeId int NOT NULL REFERENCES pms.RoomType(RoomTypeId),
    RatePlanId int NULL REFERENCES pms.RatePlan(RatePlanId),
    PolicyVersionId int NULL REFERENCES pms.PolicyVersion(PolicyVersionId),
    StayType varchar(10) NOT NULL CHECK(StayType IN ('NIGHTLY','HOURLY')),
    ArrivalDate date NOT NULL,
    DepartureDate date NOT NULL,
    StartsAtUtc datetime2(3) NOT NULL,
    EndsAtUtc datetime2(3) NOT NULL,
    Adults smallint NOT NULL CHECK(Adults>0),
    Children smallint NOT NULL DEFAULT 0 CHECK(Children>=0),
    Status varchar(12) NOT NULL CHECK(Status IN ('HELD','CONFIRMED','IN_HOUSE','COMPLETED','CANCELLED','NO_SHOW')),
    HoldExpiresAtUtc datetime2(3) NULL,
    QuotedTotalVnd decimal(19,0) NOT NULL CHECK(QuotedTotalVnd>=0),
    RateSnapshotJson nvarchar(max) NOT NULL CHECK(ISJSON(RateSnapshotJson)=1),
    RowVer rowversion NOT NULL,
    UNIQUE(BookingId,LineNumber),
    UNIQUE(BookingRoomId,BookingId),
    CHECK(EndsAtUtc>StartsAtUtc),
    CHECK((StayType='NIGHTLY' AND DepartureDate>ArrivalDate) OR (StayType='HOURLY' AND DepartureDate>=ArrivalDate)),
    CHECK(Status<>'HELD' OR HoldExpiresAtUtc IS NOT NULL)
);
CREATE INDEX IX_BookingRoom_Inventory ON pms.BookingRoom(RoomTypeId,Status,StartsAtUtc,EndsAtUtc) INCLUDE(BookingId);
CREATE TABLE pms.BookingGuest (
    BookingRoomId bigint NOT NULL REFERENCES pms.BookingRoom(BookingRoomId),
    CustomerId bigint NOT NULL REFERENCES pms.Customer(CustomerId),
    IsLead bit NOT NULL DEFAULT 0,
    PRIMARY KEY(BookingRoomId,CustomerId)
);
CREATE UNIQUE INDEX UX_BookingGuest_Lead ON pms.BookingGuest(BookingRoomId) WHERE IsLead=1;
CREATE TABLE pms.BookingNightRate (
    BookingRoomId bigint NOT NULL REFERENCES pms.BookingRoom(BookingRoomId),
    NightDate date NOT NULL,
    PriceVnd decimal(19,0) NOT NULL CHECK(PriceVnd>=0),
    RateReason nvarchar(200) NULL,
    PRIMARY KEY(BookingRoomId,NightDate)
);
CREATE TABLE pms.MaintenanceTicket (
    TicketId bigint IDENTITY PRIMARY KEY,
    RoomId int NOT NULL REFERENCES pms.Room(RoomId),
    Description nvarchar(2000) NOT NULL,
    Priority varchar(10) NOT NULL CHECK(Priority IN ('LOW','NORMAL','HIGH','URGENT')),
    Status varchar(12) NOT NULL CHECK(Status IN ('OPEN','IN_PROGRESS','RESOLVED','CANCELLED')),
    ReportedBy bigint NOT NULL REFERENCES pms.AppUser(UserId),
    AssignedTo bigint NULL REFERENCES pms.AppUser(UserId),
    CreatedAtUtc datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
    ResolvedAtUtc datetime2(3) NULL,
    RowVer rowversion NOT NULL
);
-- One calendar for assigned bookings AND timed maintenance blocks; [start,end).
CREATE TABLE pms.RoomAllocation (
    AllocationId bigint IDENTITY PRIMARY KEY,
    RoomId int NOT NULL REFERENCES pms.Room(RoomId),
    BookingRoomId bigint NULL REFERENCES pms.BookingRoom(BookingRoomId),
    TicketId bigint NULL REFERENCES pms.MaintenanceTicket(TicketId),
    BlockReason nvarchar(500) NULL,
    StartsAtUtc datetime2(3) NOT NULL,
    EndsAtUtc datetime2(3) NOT NULL,
    IsCancelled bit NOT NULL DEFAULT 0,
    CreatedBy bigint NOT NULL REFERENCES pms.AppUser(UserId),
    RowVer rowversion NOT NULL,
    UNIQUE(AllocationId, RoomId),
    CHECK(EndsAtUtc>StartsAtUtc),
    CHECK((BookingRoomId IS NOT NULL AND TicketId IS NULL AND BlockReason IS NULL) OR
          (BookingRoomId IS NULL AND BlockReason IS NOT NULL))
);
CREATE INDEX IX_Allocation_RoomTime ON pms.RoomAllocation(RoomId,StartsAtUtc,EndsAtUtc) INCLUDE(BookingRoomId) WHERE IsCancelled=0;
CREATE INDEX IX_Allocation_BookingRoom ON pms.RoomAllocation(BookingRoomId);
CREATE TABLE pms.Stay (
    StayId bigint IDENTITY PRIMARY KEY,
    Code varchar(40) NOT NULL UNIQUE,
    BookingRoomId bigint NOT NULL UNIQUE REFERENCES pms.BookingRoom(BookingRoomId),
    Status varchar(12) NOT NULL CHECK(Status IN ('IN_HOUSE','CHECKED_OUT')),
    CheckedInAtUtc datetime2(3) NOT NULL,
    ExpectedOutAtUtc datetime2(3) NOT NULL,
    CheckedOutAtUtc datetime2(3) NULL,
    CheckedInBy bigint NOT NULL REFERENCES pms.AppUser(UserId),
    CheckedOutBy bigint NULL REFERENCES pms.AppUser(UserId),
    PricingSnapshotJson nvarchar(max) NOT NULL CHECK(ISJSON(PricingSnapshotJson)=1),
    RowVer rowversion NOT NULL,
    CHECK(ExpectedOutAtUtc>CheckedInAtUtc),
    CHECK((Status='IN_HOUSE' AND CheckedOutAtUtc IS NULL AND CheckedOutBy IS NULL) OR
          (Status='CHECKED_OUT' AND CheckedOutAtUtc>=CheckedInAtUtc AND CheckedOutAtUtc IS NOT NULL AND CheckedOutBy IS NOT NULL))
);
CREATE INDEX IX_Stay_Departures ON pms.Stay(Status,ExpectedOutAtUtc);
CREATE TABLE pms.StayRoomSegment (
    SegmentId bigint IDENTITY PRIMARY KEY,
    StayId bigint NOT NULL REFERENCES pms.Stay(StayId),
    AllocationId bigint NOT NULL,
    RoomId int NOT NULL,
    ArrivedAtUtc datetime2(3) NOT NULL,
    DepartedAtUtc datetime2(3) NULL,
    TransferReason nvarchar(500) NULL,
    FOREIGN KEY(AllocationId,RoomId) REFERENCES pms.RoomAllocation(AllocationId,RoomId),
    CHECK(DepartedAtUtc IS NULL OR DepartedAtUtc>=ArrivedAtUtc)
);
CREATE UNIQUE INDEX UX_Segment_CurrentRoom ON pms.StayRoomSegment(RoomId) WHERE DepartedAtUtc IS NULL;
CREATE UNIQUE INDEX UX_Segment_CurrentStay ON pms.StayRoomSegment(StayId) WHERE DepartedAtUtc IS NULL;
CREATE TABLE pms.StayGuest (
    StayId bigint NOT NULL REFERENCES pms.Stay(StayId),
    CustomerId bigint NOT NULL REFERENCES pms.Customer(CustomerId),
    ArrivedAtUtc datetime2(3) NOT NULL,
    DepartedAtUtc datetime2(3) NULL,
    IsLead bit NOT NULL DEFAULT 0,
    PRIMARY KEY(StayId,CustomerId),
    CHECK(DepartedAtUtc IS NULL OR DepartedAtUtc>=ArrivedAtUtc)
);
CREATE UNIQUE INDEX UX_StayGuest_Lead ON pms.StayGuest(StayId) WHERE IsLead=1;
CREATE TABLE pms.Service (
    ServiceId int IDENTITY PRIMARY KEY,
    Code varchar(40) NOT NULL UNIQUE,
    Name nvarchar(160) NOT NULL,
    Category varchar(30) NOT NULL,
    Unit nvarchar(30) NOT NULL,
    PriceVnd decimal(19,0) NOT NULL CHECK(PriceVnd>=0),
    IsActive bit NOT NULL DEFAULT 1,
    RowVer rowversion NOT NULL
);
CREATE TABLE pms.ServiceOrder (
    ServiceOrderId bigint IDENTITY PRIMARY KEY,
    StayId bigint NOT NULL REFERENCES pms.Stay(StayId),
    Status varchar(12) NOT NULL CHECK(Status IN ('OPEN','DELIVERED','CANCELLED')),
    OrderedBy bigint NOT NULL REFERENCES pms.AppUser(UserId),
    OrderedAtUtc datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
    CancellationReason nvarchar(500) NULL,
    RowVer rowversion NOT NULL
);
CREATE TABLE pms.ServiceOrderLine (
    ServiceOrderLineId bigint IDENTITY PRIMARY KEY,
    ServiceOrderId bigint NOT NULL REFERENCES pms.ServiceOrder(ServiceOrderId),
    ServiceId int NOT NULL REFERENCES pms.Service(ServiceId),
    Description nvarchar(200) NOT NULL,
    Quantity decimal(12,3) NOT NULL CHECK(Quantity>0),
    UnitPriceVnd decimal(19,0) NOT NULL CHECK(UnitPriceVnd>=0),
    AmountVnd decimal(19,0) NOT NULL CHECK(AmountVnd>=0),
    CHECK(AmountVnd=ROUND(Quantity*UnitPriceVnd,0))
);
CREATE TABLE pms.CashierShift (
    ShiftId bigint IDENTITY PRIMARY KEY,
    CashierId bigint NOT NULL REFERENCES pms.AppUser(UserId),
    BusinessDate date NOT NULL REFERENCES pms.BusinessDay(BusinessDate),
    OpenedAtUtc datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
    ClosedAtUtc datetime2(3) NULL,
    OpeningCashVnd decimal(19,0) NOT NULL CHECK(OpeningCashVnd>=0),
    CountedCashVnd decimal(19,0) NULL CHECK(CountedCashVnd>=0),
    ExpectedCashVnd decimal(19,0) NULL,
    Notes nvarchar(1000) NULL,
    RowVer rowversion NOT NULL,
    CHECK(ClosedAtUtc IS NULL OR (ClosedAtUtc>=OpenedAtUtc AND CountedCashVnd IS NOT NULL AND ExpectedCashVnd IS NOT NULL))
);
CREATE UNIQUE INDEX UX_Shift_Open ON pms.CashierShift(CashierId) WHERE ClosedAtUtc IS NULL;
CREATE TABLE pms.ApiRequest (
    RequestId uniqueidentifier NOT NULL DEFAULT NEWID() PRIMARY KEY,
    ActorId bigint NOT NULL REFERENCES pms.AppUser(UserId),
    Operation varchar(80) NOT NULL,
    IdempotencyKey varchar(120) COLLATE Latin1_General_100_BIN2 NOT NULL,
    RequestHash binary(32) NOT NULL,
    Status varchar(12) NOT NULL CHECK(Status IN ('PROCESSING','SUCCEEDED','FAILED')),
    ResponseJson nvarchar(max) NULL CHECK(ResponseJson IS NULL OR ISJSON(ResponseJson)=1),
    CreatedAtUtc datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
    UNIQUE(ActorId,Operation,IdempotencyKey)
);
CREATE TABLE pms.Payment (
    PaymentId bigint IDENTITY PRIMARY KEY,
    Code varchar(50) NOT NULL UNIQUE,
    BookingId bigint NOT NULL REFERENCES pms.Booking(BookingId),
    OriginalPaymentId bigint NULL REFERENCES pms.Payment(PaymentId),
    Direction varchar(3) NOT NULL CHECK(Direction IN ('IN','OUT')),
    Purpose varchar(20) NOT NULL CHECK(Purpose IN ('BOOKING_DEPOSIT','GUARANTEE_DEPOSIT','SETTLEMENT','SERVICE','REFUND')),
    AmountVnd decimal(19,0) NOT NULL CHECK(AmountVnd>0),
    Method varchar(20) NOT NULL CHECK(Method IN ('CASH','BANK_TRANSFER','VIETQR','VNPAY_QR','ONEPAY','POS_CARD')),
    Status varchar(10) NOT NULL CHECK(Status IN ('PENDING','SUCCEEDED','FAILED','CANCELLED')),
    Provider varchar(40) NULL,
    ProviderReference varchar(150) COLLATE Latin1_General_100_BIN2 NULL,
    BusinessDate date NOT NULL REFERENCES pms.BusinessDay(BusinessDate),
    ShiftId bigint NULL REFERENCES pms.CashierShift(ShiftId),
    RecordedBy bigint NOT NULL REFERENCES pms.AppUser(UserId),
    CreatedAtUtc datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
    SucceededAtUtc datetime2(3) NULL,
    RequestId uniqueidentifier NOT NULL UNIQUE REFERENCES pms.ApiRequest(RequestId),
    RowVer rowversion NOT NULL,
    CHECK((Direction='IN' AND Purpose<>'REFUND' AND OriginalPaymentId IS NULL) OR
          (Direction='OUT' AND Purpose='REFUND' AND OriginalPaymentId IS NOT NULL)),
    CHECK((Status='SUCCEEDED' AND SucceededAtUtc IS NOT NULL) OR (Status<>'SUCCEEDED' AND SucceededAtUtc IS NULL)),
    CHECK(ProviderReference IS NULL OR Provider IS NOT NULL),
    CHECK(OriginalPaymentId IS NULL OR OriginalPaymentId<>PaymentId)
);
CREATE UNIQUE INDEX UX_Payment_Provider ON pms.Payment(Provider,ProviderReference) WHERE ProviderReference IS NOT NULL;
CREATE INDEX IX_Payment_BusinessDate ON pms.Payment(BusinessDate,Status,Direction) INCLUDE(AmountVnd,Method);
CREATE INDEX IX_Payment_Booking ON pms.Payment(BookingId);
CREATE INDEX IX_Payment_RefundSource ON pms.Payment(OriginalPaymentId) WHERE OriginalPaymentId IS NOT NULL;
CREATE TABLE pms.RefundRequest (
    RefundRequestId bigint IDENTITY PRIMARY KEY,
    OriginalPaymentId bigint NOT NULL REFERENCES pms.Payment(PaymentId),
    AmountVnd decimal(19,0) NOT NULL CHECK(AmountVnd>0),
    Reason nvarchar(1000) NOT NULL,
    Status varchar(12) NOT NULL CHECK(Status IN ('PENDING','APPROVED','REJECTED','COMPLETED','CANCELLED')),
    RequestedBy bigint NOT NULL REFERENCES pms.AppUser(UserId),
    RequestedAtUtc datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
    ApprovedBy bigint NULL REFERENCES pms.AppUser(UserId),
    ApprovedAtUtc datetime2(3) NULL,
    RefundPaymentId bigint NULL REFERENCES pms.Payment(PaymentId),
    RowVer rowversion NOT NULL,
    CHECK(Status NOT IN ('APPROVED','COMPLETED') OR (ApprovedBy IS NOT NULL AND ApprovedAtUtc IS NOT NULL)),
    CHECK((Status='COMPLETED' AND RefundPaymentId IS NOT NULL) OR (Status<>'COMPLETED' AND RefundPaymentId IS NULL))
);
CREATE UNIQUE INDEX UX_Refund_Payment ON pms.RefundRequest(RefundPaymentId) WHERE RefundPaymentId IS NOT NULL;
CREATE INDEX IX_Refund_Original ON pms.RefundRequest(OriginalPaymentId,Status);
CREATE TABLE pms.DepositAccount (
    DepositAccountId bigint IDENTITY PRIMARY KEY,
    BookingId bigint NOT NULL REFERENCES pms.Booking(BookingId),
    BookingRoomId bigint NULL,
    Kind varchar(10) NOT NULL CHECK(Kind IN ('BOOKING','GUARANTEE')),
    FOREIGN KEY(BookingRoomId,BookingId) REFERENCES pms.BookingRoom(BookingRoomId,BookingId),
    CHECK(Kind<>'GUARANTEE' OR BookingRoomId IS NOT NULL)
);
CREATE UNIQUE INDEX UX_Deposit_Master ON pms.DepositAccount(BookingId,Kind) WHERE BookingRoomId IS NULL;
CREATE UNIQUE INDEX UX_Deposit_Room ON pms.DepositAccount(BookingRoomId,Kind) WHERE BookingRoomId IS NOT NULL;
CREATE TABLE pms.Folio (
    FolioId bigint IDENTITY PRIMARY KEY,
    Code varchar(40) NOT NULL UNIQUE,
    BookingId bigint NOT NULL REFERENCES pms.Booking(BookingId),
    BookingRoomId bigint NULL,
    Kind varchar(12) NOT NULL CHECK(Kind IN ('MASTER','ROOM','INCIDENTAL')),
    Status varchar(10) NOT NULL DEFAULT 'OPEN' CHECK(Status IN ('OPEN','CLOSED')),
    PayerCustomerId bigint NULL REFERENCES pms.Customer(CustomerId),
    PayerOrganizationId bigint NULL REFERENCES pms.Organization(OrganizationId),
    ClosedAtUtc datetime2(3) NULL,
    RowVer rowversion NOT NULL,
    FOREIGN KEY(BookingRoomId,BookingId) REFERENCES pms.BookingRoom(BookingRoomId,BookingId),
    CHECK((Kind='MASTER' AND BookingRoomId IS NULL) OR (Kind<>'MASTER' AND BookingRoomId IS NOT NULL)),
    CHECK((PayerCustomerId IS NULL AND PayerOrganizationId IS NOT NULL) OR (PayerCustomerId IS NOT NULL AND PayerOrganizationId IS NULL)),
    CHECK((Status='OPEN' AND ClosedAtUtc IS NULL) OR (Status='CLOSED' AND ClosedAtUtc IS NOT NULL))
);
CREATE UNIQUE INDEX UX_Folio_Master ON pms.Folio(BookingId) WHERE Kind='MASTER';
CREATE UNIQUE INDEX UX_Folio_Room ON pms.Folio(BookingRoomId,Kind) WHERE BookingRoomId IS NOT NULL;
CREATE TABLE pms.DepositMovement (
    DepositMovementId bigint IDENTITY PRIMARY KEY,
    DepositAccountId bigint NOT NULL REFERENCES pms.DepositAccount(DepositAccountId),
    Kind varchar(10) NOT NULL CHECK(Kind IN ('RECEIVE','REFUND','APPLY','UNAPPLY')),
    AmountVnd decimal(19,0) NOT NULL CHECK(AmountVnd>0),
    PaymentId bigint NULL REFERENCES pms.Payment(PaymentId),
    ReversesMovementId bigint NULL REFERENCES pms.DepositMovement(DepositMovementId),
    BusinessDate date NOT NULL REFERENCES pms.BusinessDay(BusinessDate),
    CreatedBy bigint NOT NULL REFERENCES pms.AppUser(UserId),
    CreatedAtUtc datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
    OperationKey varchar(150) COLLATE Latin1_General_100_BIN2 NOT NULL UNIQUE,
    CHECK((Kind IN ('RECEIVE','REFUND') AND PaymentId IS NOT NULL) OR (Kind IN ('APPLY','UNAPPLY') AND PaymentId IS NULL)),
    CHECK((Kind='UNAPPLY' AND ReversesMovementId IS NOT NULL) OR (Kind<>'UNAPPLY' AND ReversesMovementId IS NULL)),
    CHECK(ReversesMovementId IS NULL OR ReversesMovementId<>DepositMovementId)
);
CREATE UNIQUE INDEX UX_Deposit_Reversal ON pms.DepositMovement(ReversesMovementId) WHERE ReversesMovementId IS NOT NULL;
CREATE INDEX IX_Deposit_Movements ON pms.DepositMovement(DepositAccountId) INCLUDE(Kind,AmountVnd);
CREATE TABLE pms.FolioEntry (
    FolioEntryId bigint IDENTITY PRIMARY KEY,
    FolioId bigint NOT NULL REFERENCES pms.Folio(FolioId),
    StayId bigint NULL REFERENCES pms.Stay(StayId),
    Kind varchar(20) NOT NULL CHECK(Kind IN ('CHARGE','CHARGE_CREDIT','PAYMENT','REFUND','TRANSFER_DEBIT','TRANSFER_CREDIT','DEPOSIT_APPLY','DEPOSIT_UNAPPLY')),
    Category varchar(15) NULL CHECK(Category IN ('ROOM','SERVICE','SURCHARGE','DISCOUNT','CANCELLATION')),
    AmountVnd decimal(19,0) NOT NULL CHECK(AmountVnd>0),
    -- Positive = customer owes more. This is a folio subledger, not a general ledger.
    SignedAmountVnd AS CONVERT(decimal(19,0),CASE WHEN Kind IN ('CHARGE','REFUND','TRANSFER_DEBIT','DEPOSIT_UNAPPLY') THEN AmountVnd ELSE -AmountVnd END) PERSISTED,
    Description nvarchar(500) NOT NULL,
    PaymentId bigint NULL REFERENCES pms.Payment(PaymentId),
    DepositMovementId bigint NULL REFERENCES pms.DepositMovement(DepositMovementId),
    ServiceOrderLineId bigint NULL REFERENCES pms.ServiceOrderLine(ServiceOrderLineId),
    ReversesEntryId bigint NULL REFERENCES pms.FolioEntry(FolioEntryId),
    TransferPairId uniqueidentifier NULL,
    BusinessDate date NOT NULL REFERENCES pms.BusinessDay(BusinessDate),
    CreatedBy bigint NOT NULL REFERENCES pms.AppUser(UserId),
    CreatedAtUtc datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
    OperationKey varchar(150) COLLATE Latin1_General_100_BIN2 NOT NULL UNIQUE,
    CHECK((Kind IN ('CHARGE','CHARGE_CREDIT') AND Category IS NOT NULL) OR (Kind NOT IN ('CHARGE','CHARGE_CREDIT') AND Category IS NULL)),
    CHECK((Kind IN ('PAYMENT','REFUND') AND PaymentId IS NOT NULL) OR (Kind NOT IN ('PAYMENT','REFUND') AND PaymentId IS NULL)),
    CHECK((Kind IN ('DEPOSIT_APPLY','DEPOSIT_UNAPPLY') AND DepositMovementId IS NOT NULL) OR (Kind NOT IN ('DEPOSIT_APPLY','DEPOSIT_UNAPPLY') AND DepositMovementId IS NULL)),
    CHECK((Kind IN ('TRANSFER_DEBIT','TRANSFER_CREDIT') AND TransferPairId IS NOT NULL) OR (Kind NOT IN ('TRANSFER_DEBIT','TRANSFER_CREDIT') AND TransferPairId IS NULL)),
    CHECK(ServiceOrderLineId IS NULL OR Kind='CHARGE'),
    CHECK(ReversesEntryId IS NULL OR (Kind='CHARGE_CREDIT' AND ReversesEntryId<>FolioEntryId))
);
CREATE INDEX IX_FolioEntry_Balance ON pms.FolioEntry(FolioId) INCLUDE(SignedAmountVnd);
CREATE INDEX IX_FolioEntry_Date ON pms.FolioEntry(BusinessDate,Kind) INCLUDE(AmountVnd,Category);
CREATE UNIQUE INDEX UX_FolioEntry_Service ON pms.FolioEntry(ServiceOrderLineId) WHERE ServiceOrderLineId IS NOT NULL;
CREATE UNIQUE INDEX UX_FolioEntry_Deposit ON pms.FolioEntry(DepositMovementId) WHERE DepositMovementId IS NOT NULL;
CREATE UNIQUE INDEX UX_FolioEntry_TransferSide ON pms.FolioEntry(TransferPairId,Kind) WHERE TransferPairId IS NOT NULL;
CREATE TABLE pms.StaySettlement (
    StayId bigint NOT NULL PRIMARY KEY REFERENCES pms.Stay(StayId),
    BusinessDate date NOT NULL REFERENCES pms.BusinessDay(BusinessDate),
    TotalAmountVnd decimal(19,0) NOT NULL CHECK(TotalAmountVnd>=0),
    RoomAmountVnd decimal(19,0) NOT NULL,
    ServiceAmountVnd decimal(19,0) NOT NULL,
    SurchargeVnd decimal(19,0) NOT NULL,
    DiscountVnd decimal(19,0) NOT NULL CHECK(DiscountVnd>=0),
    SnapshotJson nvarchar(max) NOT NULL CHECK(ISJSON(SnapshotJson)=1),
    SettledBy bigint NOT NULL REFERENCES pms.AppUser(UserId),
    SettledAtUtc datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
    CHECK(TotalAmountVnd=RoomAmountVnd+ServiceAmountVnd+SurchargeVnd-DiscountVnd)
);
CREATE INDEX IX_Settlement_Date ON pms.StaySettlement(BusinessDate) INCLUDE(TotalAmountVnd);
CREATE TABLE pms.Invoice (
    InvoiceId bigint IDENTITY PRIMARY KEY,
    FolioId bigint NOT NULL REFERENCES pms.Folio(FolioId),
    InternalNumber varchar(50) NOT NULL UNIQUE,
    DocumentKind varchar(12) NOT NULL CHECK(DocumentKind IN ('RECEIPT','E_INVOICE','ADJUSTMENT')),
    AdjustsInvoiceId bigint NULL REFERENCES pms.Invoice(InvoiceId),
    Status varchar(12) NOT NULL CHECK(Status IN ('DRAFT','PENDING','ISSUED','FAILED','CANCELLED')),
    BuyerName nvarchar(200) NOT NULL,
    BuyerTaxCode varchar(30) NULL,
    BuyerAddress nvarchar(500) NULL,
    NetVnd decimal(19,0) NOT NULL,
    TaxVnd decimal(19,0) NOT NULL,
    TotalVnd decimal(19,0) NOT NULL,
    Provider varchar(50) NULL,
    ProviderDocumentId varchar(150) NULL,
    IssuedAtUtc datetime2(3) NULL,
    CreatedBy bigint NOT NULL REFERENCES pms.AppUser(UserId),
    RowVer rowversion NOT NULL,
    CHECK(TotalVnd=NetVnd+TaxVnd),
    CHECK(Status<>'ISSUED' OR IssuedAtUtc IS NOT NULL),
    CHECK(DocumentKind<>'E_INVOICE' OR Status<>'ISSUED' OR (Provider IS NOT NULL AND ProviderDocumentId IS NOT NULL)),
    CHECK((DocumentKind='ADJUSTMENT' AND AdjustsInvoiceId IS NOT NULL) OR (DocumentKind<>'ADJUSTMENT' AND AdjustsInvoiceId IS NULL)),
    CHECK(AdjustsInvoiceId IS NULL OR AdjustsInvoiceId<>InvoiceId)
);
CREATE UNIQUE INDEX UX_Invoice_Provider ON pms.Invoice(Provider,ProviderDocumentId) WHERE ProviderDocumentId IS NOT NULL;
CREATE TABLE pms.InvoiceLine (
    InvoiceLineId bigint IDENTITY PRIMARY KEY,
    InvoiceId bigint NOT NULL REFERENCES pms.Invoice(InvoiceId),
    LineNumber int NOT NULL CHECK(LineNumber>0),
    FolioEntryId bigint NULL REFERENCES pms.FolioEntry(FolioEntryId),
    Description nvarchar(500) NOT NULL,
    Quantity decimal(12,3) NOT NULL CHECK(Quantity>0),
    UnitPriceVnd decimal(19,0) NOT NULL,
    NetVnd decimal(19,0) NOT NULL,
    TaxRate decimal(5,2) NULL CHECK(TaxRate BETWEEN 0 AND 100),
    TaxVnd decimal(19,0) NOT NULL,
    TotalVnd decimal(19,0) NOT NULL,
    UNIQUE(InvoiceId,LineNumber),
    CHECK(TotalVnd=NetVnd+TaxVnd)
);
CREATE TABLE pms.HousekeepingTask (
    TaskId bigint IDENTITY PRIMARY KEY,
    RoomId int NOT NULL REFERENCES pms.Room(RoomId),
    StayId bigint NULL REFERENCES pms.Stay(StayId),
    TaskType varchar(15) NOT NULL CHECK(TaskType IN ('DEPARTURE','STAYOVER','INSPECTION','OTHER')),
    Status varchar(12) NOT NULL CHECK(Status IN ('PENDING','IN_PROGRESS','INSPECTING','COMPLETED','CANCELLED')),
    AssignedTo bigint NULL REFERENCES pms.AppUser(UserId),
    InspectedBy bigint NULL REFERENCES pms.AppUser(UserId),
    CreatedAtUtc datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
    CompletedAtUtc datetime2(3) NULL,
    Notes nvarchar(1000) NULL,
    RowVer rowversion NOT NULL,
    CHECK(Status<>'COMPLETED' OR CompletedAtUtc IS NOT NULL)
);
CREATE INDEX IX_Housekeeping_WorkQueue ON pms.HousekeepingTask(Status,AssignedTo,RoomId);
CREATE TABLE pms.MinibarAudit (
    MinibarAuditId bigint IDENTITY PRIMARY KEY,
    StayId bigint NOT NULL REFERENCES pms.Stay(StayId),
    RoomId int NOT NULL REFERENCES pms.Room(RoomId),
    Status varchar(12) NOT NULL CHECK(Status IN ('PENDING','CONFIRMED','DISPUTED')),
    CheckedBy bigint NOT NULL REFERENCES pms.AppUser(UserId),
    CheckedAtUtc datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
    Notes nvarchar(1000) NULL,
    RowVer rowversion NOT NULL
);
CREATE TABLE pms.MinibarAuditLine (
    MinibarAuditId bigint NOT NULL REFERENCES pms.MinibarAudit(MinibarAuditId),
    ServiceId int NOT NULL REFERENCES pms.Service(ServiceId),
    ConsumedQuantity int NOT NULL CHECK(ConsumedQuantity>=0),
    ServiceOrderLineId bigint NULL REFERENCES pms.ServiceOrderLine(ServiceOrderLineId),
    PRIMARY KEY(MinibarAuditId,ServiceId)
);
CREATE UNIQUE INDEX UX_Minibar_ServiceLine ON pms.MinibarAuditLine(ServiceOrderLineId) WHERE ServiceOrderLineId IS NOT NULL;
CREATE TABLE pms.LostFound (
    LostFoundId bigint IDENTITY PRIMARY KEY,
    RoomId int NULL REFERENCES pms.Room(RoomId),
    StayId bigint NULL REFERENCES pms.Stay(StayId),
    Description nvarchar(1000) NOT NULL,
    StorageLocation nvarchar(250) NOT NULL,
    Status varchar(12) NOT NULL CHECK(Status IN ('STORED','RETURNED','DISPOSED')),
    FoundBy bigint NOT NULL REFERENCES pms.AppUser(UserId),
    FoundAtUtc datetime2(3) NOT NULL,
    ReturnedToCustomerId bigint NULL REFERENCES pms.Customer(CustomerId),
    ResolvedAtUtc datetime2(3) NULL,
    Notes nvarchar(1000) NULL
);
CREATE TABLE pms.ExceptionCase (
    ExceptionCaseId bigint IDENTITY PRIMARY KEY,
    BookingId bigint NULL REFERENCES pms.Booking(BookingId),
    StayId bigint NULL REFERENCES pms.Stay(StayId),
    RoomId int NULL REFERENCES pms.Room(RoomId),
    Kind varchar(40) NOT NULL,
    Description nvarchar(2000) NOT NULL,
    Status varchar(12) NOT NULL CHECK(Status IN ('OPEN','RESOLVED','REJECTED')),
    CreatedBy bigint NOT NULL REFERENCES pms.AppUser(UserId),
    CreatedAtUtc datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
    ResolvedBy bigint NULL REFERENCES pms.AppUser(UserId),
    ResolvedAtUtc datetime2(3) NULL,
    Resolution nvarchar(2000) NULL
);
CREATE TABLE pms.GatewayEvent (
    GatewayEventId bigint IDENTITY PRIMARY KEY,
    Provider varchar(40) NOT NULL,
    EventKey varchar(150) COLLATE Latin1_General_100_BIN2 NOT NULL,
    PaymentId bigint NULL REFERENCES pms.Payment(PaymentId),
    PayloadHash binary(32) NOT NULL,
    SignatureVerified bit NOT NULL,
    Status varchar(12) NOT NULL CHECK(Status IN ('RECEIVED','PROCESSED','REJECTED')),
    ReceivedAtUtc datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
    ProcessedAtUtc datetime2(3) NULL,
    UNIQUE(Provider,EventKey),
    CHECK(Status<>'PROCESSED' OR (SignatureVerified=1 AND PaymentId IS NOT NULL AND ProcessedAtUtc IS NOT NULL))
);
CREATE TABLE pms.AuditLog (
    AuditLogId bigint IDENTITY PRIMARY KEY,
    ActorId bigint NULL REFERENCES pms.AppUser(UserId),
    Action varchar(80) NOT NULL,
    EntityType varchar(60) NOT NULL,
    EntityKey varchar(100) NOT NULL,
    RequestId uniqueidentifier NULL REFERENCES pms.ApiRequest(RequestId),
    BeforeJson nvarchar(max) NULL CHECK(BeforeJson IS NULL OR ISJSON(BeforeJson)=1),
    AfterJson nvarchar(max) NULL CHECK(AfterJson IS NULL OR ISJSON(AfterJson)=1),
    Reason nvarchar(1000) NULL,
    CreatedAtUtc datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_Audit_Entity ON pms.AuditLog(EntityType,EntityKey,CreatedAtUtc);
CREATE INDEX IX_Audit_ActorTime ON pms.AuditLog(ActorId,CreatedAtUtc);
CREATE TABLE pms.MigrationMap (
    SourceDataset varchar(80) NOT NULL,
    SourceCollection varchar(60) NOT NULL,
    LegacyId varchar(100) NOT NULL,
    TargetEntity varchar(60) NOT NULL,
    TargetId bigint NOT NULL,
    ImportedAtUtc datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
    PRIMARY KEY(SourceDataset,SourceCollection,LegacyId,TargetEntity,TargetId)
);
INSERT pms.SchemaVersion(Version) VALUES(1);
COMMIT;
