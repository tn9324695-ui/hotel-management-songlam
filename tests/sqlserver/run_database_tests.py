r"""Real SQL Server tests. Creates/drops only its own UUID-named disposable database.

python tests/sqlserver/run_database_tests.py --server 'lpc:.\SQLEXPRESS'
Requires local sqlcmd and Windows Authentication. Never accepts an application DB name.
"""
from pathlib import Path
import argparse
import json
import re
import shutil
import subprocess
import sys
import time
import uuid

ROOT = Path(__file__).resolve().parents[2]
SQL_DIR = ROOT / 'database' / 'sqlserver'
FIXTURE = Path(__file__).with_name('fixture.sql').read_text(encoding='utf-8')
SETTINGS = '''SET NOCOUNT ON; SET XACT_ABORT ON; SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON; SET ANSI_PADDING ON; SET ANSI_WARNINGS ON;
SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET NUMERIC_ROUNDABORT OFF;
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
'''

ASSIGN1 = '''INSERT pms.RoomAllocation(RoomId,BookingRoomId,StartsAtUtc,EndsAtUtc,CreatedBy)
SELECT @room1,@b1,StartsAtUtc,EndsAtUtc,@u FROM pms.BookingRoom WHERE BookingRoomId=@b1;'''
CHARGE = '''INSERT pms.FolioEntry(FolioId,Kind,Category,AmountVnd,Description,BusinessDate,CreatedBy,OperationKey)
VALUES(@folioRoom,'CHARGE','ROOM',1000,N'Tiền phòng','20300102',@u,'test-charge');'''
EXTRA_BOOKING = '''INSERT pms.BookingRoom(BookingId,LineNumber,RoomTypeId,StayType,ArrivalDate,DepartureDate,StartsAtUtc,EndsAtUtc,Adults,Status,QuotedTotalVnd,RateSnapshotJson)
SELECT @booking,3,@type,StayType,ArrivalDate,DepartureDate,StartsAtUtc,EndsAtUtc,2,'CONFIRMED',1000,N'{}'
FROM pms.BookingRoom WHERE BookingRoomId=@b1;'''
STAY = ASSIGN1 + '''
DECLARE @alloc bigint=SCOPE_IDENTITY();
INSERT pms.Stay(Code,BookingRoomId,Status,CheckedInAtUtc,ExpectedOutAtUtc,CheckedInBy,PricingSnapshotJson)
VALUES('TEST-STAY',@b1,'IN_HOUSE','2030-01-02T07:00:00','2030-01-03T05:00:00',@u,N'{}');
DECLARE @stay bigint=SCOPE_IDENTITY();
INSERT pms.StayRoomSegment(StayId,AllocationId,RoomId,ArrivedAtUtc)
VALUES(@stay,@alloc,@room1,'2030-01-02T07:00:00');
'''

CASES = [
    ('negative rate rejected', "INSERT pms.Service(Code,Name,Category,Unit,PriceVnd) VALUES('BAD',N'X','MINIBAR',N'chai',-1);", (547,)),
    ('foreign key protects room type', "INSERT pms.Room(Number,RoomTypeId,FloorLabel) VALUES('BAD',-1,N'1');", (547,)),
    ('invalid date interval rejected', 'UPDATE pms.BookingRoom SET EndsAtUtc=StartsAtUtc WHERE BookingRoomId=@b1;', (547,)),
    ('zero payment rejected', 'UPDATE pms.Payment SET AmountVnd=0 WHERE PaymentId=@payment;', (547,)),
    ('idempotency key is unique', "INSERT pms.ApiRequest(ActorId,Operation,IdempotencyKey,RequestHash,Status) VALUES(@u,'COLLECT','TEST-KEY',HASHBYTES('SHA2_256','other'),'PROCESSING');", (2601,2627)),
    ('one open business day', "INSERT pms.BusinessDay(BusinessDate) VALUES('20300103');", (2601,2627)),
    ('inventory lock is mandatory', 'EXEC pms.usp_AssertInventory;', (51003,)),
    ('two unassigned rooms fit capacity', 'EXEC pms.usp_LockInventory; EXEC pms.usp_AssertInventory;', ()),
    ('unassigned group demand cannot oversell', 'EXEC pms.usp_LockInventory;' + EXTRA_BOOKING + 'EXEC pms.usp_AssertInventory;', (51006,)),
    ('assignment does not double count demand', 'EXEC pms.usp_LockInventory;' + ASSIGN1 + 'EXEC pms.usp_AssertInventory;', ()),
    ('overlap on a physical room rejected', 'EXEC pms.usp_LockInventory;' + ASSIGN1 + '''
INSERT pms.RoomAllocation(RoomId,BookingRoomId,StartsAtUtc,EndsAtUtc,CreatedBy)
SELECT @room1,@b2,StartsAtUtc,EndsAtUtc,@u FROM pms.BookingRoom WHERE BookingRoomId=@b2;
EXEC pms.usp_AssertInventory;''', (51005,)),
    ('adjacent hourly intervals allowed', '''EXEC pms.usp_LockInventory;
UPDATE pms.BookingRoom SET StayType='HOURLY',ArrivalDate='20300102',DepartureDate='20300102',
StartsAtUtc=CASE WHEN BookingRoomId=@b1 THEN '2030-01-02T07:00:00' ELSE '2030-01-02T08:00:00' END,
EndsAtUtc=CASE WHEN BookingRoomId=@b1 THEN '2030-01-02T08:00:00' ELSE '2030-01-02T09:00:00' END;
INSERT pms.RoomAllocation(RoomId,BookingRoomId,StartsAtUtc,EndsAtUtc,CreatedBy)
SELECT @room1,BookingRoomId,StartsAtUtc,EndsAtUtc,@u FROM pms.BookingRoom;
EXEC pms.usp_AssertInventory;''', ()),
    ('maintenance subtracts capacity', '''EXEC pms.usp_LockInventory;
INSERT pms.RoomAllocation(RoomId,BlockReason,StartsAtUtc,EndsAtUtc,CreatedBy)
VALUES(@room1,N'Bảo trì','2030-01-02T07:00:00','2030-01-03T05:00:00',@u);
EXEC pms.usp_AssertInventory;''', (51006,)),
    ('cancelled booking releases demand', 'EXEC pms.usp_LockInventory;' + EXTRA_BOOKING + "UPDATE pms.BookingRoom SET Status='CANCELLED' WHERE BookingRoomId=@b1; EXEC pms.usp_AssertInventory;", ()),
    ('upgrade consumes actual type', '''EXEC pms.usp_LockInventory;
INSERT pms.RoomType(Code,Name,StandardOccupancy,MaxOccupancy) VALUES('TEST-UPGRADE',N'Nâng hạng',2,3);
DECLARE @upgrade int=SCOPE_IDENTITY();
UPDATE pms.Room SET RoomTypeId=@upgrade WHERE RoomId=@room1;''' + ASSIGN1 + '''
EXEC pms.usp_AssertInventory;
IF NOT EXISTS(SELECT 1 FROM pms.vInventoryDemand WHERE BookingRoomId=@b1 AND RoomTypeId=@upgrade) THROW 51990,'Upgrade demand missing.',1;''', ()),
    ('inactive assigned room rejected', 'EXEC pms.usp_LockInventory;' + ASSIGN1 + 'UPDATE pms.Room SET IsActive=0 WHERE RoomId=@room1; EXEC pms.usp_AssertInventory;', (51004,)),
    ('one actual stay per physical room', STAY + '''
INSERT pms.Stay(Code,BookingRoomId,Status,CheckedInAtUtc,ExpectedOutAtUtc,CheckedInBy,PricingSnapshotJson)
VALUES('TEST-STAY-2',@b2,'IN_HOUSE','2030-01-02T07:00:00','2030-01-03T05:00:00',@u,N'{}');
DECLARE @stay2 bigint=SCOPE_IDENTITY();
INSERT pms.StayRoomSegment(StayId,AllocationId,RoomId,ArrivedAtUtc)
VALUES(@stay2,@alloc,@room1,'2030-01-02T07:00:00');''', (2601,2627)),
    ('room states are independent', STAY + '''
UPDATE pms.Room SET CleanStatus='DIRTY' WHERE RoomId=@room1;
IF NOT EXISTS(SELECT 1 FROM pms.vRoomStatus WHERE RoomId=@room1 AND StayStatus='OCCUPIED' AND CleanStatus='DIRTY' AND ExploitationStatus='ACTIVE') THROW 51990,'Room states conflated.',1;''', ()),
    ('master debt survives checkout', STAY + CHARGE + '''
DECLARE @pair uniqueidentifier=NEWID();
INSERT pms.FolioEntry(FolioId,Kind,AmountVnd,Description,TransferPairId,BusinessDate,CreatedBy,OperationKey)
VALUES(@folioRoom,'TRANSFER_CREDIT',1000,N'Chuyển đoàn',@pair,'20300102',@u,'test-out'),
      (@folioMaster,'TRANSFER_DEBIT',1000,N'Nhận từ phòng',@pair,'20300102',@u,'test-in');
UPDATE pms.StayRoomSegment SET DepartedAtUtc='2030-01-03T04:00:00' WHERE StayId=@stay;
UPDATE pms.Stay SET Status='CHECKED_OUT',CheckedOutAtUtc='2030-01-03T04:00:00',CheckedOutBy=@u WHERE StayId=@stay;
IF (SELECT BalanceVnd FROM pms.vFolioBalance WHERE FolioId=@folioRoom)<>0 THROW 51990,'Room transfer unbalanced.',1;
IF (SELECT BalanceVnd FROM pms.vFolioBalance WHERE FolioId=@folioMaster)<>1000 THROW 51990,'Master debt lost.',1;
IF (SELECT SUM(AmountVnd) FROM pms.Payment)<>1000 THROW 51990,'Transfer created cash.',1;''', ()),
    ('deposit is liability not revenue', '''
UPDATE pms.Payment SET Purpose='BOOKING_DEPOSIT' WHERE PaymentId=@payment;
INSERT pms.DepositAccount(BookingId,Kind) VALUES(@booking,'BOOKING');
DECLARE @account bigint=SCOPE_IDENTITY();
INSERT pms.DepositMovement(DepositAccountId,Kind,AmountVnd,PaymentId,BusinessDate,CreatedBy,OperationKey)
VALUES(@account,'RECEIVE',1000,@payment,'20300101',@u,'test-deposit');
IF (SELECT BalanceVnd FROM pms.vDepositBalance WHERE DepositAccountId=@account)<>1000 THROW 51990,'Deposit balance wrong.',1;
IF EXISTS(SELECT 1 FROM pms.vSettledRevenueDaily) THROW 51990,'Deposit counted as revenue.',1;''', ()),
    ('refund-only day has negative net cash', '''
DECLARE @refundRequest uniqueidentifier=NEWID();
INSERT pms.ApiRequest(RequestId,ActorId,Operation,IdempotencyKey,RequestHash,Status)
VALUES(@refundRequest,@u,'REFUND','REFUND-KEY',HASHBYTES('SHA2_256','refund'),'SUCCEEDED');
INSERT pms.Payment(Code,BookingId,OriginalPaymentId,Direction,Purpose,AmountVnd,Method,Status,BusinessDate,RecordedBy,SucceededAtUtc,RequestId)
VALUES('TEST-REFUND',@booking,@payment,'OUT','REFUND',500,'CASH','SUCCEEDED','20300102',@u,SYSUTCDATETIME(),@refundRequest);
IF (SELECT NetCashFlowVnd FROM pms.vCashFlowDaily WHERE BusinessDate='20300102')<>-500 THROW 51990,'Negative cash flow clipped.',1;''', ()),
    ('completed refund needs payout link', "INSERT pms.RefundRequest(OriginalPaymentId,AmountVnd,Reason,Status,RequestedBy,ApprovedBy,ApprovedAtUtc) VALUES(@payment,100,N'Test','COMPLETED',@u,@u,SYSUTCDATETIME());", (547,)),
    ('gateway event replay rejected', '''
INSERT pms.GatewayEvent(Provider,EventKey,PayloadHash,SignatureVerified,Status)
VALUES('TEST','event-1',HASHBYTES('SHA2_256','event'),0,'REJECTED');
INSERT pms.GatewayEvent(Provider,EventKey,PayloadHash,SignatureVerified,Status)
VALUES('TEST','event-1',HASHBYTES('SHA2_256','event'),0,'REJECTED');''', (2601,2627)),
    ('folio history cannot be overwritten', CHARGE + 'UPDATE pms.FolioEntry SET AmountVnd=1;', (51010,)),
]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--server', default=r'lpc:.\SQLEXPRESS')
    args = parser.parse_args()
    sqlcmd = shutil.which('sqlcmd')
    if not sqlcmd:
        raise RuntimeError('sqlcmd not found; install SQL Server command-line tools.')
    db = 'SongLamDesignTest_' + uuid.uuid4().hex
    base = [sqlcmd, '-S', args.server, '-E', '-C', '-b', '-l', '10', '-f', '65001', '-h', '-1', '-W']
    results = []

    def run(sql, database=db, timeout=25):
        proc = subprocess.run(base + ['-d', database], input=SETTINGS + sql + '\nGO\n',
                              encoding='utf-8', capture_output=True, timeout=timeout)
        if proc.returncode:
            raise RuntimeError(proc.stdout + proc.stderr)
        return proc.stdout.strip()

    def passed(name):
        results.append(name)
        print('[PASS]', name, flush=True)

    created = False
    try:
        run(f'CREATE DATABASE [{db}] COLLATE Vietnamese_100_CI_AS;', 'master')
        created = True
        for file in ('001_schema.sql', '002_views_and_inventory.sql', '003_reference_seed.sql'):
            run((SQL_DIR / file).read_text(encoding='utf-8'))
        passed('all scripts compile on SQL Server')
        run("IF EXISTS(SELECT 1 FROM pms.Customer) OR EXISTS(SELECT 1 FROM pms.AppUser) OR EXISTS(SELECT 1 FROM pms.Payment) THROW 51990,'Unexpected operational sample data.',1;")
        passed('no sample customers, passwords or money seeded')

        # Compare permissions to the existing application, not a second hand-written matrix.
        code = "const fs=require('fs'),vm=require('vm');console.log(JSON.stringify(vm.runInNewContext(fs.readFileSync('js/data.js','utf8')+';INITIAL_DATA.roles;')));"
        original = json.loads(subprocess.check_output(['node', '-e', code], cwd=ROOT, encoding='utf-8'))
        expected = sorted(r['code'] + '|' + p for r in original for p, granted in r['permissions'].items() if granted)
        actual = sorted(run("SELECT r.Code+'|'+p.Code FROM pms.RolePermission rp JOIN pms.AppRole r ON r.RoleId=rp.RoleId JOIN pms.Permission p ON p.PermissionId=rp.PermissionId;").splitlines())
        if expected != actual:
            raise AssertionError('Seed differs from existing role permission matrix.')
        passed('RBAC exactly matches current role matrix')

        for name, body, errors in CASES:
            expected_sql = ','.join(map(str, errors)) or '-1'
            missing_rejection = "THROW 51999,'Expected rejection did not occur.',1;" if errors else ''
            # Each fixture exists only inside this transaction, including negative tests.
            batch = f'''BEGIN TRY
BEGIN TRANSACTION;
{FIXTURE}
{body}
{missing_rejection}
ROLLBACK;
END TRY
BEGIN CATCH
DECLARE @error int=ERROR_NUMBER();
IF XACT_STATE()<>0 ROLLBACK;
IF @error NOT IN ({expected_sql}) THROW;
END CATCH;'''
            run(batch)
            passed(name)

        try:
            run('EXEC pms.usp_LockInventory;')
            raise AssertionError('Lock acquired outside transaction.')
        except RuntimeError as exc:
            if '51001' not in str(exc):
                raise
        passed('lock requires explicit transaction')

        # Two real connections; the second must fail while the first owns the lock.
        holder_sql = SETTINGS + "BEGIN TRAN; EXEC pms.usp_LockInventory; WAITFOR DELAY '00:00:08'; ROLLBACK;"
        holder = subprocess.Popen(base + ['-d', db, '-Q', holder_sql], stdout=subprocess.PIPE,
                                  stderr=subprocess.STDOUT, text=True, encoding='utf-8')
        try:
            # sqlcmd may buffer stdout until exit, even with RAISERROR NOWAIT.
            # Observe the granted server lock instead of trusting stdout timing.
            for _ in range(20):
                acquired = run("SELECT COUNT(*) FROM sys.dm_tran_locks WHERE resource_type='APPLICATION' AND resource_database_id=DB_ID() AND request_status='GRANT';")
                if acquired == '1':
                    break
                time.sleep(0.05)
            else:
                raise AssertionError('First connection did not acquire inventory lock.')
            try:
                run('BEGIN TRAN; EXEC pms.usp_LockInventory @TimeoutMs=100; ROLLBACK;')
                raise AssertionError('Second connection bypassed inventory mutex.')
            except RuntimeError as exc:
                if '51002' not in str(exc):
                    raise
            if holder.wait(timeout=10) != 0:
                raise AssertionError('Lock holder failed.')
        finally:
            if holder.poll() is None:
                holder.kill()
                holder.wait()
        passed('two concurrent connections cannot own inventory lock')
        run('BEGIN TRAN; EXEC pms.usp_LockInventory @TimeoutMs=100; EXEC pms.usp_AssertInventory; ROLLBACK;')
        passed('rollback releases inventory lock')
        print(f'RESULT: {len(results)}/{len(results)} PASSED')
    finally:
        # Only remove the database generated and successfully created by THIS invocation.
        if created:
            if not re.fullmatch(r'SongLamDesignTest_[0-9a-f]{32}', db):
                raise RuntimeError('Refusing cleanup of unexpected database name.')
            run(f'ALTER DATABASE [{db}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [{db}];', 'master')
            print('Removed disposable test database:', db)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    try:
        main()
    except Exception as error:
        print('[FAIL]', error, file=sys.stderr)
        sys.exit(1)
