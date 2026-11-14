-- Synthetic test fixtures only. Every scenario rolls back; never run in the application DB.
INSERT pms.AppUser(Username,FullName) VALUES(N'test-only',N'Nhân viên kiểm thử');
DECLARE @u bigint=SCOPE_IDENTITY();
INSERT pms.BusinessDay(BusinessDate,Status,ClosedAtUtc,ClosedBy,SnapshotJson)
VALUES('20300101','CLOSED',SYSUTCDATETIME(),@u,N'{}');
INSERT pms.BusinessDay(BusinessDate) VALUES('20300102');
INSERT pms.Customer(Code,FullName) VALUES('TEST-KH',N'Khách kiểm thử');
DECLARE @customer bigint=SCOPE_IDENTITY();
INSERT pms.RoomType(Code,Name,StandardOccupancy,MaxOccupancy) VALUES('TEST-TYPE',N'Hạng kiểm thử',2,3);
DECLARE @type int=SCOPE_IDENTITY();
INSERT pms.Room(Number,RoomTypeId,FloorLabel,CleanStatus) VALUES('TEST-101',@type,N'1','CLEAN');
DECLARE @room1 int=SCOPE_IDENTITY();
INSERT pms.Room(Number,RoomTypeId,FloorLabel,CleanStatus) VALUES('TEST-102',@type,N'1','DIRTY');
DECLARE @room2 int=SCOPE_IDENTITY();
INSERT pms.Booking(Code,BookingKind,CustomerId,GroupName,ContactName,Status,CreatedBy)
VALUES('TEST-BOOKING','GROUP',@customer,N'Đoàn kiểm thử',N'Đại diện','CONFIRMED',@u);
DECLARE @booking bigint=SCOPE_IDENTITY();
INSERT pms.BookingRoom(BookingId,LineNumber,RoomTypeId,StayType,ArrivalDate,DepartureDate,StartsAtUtc,EndsAtUtc,Adults,Status,QuotedTotalVnd,RateSnapshotJson)
VALUES(@booking,1,@type,'NIGHTLY','20300102','20300103','2030-01-02T07:00:00','2030-01-03T05:00:00',2,'CONFIRMED',1000,N'{}');
DECLARE @b1 bigint=SCOPE_IDENTITY();
INSERT pms.BookingRoom(BookingId,LineNumber,RoomTypeId,StayType,ArrivalDate,DepartureDate,StartsAtUtc,EndsAtUtc,Adults,Status,QuotedTotalVnd,RateSnapshotJson)
VALUES(@booking,2,@type,'NIGHTLY','20300102','20300103','2030-01-02T07:00:00','2030-01-03T05:00:00',2,'CONFIRMED',1000,N'{}');
DECLARE @b2 bigint=SCOPE_IDENTITY();
INSERT pms.Folio(Code,BookingId,BookingRoomId,Kind,PayerCustomerId) VALUES('TEST-F-ROOM',@booking,@b1,'ROOM',@customer);
DECLARE @folioRoom bigint=SCOPE_IDENTITY();
INSERT pms.Folio(Code,BookingId,Kind,PayerCustomerId) VALUES('TEST-F-MASTER',@booking,'MASTER',@customer);
DECLARE @folioMaster bigint=SCOPE_IDENTITY();
DECLARE @request uniqueidentifier=NEWID();
INSERT pms.ApiRequest(RequestId,ActorId,Operation,IdempotencyKey,RequestHash,Status)
VALUES(@request,@u,'COLLECT','TEST-KEY',HASHBYTES('SHA2_256','test'),'SUCCEEDED');
INSERT pms.Payment(Code,BookingId,Direction,Purpose,AmountVnd,Method,Status,BusinessDate,RecordedBy,SucceededAtUtc,RequestId)
VALUES('TEST-PAYMENT',@booking,'IN','SETTLEMENT',1000,'CASH','SUCCEEDED','20300101',@u,SYSUTCDATETIME(),@request);
DECLARE @payment bigint=SCOPE_IDENTITY();
