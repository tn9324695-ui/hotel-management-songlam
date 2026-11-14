-- Follow-up migration: preserve the existing application's mandatory cancellation reason.
SET XACT_ABORT ON; SET NOCOUNT ON; SET QUOTED_IDENTIFIER ON; SET ANSI_NULLS ON;
IF NOT EXISTS(SELECT 1 FROM pms.SchemaVersion WHERE Version=2)
 OR EXISTS(SELECT 1 FROM pms.SchemaVersion WHERE Version=3)
 THROW 52000,'Expected schema version 2.',1;
BEGIN TRANSACTION;
EXEC pms.usp_LockInventory;
ALTER TABLE pms.BookingRoom ADD CancellationReason nvarchar(1000) NULL;
GO
ALTER TABLE pms.BookingRoom WITH CHECK ADD CONSTRAINT CK_BookingRoom_CancellationReason
 CHECK(Status<>'CANCELLED' OR NULLIF(LTRIM(RTRIM(CancellationReason)),N'') IS NOT NULL);
UPDATE pms.MutationRule SET AllowedColumns=N'Status,CancellationReason'
 WHERE Operation='CANCEL_BOOKING' AND Entity='BookingRoom' AND Verb='update';
INSERT pms.SchemaVersion(Version) VALUES(3);
COMMIT;
GO
