-- Replacements are generated from the reviewed own-system pricing decision.
-- Runs inside the same deployment transaction after fresh COPY_ONLY + VERIFYONLY.
DECLARE @policy nvarchar(max)=N'__POLICY_JSON__',@prices nvarchar(max)=N'__RATES_JSON__',@author bigint,
 @policyId int,@night int,@hour int,@request uniqueidentifier=NEWID(),@lock int,@release nvarchar(3500);
IF EXISTS(SELECT 1 FROM pms.PolicyVersion WHERE Code='SL-OPERATIONS-2026-11') OR EXISTS(SELECT 1 FROM pms.RatePlan WHERE Code IN('SL-NIGHT-2026-V1','SL-HOUR6-2026-V1')) THROW 54201,'Existing own-system tariff requires a versioned upgrade; no overwrite.',1;
SELECT @author=u.UserId FROM pms.AppUser u WHERE u.Username=N'SONGLAM_TEST_B20261112_UI01_MANAGER' AND u.IsActive=1 AND pms.fn_WebPermission(u.UserId,'editRoomClasses')=1;
IF @author IS NULL THROW 54202,'Explicit existing pricing author required.',1;
EXEC @lock=sys.sp_getapplock @Resource=N'SongLam:Inventory',@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=10000;
IF @lock<0 THROW 51002,'Inventory lock unavailable.',1;
INSERT pms.ApiRequest(RequestId,ActorId,Operation,IdempotencyKey,RequestHash,Status) VALUES(@request,@author,'WEB_PRICE_SETUP','SONGLAM_BOOKING012_V1',HASHBYTES('SHA2_256',@policy+@prices),'PROCESSING');
INSERT pms.CommandExecution(SessionId,RequestId) VALUES(@@SPID,@request);
INSERT pms.PolicyVersion(Code,Version,EffectiveFromUtc,RulesJson,CreatedBy) VALUES('SL-OPERATIONS-2026-11',1,'2026-10-31T17:00:00',@policy,@author);
SET @policyId=SCOPE_IDENTITY();
INSERT pms.RatePlan(Code,Name,StayType,PolicyVersionId) VALUES('SL-NIGHT-2026-V1',N'SongLam · Giá đêm 2026–2027 · v1','NIGHTLY',@policyId);
SET @night=SCOPE_IDENTITY();
INSERT pms.RatePlan(Code,Name,StayType,PolicyVersionId) VALUES('SL-HOUR6-2026-V1',N'SongLam · Gói tối đa 6 giờ · v1','HOURLY',@policyId);
SET @hour=SCOPE_IDENTITY();
IF (SELECT COUNT(*) FROM OPENJSON(@prices))<>10 OR EXISTS(SELECT 1 FROM OPENJSON(@prices) WITH(roomTypeCode varchar(30)) p LEFT JOIN pms.RoomType t ON t.Code=p.roomTypeCode AND t.IsActive=1 WHERE t.RoomTypeId IS NULL)
 THROW 54203,'Reviewed ten active types required.',1;
INSERT pms.RateRule(RatePlanId,RoomTypeId,ValidFrom,ValidTo,DayKind,Priority,PriceVnd,IncludedMinutes,ExtraBlockMinutes,ExtraBlockPriceVnd)
 SELECT @night,t.RoomTypeId,p.validFrom,p.validToExclusive,'BASE',0,p.nightlyVnd,NULL,NULL,NULL
 FROM OPENJSON(@prices) WITH(roomTypeCode varchar(30),validFrom date,validToExclusive date,nightlyVnd decimal(19,0)) p JOIN pms.RoomType t ON t.Code=p.roomTypeCode;
INSERT pms.RateRule(RatePlanId,RoomTypeId,ValidFrom,ValidTo,DayKind,Priority,PriceVnd,IncludedMinutes,ExtraBlockMinutes,ExtraBlockPriceVnd)
 SELECT @hour,t.RoomTypeId,p.validFrom,p.validToExclusive,'BASE',0,p.hourlySixHourVnd,360,60,0
 FROM OPENJSON(@prices) WITH(roomTypeCode varchar(30),validFrom date,validToExclusive date,hourlySixHourVnd decimal(19,0)) p JOIN pms.RoomType t ON t.Code=p.roomTypeCode;
SET @release=(SELECT 'SONGLAM_BOOKING012_V1' releaseId,'USER-20261112-REAL-PRICING-CUSTOMER-BOOKING' approvalReference,
 'f916e0c6-20d4-477c-966f-dcd278dfb083' deploymentId,'OWN_SYSTEM_NOT_MUONG_THANH_OFFICIAL_TARIFF' tariffOwnership,
 '2026-11-01' validFrom,'2028-01-01' validToExclusive,CONVERT(varchar(20),@policyId) policyVersionId,
 LOWER(CONVERT(varchar(64),HASHBYTES('SHA2_256',CONVERT(varchar(max),@policy COLLATE Latin1_General_100_BIN2_UTF8)),2)) policyHash,
 'SL-FRONTDESK-CONFIRM-V1' bookingPolicyId,'__BOOKING_POLICY_HASH__' bookingPolicyHash,
 '__PACKAGE_HASH__' packageSha256,'__BACKUP_UUID__' backupSetUuid,CONVERT(varchar(23),SYSUTCDATETIME(),126)+'Z' deployedAtUtc,
 CONVERT(varchar(20),@author) priceAuthorAppUserId,CONVERT(varchar(36),@request) setupRequestId,
 '2e1e523b3c0463e07a744a78b68fe9ec1c7d3dc05bacb7bb974b95f19daade5d' roomSourceWorkbookSha256,
 'PROJECT_ROOM_REGISTER_NOT_VERIFIED_MUONG_THANH_ROOM_REGISTER' roomProvenance,CAST(0 AS bit) operationalCutover
 FOR JSON PATH,WITHOUT_ARRAY_WRAPPER);
EXEC sys.sp_addextendedproperty @name=N'SongLam.Booking012.Release',@value=@release;
INSERT pms.AuditLog(ActorId,Action,EntityType,EntityKey,RequestId,AfterJson,Reason) VALUES(@author,'WEB_PRICE_SETUP','PolicyVersion',CONVERT(varchar(20),@policyId),@request,@release,'USER-20261112-REAL-PRICING-CUSTOMER-BOOKING');
UPDATE pms.ApiRequest SET Status='SUCCEEDED',ResponseJson=@release WHERE RequestId=@request;
DELETE pms.CommandExecution WHERE SessionId=@@SPID AND RequestId=@request;
GRANT EXECUTE ON OBJECT::pms.usp_AppPricingContext TO pms_web_auth_test;
GRANT EXECUTE ON OBJECT::pms.usp_AppReferenceRead TO pms_web_auth_test;
GRANT EXECUTE ON OBJECT::pms.usp_AppBookingRead TO pms_web_auth_test;
GRANT EXECUTE ON OBJECT::pms.usp_AppBookingPrepare TO pms_web_auth_test;
GRANT EXECUTE ON OBJECT::pms.usp_AppBookingCommit TO pms_web_auth_test;
GRANT EXECUTE ON OBJECT::pms.usp_AppCustomerCreate TO pms_web_auth_test;
GRANT EXECUTE ON OBJECT::pms.usp_WebReceiptLookup TO pms_web_auth_test;
GRANT EXECUTE ON OBJECT::pms.usp_WebBookingRuntime TO pms_web_auth_test;
DENY EXECUTE ON OBJECT::pms.usp_WebAuthorize TO pms_web_auth_test;
DENY EXECUTE ON OBJECT::pms.usp_ApplyCommand TO pms_web_auth_test;
DENY EXECUTE ON OBJECT::pms.usp_ExecuteCommand TO pms_web_auth_test;
