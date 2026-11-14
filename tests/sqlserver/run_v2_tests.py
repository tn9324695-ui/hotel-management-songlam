"""SQL Server v2: test real command boundary, invalid batches, replay and concurrency.
Only creates/drops SongLamV2Test_<uuid> owned by this invocation.
"""
from pathlib import Path
import argparse
import concurrent.futures
import datetime as dt
import json
import re
import shutil
import subprocess
import sys
import uuid

ROOT = Path(__file__).resolve().parents[2]
SQL = ROOT / 'database' / 'sqlserver'
SET = '''SET NOCOUNT ON; SET XACT_ABORT ON; SET QUOTED_IDENTIFIER ON; SET ANSI_NULLS ON;
SET ANSI_WARNINGS ON; SET ANSI_PADDING ON; SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON; SET NUMERIC_ROUNDABORT OFF;
'''
FILES = ['001_schema.sql', '002_views_and_inventory.sql', '003_reference_seed.sql',
         '004_business_contract.sql', '005_business_validation.sql', '006_command_gateway.sql', '007_enforce_access.sql', '008_cancellation_reason.sql']


def literal(s):
    return "N'" + str(s).replace("'", "''") + "'"


def insert(entity, values, ref=None):
    result = dict(entity=entity, verb='insert', values=values)
    if ref:
        result['ref'] = ref
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--server', default=r'lpc:.\SQLEXPRESS')
    args = parser.parse_args()
    db = 'SongLamV2Test_' + uuid.uuid4().hex
    binary = shutil.which('sqlcmd')
    if not binary:
        raise RuntimeError('sqlcmd is required.')
    base = [binary, '-S', args.server, '-E', '-C', '-b', '-l', '10', '-f', '65001', '-y', '0']
    passed = []
    created = False

    def run(sql, database=db, expected=()):
        p = subprocess.run(base + ['-d', database], input=SET + sql + '\nGO\n', capture_output=True, text=True, encoding='utf-8', timeout=45)
        output = (p.stdout + p.stderr).strip()
        if expected:
            if p.returncode == 0 or not any(re.search(r'\b' + str(code) + r'\b', output) for code in expected):
                raise AssertionError(f'Expected SQL error {expected}, got exit {p.returncode}: {output}')
        elif p.returncode:
            raise RuntimeError(output)
        return output

    def ok(name):
        passed.append(name)
        print('[PASS]', name, flush=True)

    def query(sql):
        out = run(sql + ' FOR JSON PATH;')
        return decode(out)

    def decode(out):
        match=re.search(r'(?m)^[\[{]',out)
        if not match:
            raise ValueError('JSON result missing: '+out)
        return json.loads(''.join(out[match.start():].splitlines()))

    def command(operation, changes, user='test_manager', key=None, expected=()):
        key = key or uuid.uuid4().hex
        payload = json.dumps(changes, ensure_ascii=False, separators=(',', ':'))
        sql = f"EXECUTE AS USER={literal(user)}; EXEC pms.usp_ExecuteCommand @Operation={literal(operation)},@IdempotencyKey={literal(key)},@Changes={literal(payload)}; REVERT;"
        try:
            out = run(sql, expected=expected)
        except RuntimeError as exc:
            raise RuntimeError(str(exc)+'\nTest payload: '+payload) from exc
        return None if expected else decode(out)

    def update(entity, key, values):
        if entity in ('StayRoomSegment','StayGuest','BookingNightRate','LostFound','ExceptionCase'):
            return dict(entity=entity,verb='update',key=key,values=values)
        where = ' AND '.join('[' + k + ']=' + (str(v) if isinstance(v, int) else literal(v)) for k, v in key.items())
        rows = query(f"SELECT CONVERT(varchar(18),CONVERT(binary(8),RowVer),1) version FROM pms.[{entity}] WHERE {where}")
        return dict(entity=entity, verb='update', key=key, version=rows[0]['version'], values=values)

    try:
        run(f'CREATE DATABASE [{db}] COLLATE Vietnamese_100_CI_AS;', 'master')
        created = True
        # 004 starts one transaction; 007 commits it, all on this one connection.
        run('\nGO\n'.join((SQL / f).read_text(encoding='utf-8') for f in FILES))
        ok('all migrations compile and final schema validates')
        run('''
CREATE USER test_manager WITHOUT LOGIN; CREATE USER test_reception WITHOUT LOGIN;
CREATE USER test_housekeeping WITHOUT LOGIN; CREATE USER test_unbound WITHOUT LOGIN;
ALTER ROLE pms_executor ADD MEMBER test_manager; ALTER ROLE pms_executor ADD MEMBER test_reception;
ALTER ROLE pms_executor ADD MEMBER test_housekeeping; ALTER ROLE pms_executor ADD MEMBER test_unbound;
INSERT pms.AppUser(Username,FullName,ExternalSubject,IsActive) VALUES
('v2-manager',N'Test manager','test-manager-only',1),('v2-reception',N'Test reception','test-reception-only',1),
('v2-housekeeping',N'Test housekeeping','test-housekeeping-only',1);
INSERT pms.PrincipalBinding SELECT d.sid,u.UserId FROM sys.database_principals d
JOIN pms.AppUser u ON u.Username=REPLACE(d.name,'test_','v2-') WHERE d.name IN ('test_manager','test_reception','test_housekeeping');
INSERT pms.UserRole SELECT u.UserId,r.RoleId FROM pms.AppUser u JOIN pms.AppRole r
ON r.Code=CASE u.Username WHEN 'v2-manager' THEN 'manager' WHEN 'v2-reception' THEN 'receptionist' ELSE 'housekeeping' END;
DECLARE @day date=CONVERT(date,DATEADD(hour,7,SYSUTCDATETIME()));
INSERT pms.BusinessDay(BusinessDate) VALUES(@day);
INSERT pms.HotelSettings(HotelId,Name,WorkingDate) VALUES(1,N'Kiểm thử riêng',@day);
INSERT pms.RoomType(Code,Name,StandardOccupancy,MaxOccupancy) VALUES('TEST',N'Test',2,3);
INSERT pms.Room(Number,RoomTypeId,FloorLabel,CleanStatus) SELECT '101',RoomTypeId,N'1','CLEAN' FROM pms.RoomType;
INSERT pms.Room(Number,RoomTypeId,FloorLabel,CleanStatus) SELECT '102',RoomTypeId,N'1','DIRTY' FROM pms.RoomType;
INSERT pms.Customer(Code,FullName) VALUES('TEST',N'Khách thử');
INSERT pms.Service(Code,Name,Category,Unit,PriceVnd) VALUES('WATER',N'Nước','MINIBAR',N'chai',50);
INSERT pms.PolicyVersion(Code,Version,EffectiveFromUtc,RulesJson,CreatedBy)
SELECT 'TEST',1,SYSUTCDATETIME(),N'{}',MIN(UserId) FROM pms.AppUser;
INSERT pms.RatePlan(Code,Name,StayType,PolicyVersionId) VALUES('NIGHT',N'Night','NIGHTLY',1),('HOUR',N'Hour','HOURLY',1);
INSERT pms.RateRule(RatePlanId,RoomTypeId,ValidFrom,ValidTo,DayKind,PriceVnd)
VALUES(1,1,DATEADD(day,-1,@day),DATEADD(year,10,@day),'BASE',1000);
INSERT pms.RateRule(RatePlanId,RoomTypeId,ValidFrom,ValidTo,DayKind,PriceVnd,IncludedMinutes,ExtraBlockMinutes,ExtraBlockPriceVnd)
VALUES(2,1,DATEADD(day,-1,@day),DATEADD(year,10,@day),'BASE',200,120,60,100);
''')
        info = query("SELECT h.WorkingDate,CONVERT(varchar(30),DATEADD(minute,-5,SYSUTCDATETIME()),126) starts,CONVERT(varchar(30),DATEADD(day,1,SYSUTCDATETIME()),126) ends,(SELECT MIN(UserId) FROM pms.AppUser) actor FROM pms.HotelSettings h")[0]
        day = info['WorkingDate']
        departure = str(dt.date.fromisoformat(day) + dt.timedelta(days=1))
        starts, ends = info['starts'], info['ends']
        run("EXECUTE AS USER='test_manager'; UPDATE pms.Room SET CleanStatus='CLEAN';", expected=(229,))
        ok('runtime cannot write tables directly')
        run("EXECUTE AS USER='test_manager'; EXEC pms.usp_ApplyCommand 1,'CONFIG','x',N'[]';", expected=(229,))
        ok('runtime cannot invoke private privileged module')
        run("BEGIN TRAN; EXEC pms.usp_LockInventory; INSERT pms.Booking(Code,BookingKind,CustomerId,ContactName,Status,CreatedBy) SELECT 'DIRECT','INDIVIDUAL',1,N'Test','CONFIRMED',MIN(UserId) FROM pms.AppUser;",expected=(52500,))
        ok('raw SQL cannot bypass the gateway merely by acquiring its lock')
        command('CUSTOMER', [insert('Customer',dict(Code='DENY',FullName='x'))], user='test_unbound', expected=(52402,))
        ok('unbound database identity is rejected')
        command('CUSTOMER', [insert('Customer',dict(Code='DENY',FullName='x'))], user='test_housekeeping', expected=(52403,))
        ok('RBAC rejects housekeeping booking/customer mutation')
        run("EXECUTE AS USER='test_housekeeping'; EXEC sys.sp_set_session_context @key=N'ActorId',@value=1; EXEC pms.usp_ExecuteCommand 'CUSTOMER','spoof',N'[{\"entity\":\"Customer\",\"verb\":\"insert\",\"values\":{\"Code\":\"SPOOF\",\"FullName\":\"Test\"}}]';",expected=(52403,))
        ok('writable session context cannot impersonate another application user')
        command('CUSTOMER', [insert('Customer',dict(Code='DENY',FullName='x',CreatedBy=info['actor']))], expected=(52408,))
        ok('caller cannot forge attribution columns')
        rows=decode(run("EXECUTE AS USER='test_reception'; EXEC pms.usp_Query @Entity='Room'; REVERT;"))
        assert rows[0]['Version'].startswith('0x') and len(rows[0]['Version'])==18
        ok('public read returns usable rowversions under RBAC')
        run("EXECUTE AS USER='test_housekeeping'; EXEC pms.usp_Query @Entity='Payment';",expected=(52403,))
        ok('housekeeping cannot query payment data')
        users=decode(run("EXECUTE AS USER='test_manager'; EXEC pms.usp_Query @Entity='AppUser'; REVERT;"))
        assert all('PasswordHash' not in u and 'ExternalSubject' not in u for u in users)
        ok('user listing never exposes credential material')
        run("EXECUTE AS USER='test_manager'; EXEC pms.usp_Query @Entity='Room]; DROP TABLE pms.Room;--';",expected=(52403,))
        ok('read resource allowlist rejects SQL injection input')

        def booking(code, room_id=1, line=1, extra=False):
            changes = [insert('Booking',dict(Code=code,BookingKind='GROUP',CustomerId=1,GroupName='Test group',ContactName='Test',Status='CONFIRMED'),'booking')]
            for n in range(1, 4 if extra else 2):
                changes += [insert('BookingRoom',dict(BookingId='$booking',LineNumber=n,RoomTypeId=1,RatePlanId=1,PolicyVersionId=1,StayType='NIGHTLY',ArrivalDate=day,
                    DepartureDate=departure,StartsAtUtc=starts,EndsAtUtc=ends,Adults=2,Status='CONFIRMED',QuotedTotalVnd=1000,RateSnapshotJson={}),f'br{n}'),
                    insert('BookingNightRate',dict(BookingRoomId=f'$br{n}',NightDate=day,PriceVnd=1000))]
            changes += [insert('RoomAllocation',dict(RoomId=room_id,BookingRoomId='$br1',StartsAtUtc=starts,EndsAtUtc=ends),'allocation'),
                insert('Folio',dict(Code=code+'-ROOM',BookingId='$booking',BookingRoomId='$br1',Kind='ROOM',PayerCustomerId=1),'folio'),
                insert('Folio',dict(Code=code+'-MASTER',BookingId='$booking',Kind='MASTER',PayerCustomerId=1),'master'),
                insert('DepositAccount',dict(BookingId='$booking',Kind='BOOKING'),'deposit')]
            return changes

        command('BOOKING', booking('OVERSELL',extra=True), expected=(51006,))
        assert query("SELECT COUNT(*) n FROM pms.Booking")[0]['n'] == 0
        ok('oversold group is rejected and all rows rolled back')
        bad=booking('BAD-CAPACITY'); bad[1]['values']['Adults']=4
        command('BOOKING',bad,expected=(52102,))
        ok('guest count cannot exceed room type capacity')
        bad=booking('BAD-PRICE'); bad[1]['values']['QuotedTotalVnd']=999
        command('BOOKING',bad,expected=(52103,))
        ok('nightly total must equal every night snapshot')
        bad=booking('BAD-HOURLY'); bad[1]['values'].update(StayType='HOURLY',RatePlanId=2,RateSnapshotJson={'includedMinutes':120,'baseVnd':200,'extraMinutes':60,'extraVnd':100}); bad.pop(2)
        command('BOOKING',bad,expected=(52104,))
        ok('hourly quote must equal configured minute-block arithmetic')
        bad=booking('BAD-OVERRIDE'); bad[1]['values']['QuotedTotalVnd']=1; bad[2]['values'].update(PriceVnd=1,RateReason='Unapproved discount')
        command('BOOKING',bad,user='test_reception',expected=(52432,))
        ok('reception cannot override the published price without pricing authority')
        payload = booking('VALID')
        answer = command('BOOKING',payload,key='booking-once')
        ids = {x['Name']:x['Id'] for x in answer['Created']}
        assert command('BOOKING',payload,key='booking-once') == answer
        ok('valid group booking and exact idempotent replay')
        command('BOOKING',booking('CHANGED'),key='booking-once',expected=(52404,))
        ok('same idempotency key with different payload is rejected')
        command('BOOKING',booking('OVERLAP'),expected=(51005,))
        ok('room overlap rejected without caller invoking an assert procedure')
        command('BLOCK_ROOM',[insert('RoomAllocation',dict(RoomId=1,BlockReason='Repair',StartsAtUtc=starts,EndsAtUtc=ends))],expected=(51005,))
        ok('maintenance cannot overlap a committed assigned booking')
        command('CHECK_IN',[
            update('BookingRoom',dict(BookingRoomId=ids['br1']),dict(Status='IN_HOUSE')),
            insert('Stay',dict(Code='STAY',BookingRoomId=ids['br1'],Status='IN_HOUSE',CheckedInAtUtc=starts,ExpectedOutAtUtc=ends,PricingSnapshotJson={}),'stay'),
            insert('StayRoomSegment',dict(StayId='$stay',AllocationId=ids['allocation'],RoomId=1,ArrivedAtUtc=starts),'segment'),
            insert('StayGuest',dict(StayId='$stay',CustomerId=1,ArrivedAtUtc=starts,IsLead=True)),
            insert('FolioEntry',dict(FolioId=ids['folio'],StayId='$stay',Kind='CHARGE',Category='ROOM',AmountVnd=1000,Description='Room',OperationKey='room-charge'))
        ])
        stay = query("SELECT s.StayId,g.SegmentId FROM pms.Stay s JOIN pms.StayRoomSegment g ON g.StayId=s.StayId")[0]
        ids.update(stay)
        ok('check-in commits stay, guest, room and exact quoted charge together')
        def service(price=50,charge=True):
            items=[insert('ServiceOrder',dict(StayId=ids['StayId'],Status='DELIVERED'),'order'),
                insert('ServiceOrderLine',dict(ServiceOrderId='$order',ServiceId=1,Description='Water',Quantity=1,UnitPriceVnd=price,AmountVnd=price),'line')]
            if charge:
                items.append(insert('FolioEntry',dict(FolioId=ids['folio'],StayId=ids['StayId'],Kind='CHARGE',Category='SERVICE',AmountVnd=price,
                    Description='Water',ServiceOrderLineId='$line',OperationKey=uuid.uuid4().hex),'service-charge'))
            return items
        command('SERVICE',service(price=1),expected=(52420,))
        ok('service cannot override catalogue price without a separate adjustment')
        command('SERVICE',service(charge=False),expected=(52118,))
        ok('delivered service without financial charge cannot commit')
        service_ids={x['Name']:x['Id'] for x in command('SERVICE',service())['Created']}
        ok('service delivery and matching charge commit together')
        cancelled=update('ServiceOrder',dict(ServiceOrderId=service_ids['order']),dict(Status='CANCELLED',CancellationReason='Not consumed'))
        command('CANCEL_SERVICE',[cancelled],expected=(52119,))
        ok('cancelling a charged service requires a matching credit')
        credit=insert('FolioEntry',dict(FolioId=ids['folio'],StayId=ids['StayId'],Kind='CHARGE_CREDIT',Category='SERVICE',AmountVnd=50,
            Description='Not consumed',ReversesEntryId=service_ids['service-charge'],OperationKey='service-credit'))
        command('CANCEL_SERVICE',[cancelled,credit])
        ok('service cancellation preserves immutable charge and posts its reversal')

        command('CANCEL_BOOKING',[update('BookingRoom',dict(BookingRoomId=ids['br1']),dict(Status='CANCELLED'))],expected=(52413,))
        ok('in-house booking cannot be cancelled')
        stale=update('Room',dict(RoomId=2),dict(CleanStatus='INSPECTING'))
        command('CLEANING',[update('Room',dict(RoomId=2),dict(CleanStatus='CLEAN'))],expected=(52427,))
        ok('dirty room cannot be marked clean without inspection')
        command('CLEANING',[stale])
        command('CLEANING',[stale],expected=(52412,))
        ok('stale rowversion cannot overwrite a newer change')
        command('CLEANING',[update('Room',dict(RoomId=2),dict(CleanStatus='CLEAN'))])
        ok('inspection followed by clean status succeeds')
        # A transfer with a mismatched allocation must fail even if the room is clean.
        now=dt.datetime.now(dt.timezone.utc).replace(tzinfo=None).isoformat(timespec='milliseconds')
        fake_transfer=[update('StayRoomSegment',dict(SegmentId=ids['SegmentId']),dict(DepartedAtUtc=now)),
            insert('StayRoomSegment',dict(StayId=ids['StayId'],AllocationId=ids['allocation'],RoomId=2,ArrivedAtUtc=now))]
        command('TRANSFER_ROOM',fake_transfer,expected=(547,))
        ok('room transfer cannot attach a stay to another physical allocation')

        def receipt(amount=1500, allocation=None, code=None):
            return [insert('Payment',dict(Code=code or uuid.uuid4().hex,BookingId=ids['booking'],Direction='IN',Purpose='BOOKING_DEPOSIT',
                    AmountVnd=amount,Method='CASH',Status='SUCCEEDED',ShiftId=shift),'payment'),
                insert('DepositMovement',dict(DepositAccountId=ids['deposit'],Kind='RECEIVE',AmountVnd=allocation if allocation is not None else amount,
                    PaymentId='$payment',OperationKey=uuid.uuid4().hex),'movement')]

        shift=-1
        command('COLLECT',receipt(),expected=(52422,))
        ok('cash receipt without an owned open shift is rejected')
        a=command('SHIFT',[insert('CashierShift',dict(OpeningCashVnd=0),'shift')])
        shift=a['Created'][0]['Id']
        command('COLLECT',receipt(allocation=1600),expected=(52200,))
        ok('payment cannot be allocated beyond amount received')
        command('COLLECT',receipt(allocation=1400),expected=(52200,))
        ok('successful cash receipt cannot leave unexplained unallocated money')
        external=receipt()
        external[0]['values']['Method']='VIETQR'
        command('COLLECT',external,expected=(52421,))
        ok('unverified external payment cannot be marked successful')
        p=command('COLLECT',receipt())
        payment=next(x['Id'] for x in p['Created'] if x['Name']=='payment')
        ok('cash deposit receipt posts one real payment and one liability')
        pair=str(uuid.uuid4())
        transfer=[insert('FolioEntry',dict(FolioId=ids['folio'],Kind='TRANSFER_CREDIT',AmountVnd=1000,Description='Group transfer',TransferPairId=pair,OperationKey='transfer-out')),
            insert('FolioEntry',dict(FolioId=ids['master'],Kind='TRANSFER_DEBIT',AmountVnd=1000,Description='Group transfer',TransferPairId=pair,OperationKey='transfer-in'))]
        command('TRANSFER_FOLIO',transfer[:1],expected=(52217,))
        ok('one-sided folio transfer cannot commit')
        unequal=json.loads(json.dumps(transfer)); unequal[1]['values']['AmountVnd']=900
        command('TRANSFER_FOLIO',unequal,expected=(52217,))
        ok('unequal transfer sides cannot commit')
        command('TRANSFER_FOLIO',transfer)
        ok('balanced group transfer preserves debt without creating cash')

        def apply_deposit(amount,kind='APPLY',reverse=None):
            m=dict(DepositAccountId=ids['deposit'],Kind=kind,AmountVnd=amount,OperationKey=uuid.uuid4().hex)
            if reverse: m['ReversesMovementId']=reverse
            return [insert('DepositMovement',m,'application'),insert('FolioEntry',dict(FolioId=ids['master'],Kind='DEPOSIT_'+kind,
                AmountVnd=amount,Description='Apply deposit',DepositMovementId='$application',OperationKey=uuid.uuid4().hex))]

        command('APPLY_DEPOSIT',apply_deposit(100)[:1],expected=(52210,))
        ok('deposit application without matching folio credit is rejected')
        command('APPLY_DEPOSIT',apply_deposit(1600),expected=(52207,))
        ok('deposit cannot be spent below zero')
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            futures=[pool.submit(command,'APPLY_DEPOSIT',apply_deposit(1000)) for _ in range(2)]
            successes=[]; failures=[]
            for future in futures:
                try: successes.append(future.result())
                except RuntimeError as exc: failures.append(str(exc))
        assert len(successes)==1 and len(failures)==1 and '52207' in failures[0], (successes,failures)
        ok('two concurrent commands cannot spend the same deposit twice')
        applied=successes[0]['Created'][0]['Id']
        command('APPLY_DEPOSIT',apply_deposit(999,'UNAPPLY',applied),expected=(52211,))
        ok('deposit reversal must exactly match original application')
        command('APPLY_DEPOSIT',apply_deposit(1000,'UNAPPLY',applied))
        command('APPLY_DEPOSIT',apply_deposit(1000,'UNAPPLY',applied),expected=(2601,2627))
        ok('deposit application can be reversed once only')

        def request_refund(amount):
            return [insert('RefundRequest',dict(OriginalPaymentId=payment,AmountVnd=amount,Reason='Return unused deposit',
                Status='PENDING',DepositAccountId=ids['deposit']),'refund')]

        command('REQUEST_REFUND',request_refund(1600),expected=(52205,))
        ok('refund amount cannot exceed original payment')
        refund=command('REQUEST_REFUND',request_refund(1000))['Created'][0]['Id']
        command('REQUEST_REFUND',request_refund(600),expected=(52205,))
        ok('pending refunds reserve original payment capacity')
        command('APPLY_DEPOSIT',apply_deposit(600),expected=(52207,))
        ok('deposit reserved for refund cannot be spent')
        command('APPLY_DEPOSIT',apply_deposit(500))
        ok('only the unreserved deposit portion can be applied')
        approval=update('RefundRequest',dict(RefundRequestId=refund),dict(Status='APPROVED'))
        command('APPROVE_REFUND',[approval],user='test_reception',expected=(52403,))
        ok('reception cannot approve refunds')
        command('COMPLETE_REFUND',[update('RefundRequest',dict(RefundRequestId=refund),dict(Status='COMPLETED',RefundPaymentId=payment))],expected=(52413,52423))
        ok('pending refund cannot skip approval')
        command('APPROVE_REFUND',[approval])
        payout=[insert('Payment',dict(Code='REFUND',BookingId=ids['booking'],OriginalPaymentId=payment,RefundRequestId=refund,
            Direction='OUT',Purpose='REFUND',AmountVnd=1000,Method='CASH',Status='SUCCEEDED',ShiftId=shift),'refund-payment'),
            insert('DepositMovement',dict(DepositAccountId=ids['deposit'],Kind='REFUND',AmountVnd=1000,PaymentId='$refund-payment',OperationKey='refund-movement')),
            update('RefundRequest',dict(RefundRequestId=refund),dict(Status='COMPLETED',RefundPaymentId='$refund-payment'))]
        command('COMPLETE_REFUND',payout,key='refund-once')
        command('COMPLETE_REFUND',payout,key='refund-once')
        assert query("SELECT COUNT(*) n FROM pms.Payment WHERE Direction='OUT'")[0]['n']==1
        ok('approved refund completes atomically and replay never pays twice')
        assert query('SELECT BalanceVnd FROM pms.vDepositBalance')[0]['BalanceVnd']==0
        assert query(f"SELECT BalanceVnd FROM pms.vFolioBalance WHERE FolioId={ids['master']}")[0]['BalanceVnd']==500
        ok('deposit and master balances reconcile after application and refund')
        command('CLOSE_FOLIO',[update('Folio',dict(FolioId=ids['master']),dict(Status='CLOSED',ClosedAtUtc=dt.datetime.now(dt.timezone.utc).replace(tzinfo=None).isoformat()))],expected=(52218,))
        ok('folio with outstanding debt cannot be closed')

        def checkout():
            now=dt.datetime.now(dt.timezone.utc).replace(tzinfo=None).isoformat(timespec='milliseconds')
            return [update('StayRoomSegment',dict(SegmentId=ids['SegmentId']),dict(DepartedAtUtc=now)),
                update('StayGuest',dict(StayId=ids['StayId'],CustomerId=1),dict(DepartedAtUtc=now)),
                update('Stay',dict(StayId=ids['StayId']),dict(Status='CHECKED_OUT',CheckedOutAtUtc=now)),
                update('BookingRoom',dict(BookingRoomId=ids['br1']),dict(Status='COMPLETED')),
                insert('StaySettlement',dict(StayId=ids['StayId'],TotalAmountVnd=1000,RoomAmountVnd=1000,ServiceAmountVnd=0,SurchargeVnd=0,DiscountVnd=0,SnapshotJson={}))]

        command('CHECK_OUT',checkout(),expected=(52114,))
        assert query('SELECT Status FROM pms.Stay')[0]['Status']=='IN_HOUSE'
        ok('checkout without minibar inspection rolls back all changes')
        command('MINIBAR',[insert('MinibarAudit',dict(StayId=ids['StayId'],RoomId=1,Status='CONFIRMED'),'audit'),
            insert('MinibarAuditLine',dict(MinibarAuditId='$audit',ServiceId=1,ConsumedQuantity=1))],expected=(52116,))
        ok('consumed minibar cannot be confirmed without matching service posting')
        command('MINIBAR',[insert('MinibarAudit',dict(StayId=ids['StayId'],RoomId=1,Status='CONFIRMED',Notes='No consumption'))])
        wrong=checkout(); wrong[-1]['values']['RoomAmountVnd']=999; wrong[-1]['values']['TotalAmountVnd']=999
        command('CHECK_OUT',wrong,expected=(52221,))
        ok('checkout snapshot cannot invent different financial totals')
        command('CHECK_OUT',checkout())
        assert query('SELECT CleanStatus FROM pms.Room WHERE RoomId=1')[0]['CleanStatus']=='DIRTY'
        assert query('SELECT COUNT(*) n FROM pms.HousekeepingTask')[0]['n']==1
        assert query(f"SELECT BalanceVnd FROM pms.vFolioBalance WHERE FolioId={ids['master']}")[0]['BalanceVnd']==500
        ok('checkout releases room, creates cleaning task and preserves master debt')
        command('CHECK_OUT',[update('Stay',dict(StayId=ids['StayId']),dict(Status='IN_HOUSE',CheckedOutAtUtc=None))],expected=(52413,52414))
        ok('checked-out stay cannot reopen through a forged state update')
        command('RECEIPT',[insert('Invoice',dict(FolioId=ids['folio'],InternalNumber='INV',DocumentKind='E_INVOICE',Status='DRAFT',BuyerName='Test',NetVnd=1000,TaxVnd=0,TotalVnd=1000))],expected=(52424,))
        ok('electronic invoice cannot pretend provider integration is complete')
        inv=command('RECEIPT',[insert('Invoice',dict(FolioId=ids['folio'],InternalNumber='INV',DocumentKind='RECEIPT',Status='DRAFT',BuyerName='Test',NetVnd=1000,TaxVnd=0,TotalVnd=1000),'invoice')])['Created'][0]['Id']
        issue=update('Invoice',dict(InvoiceId=inv),dict(Status='ISSUED',IssuedAtUtc=dt.datetime.now(dt.timezone.utc).replace(tzinfo=None).isoformat()))
        command('RECEIPT',[issue],expected=(52300,))
        ok('invoice without reconciling lines cannot be issued')
        charge=query("SELECT FolioEntryId FROM pms.FolioEntry WHERE OperationKey='room-charge'")[0]['FolioEntryId']
        command('RECEIPT',[insert('InvoiceLine',dict(InvoiceId=inv,LineNumber=1,FolioEntryId=charge,Description='Room',Quantity=1,UnitPriceVnd=1000,NetVnd=1000,TaxRate=0,TaxVnd=0,TotalVnd=1000)),issue])
        ok('internal receipt issues only with matched posted charges')
        hourly_start=(dt.datetime.fromisoformat(starts[:26])+dt.timedelta(days=2)).replace(microsecond=0)
        hourly_end=hourly_start+dt.timedelta(hours=3)
        hourly_arrival=(hourly_start+dt.timedelta(hours=7)).date().isoformat()
        hourly_departure=(hourly_end+dt.timedelta(hours=7)).date().isoformat()
        hourly=command('BOOKING',[
            insert('Booking',dict(Code='HOURS',BookingKind='INDIVIDUAL',CustomerId=1,ContactName='Test',Status='CONFIRMED'),'hb'),
            insert('BookingRoom',dict(BookingId='$hb',LineNumber=1,RoomTypeId=1,RatePlanId=2,PolicyVersionId=1,StayType='HOURLY',ArrivalDate=hourly_arrival,
                DepartureDate=hourly_departure,StartsAtUtc=hourly_start.isoformat(),EndsAtUtc=hourly_end.isoformat(),Adults=1,
                Status='CONFIRMED',QuotedTotalVnd=300,RateSnapshotJson=dict(includedMinutes=120,baseVnd=200,extraMinutes=60,extraVnd=100)),'hr')])
        hr=next(x['Id'] for x in hourly['Created'] if x['Name']=='hr')
        ok('hourly booking accepts exact base plus additional block pricing')
        short_end=hourly_start+dt.timedelta(hours=1)
        command('CHANGE_STAY',[update('BookingRoom',dict(BookingRoomId=hr),dict(EndsAtUtc=short_end.isoformat(),
            DepartureDate=(short_end+dt.timedelta(hours=7)).date().isoformat(),QuotedTotalVnd=200))])
        ok('shortened hourly reservation must retain the base block charge')
        command('CHANGE_STAY',[update('BookingRoom',dict(BookingRoomId=hr),dict(QuotedTotalVnd=1))],expected=(52104,))
        ok('hourly price cannot be changed independently of its pricing snapshot')
        command('CANCEL_BOOKING',[update('BookingRoom',dict(BookingRoomId=hr),dict(Status='CANCELLED'))],expected=(547,))
        ok('cancellation requires a non-empty business reason')
        command('CANCEL_BOOKING',[update('BookingRoom',dict(BookingRoomId=hr),dict(Status='CANCELLED',CancellationReason='Customer changed plans'))])
        ok('cancellation persists the reason and releases room inventory')
        command('CHANGE_STAY',[update('BookingRoom',dict(BookingRoomId=ids['br1']),dict(QuotedTotalVnd=1))],expected=(52414,))
        ok('completed booking price is frozen')

        now=dt.datetime.now(dt.timezone.utc).replace(tzinfo=None).isoformat()
        command('SHIFT',[update('CashierShift',dict(ShiftId=shift),dict(ClosedAtUtc=now,CountedCashVnd=500,ExpectedCashVnd=999))],expected=(52304,))
        ok('shift closure rejects incorrect expected cash')
        day_changes=[update('BusinessDay',dict(BusinessDate=day),dict(Status='CLOSED',ClosedAtUtc=now,CollectedVnd=1500,RefundedVnd=1000,SettledRevenueVnd=1000,OutstandingVnd=500,SnapshotJson={})),
            insert('BusinessDay',dict(BusinessDate=departure)),update('HotelSettings',dict(HotelId=1),dict(WorkingDate=departure))]
        command('CLOSE_DAY',day_changes,expected=(52305,))
        ok('night audit cannot close a day with an open cashier shift')
        command('SHIFT',[update('CashierShift',dict(ShiftId=shift),dict(ClosedAtUtc=now,CountedCashVnd=500,ExpectedCashVnd=500))])
        command('CLOSE_DAY',day_changes,key='close-day-once')
        command('CLOSE_DAY',day_changes,key='close-day-once')
        assert query('SELECT WorkingDate FROM pms.HotelSettings')[0]['WorkingDate']==departure
        ok('night audit reconciles snapshots and replay cannot advance a second day')
        run('BEGIN TRAN; EXEC pms.usp_LockInventory; EXEC pms.usp_AssertBusinessState; ROLLBACK;')
        ok('final full-database invariants hold after complete business workflow')
        print(f'RESULT: {len(passed)}/{len(passed)} PASSED',flush=True)
    finally:
        if created:
            if not re.fullmatch(r'SongLamV2Test_[0-9a-f]{32}',db):
                raise RuntimeError('Unexpected cleanup target.')
            run(f'ALTER DATABASE [{db}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [{db}];','master')
            print('Removed disposable test database:',db,flush=True)


if __name__=='__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    try:
        main()
    except Exception as error:
        print('[FAIL]',error,file=sys.stderr)
        sys.exit(1)
