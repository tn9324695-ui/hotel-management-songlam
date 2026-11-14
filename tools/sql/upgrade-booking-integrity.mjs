// Authorized fixes to 012 only. New backup first, hash guards, one transaction.
import{readFile,writeFile,mkdir}from'node:fs/promises';import{createRequire}from'node:module';import{createHash}from'node:crypto';import{currentWindowsPrincipal}from'../../backend/src/adapters/sql/windows-provider.js';
const approval='USER-20261112-REAL-PRICING-CUSTOMER-BOOKING',prepare=process.argv.slice(2).join(' ')===`--prepare --approval=${approval}`;if(!prepare&&process.argv.slice(2).join(' ')!==`--apply --approval=${approval}`)throw new Error('APPROVAL_REQUIRED');
if(currentWindowsPrincipal().toLowerCase()!=='desktop-9epi86k\\thang dz')throw new Error('MAINTENANCE_OPERATOR_REQUIRED');
const require=createRequire(new URL('../../backend/package.json',import.meta.url)),sql=require('mssql/msnodesqlv8'),directory=new URL('./private/booking012/',import.meta.url),artifacts=new URL('../../database/migrations/013-booking/',import.meta.url);
const initial=JSON.parse(await readFile(new URL('deployment.json',directory),'utf8')),hash=s=>createHash('sha256').update(s).digest('hex');
const p=new sql.ConnectionPool({server:'.\\SQLEXPRESS',database:'SongLamPms_Design',driver:'ODBC Driver 17 for SQL Server',pool:{max:1,min:0},requestTimeout:30000,options:{trustedConnection:true,encrypt:true,trustServerCertificate:true},beforeConnect:c=>{c.conn_str+=';TrustServerCertificate=Yes;';}});p.on('error',()=>{});let tx,committed=false;
function replace(text,from,to){if(text.split(from).length!==2)throw new Error('PATCH_ANCHOR_CHANGED');return text.replace(from,to);}
try{await p.connect();const target=(await p.request().query(`SELECT DB_NAME() db,CONVERT(nvarchar(128),SERVERPROPERTY('ServerName')) serverName,CONVERT(varchar(36),database_guid) guid,CONVERT(nvarchar(4000),SERVERPROPERTY('InstanceDefaultBackupPath')) backupPath FROM sys.database_recovery_status WHERE database_id=DB_ID();`)).recordset[0];
if(target.db!=='SongLamPms_Design'||target.serverName!=='DESKTOP-9EPI86K\\SQLEXPRESS'||target.guid?.toUpperCase()!=='C4DD399E-5661-4741-A424-5ABFEEFBC1AC')throw new Error('TARGET_MISMATCH');
const prior=(await p.request().query(`SELECT CONVERT(nvarchar(max),value) ReceiptJson FROM sys.extended_properties WHERE class=0 AND name=N'SongLam.Booking013.Receipt'`)).recordset[0];
if(prior){console.log(JSON.stringify({status:'BOOKING013_ALREADY_COMMITTED_NO_MUTATIONS'}));}
else{
 const targets=['fn_WebPricingContext','usp_AppBookingRead','usp_AppBookingCommit'];const changes=[];
 for(const name of targets){const row=(await p.request().input('name',sql.NVarChar(128),'pms.'+name).query(`SELECT OBJECT_DEFINITION(OBJECT_ID(@name)) definition,CONVERT(varchar(64),HASHBYTES('SHA2_256',OBJECT_DEFINITION(OBJECT_ID(@name))),2) definitionHash`)).recordset[0];
  if(row.definitionHash!==initial.definitions.find(d=>d.Name===name)?.DefinitionSha256)throw new Error('MODULE_HASH_GUARD_FAILED');let text=row.definition;
  if(name==='fn_WebPricingContext')text=replace(text,'RETURN @result;',"RETURN REPLACE(@result,N'\\/',N'/');");
  if(name==='usp_AppBookingRead'){
   text=replace(text,'JSON_QUERY(@rows) segments',"JSON_QUERY(COALESCE(@rows,N'[]')) segments");
   text=replace(text,'SELECT @total=COUNT(*) FROM @segments;',`INSERT @segments SELECT 'TICKET-'+CONVERT(varchar(20),t.RoomId),'BLOCK',CONVERT(varchar(20),t.RoomId),CONVERT(varchar(20),r.RoomTypeId),CONVERT(varchar(23),@start,126)+'Z',CONVERT(varchar(23),@end,126)+'Z',NULL,NULL,'BLOCKED'
    FROM pms.MaintenanceTicket t JOIN pms.Room r ON r.RoomId=t.RoomId WHERE t.Status IN('OPEN','IN_PROGRESS') AND r.IsActive=1 AND (@type IS NULL OR r.RoomTypeId=@type) AND (@room IS NULL OR r.RoomId=@room) GROUP BY t.RoomId,r.RoomTypeId;
   SELECT @total=COUNT(*) FROM @segments;`);
  }
  if(name==='usp_AppBookingCommit'){
   text=replace(text,"SET @context=pms.fn_WebPricingContext(@type,@plan,@from,@contextTo);",`DECLARE @priceLockCount int; SELECT @priceLockCount=COUNT(*) FROM pms.RateRule WITH(HOLDLOCK) WHERE RatePlanId=@plan AND RoomTypeId=@type;
   SET @context=pms.fn_WebPricingContext(@type,@plan,@from,@contextTo);`);
   text=replace(text,"IF @snapshot IS NULL OR @proof IS NULL OR @context IS NULL",`IF @snapshot IS NULL OR @proof IS NULL OR @context IS NULL OR @snapshotHash IS NULL OR @acceptance IS NULL
    OR (SELECT COUNT(*) FROM OPENJSON(@snapshot) WHERE [key] IN('schema','engineVersion','sourceQuoteId','quotedAt','input','pricingContext','roomBaseVnd','boundarySurchargesVnd','accommodationTotalVnd','policyVersionId','policyVersion','policyHash','moneyRounding','breakdown') AND type<>0)<>14
    OR EXISTS(SELECT 1 FROM OPENJSON(@snapshot) GROUP BY [key] HAVING COUNT(*)>1)
    OR EXISTS(SELECT 1 FROM OPENJSON(@snapshot) WHERE [key] IN('schema','engineVersion','sourceQuoteId','quotedAt','roomBaseVnd','boundarySurchargesVnd','accommodationTotalVnd','policyVersionId','policyHash','moneyRounding') AND type<>1)
    OR (SELECT COUNT(*) FROM OPENJSON(@snapshot,'$.input'))<>7
    OR EXISTS(SELECT 1 FROM OPENJSON(@snapshot,'$.input') WHERE ([key] IN('roomTypeId','ratePlanId','checkInAt','checkOutAt') AND type<>1) OR ([key] IN('rooms','adultsPerRoom','childrenPerRoom') AND type<>2))
    OR ISNULL(TRY_CONVERT(int,JSON_VALUE(@snapshot,'$.policyVersion')),0)<>1
    OR TRY_CONVERT(uniqueidentifier,JSON_VALUE(@snapshot,'$.sourceQuoteId')) IS NULL OR TRY_CONVERT(datetimeoffset,JSON_VALUE(@snapshot,'$.quotedAt')) IS NULL`);
   text=replace(text,"IF @valid<>1 OR TRY_CONVERT(decimal(19,0),JSON_VALUE(@snapshot,'$.roomBaseVnd'))<>@base", "IF ISNULL(@valid,0)<>1 OR ISNULL(TRY_CONVERT(decimal(19,0),JSON_VALUE(@snapshot,'$.roomBaseVnd')),-1)<>@base");
   text=replace(text,"OR TRY_CONVERT(decimal(19,0),JSON_VALUE(@snapshot,'$.boundarySurchargesVnd'))<>@early+@late", "OR ISNULL(TRY_CONVERT(decimal(19,0),JSON_VALUE(@snapshot,'$.boundarySurchargesVnd')),-1)<>@early+@late");
   text=replace(text,"OR TRY_CONVERT(decimal(19,0),JSON_VALUE(@snapshot,'$.accommodationTotalVnd'))<>@total", "OR ISNULL(TRY_CONVERT(decimal(19,0),JSON_VALUE(@snapshot,'$.accommodationTotalVnd')),-1)<>@total");
   text=replace(text,"IF (@stayType='NIGHTLY' AND @nightCount<>DATEDIFF(day,@from,@to))", "IF (@stayType='NIGHTLY' AND (@nightCount<>DATEDIFF(day,@from,@to) OR (SELECT COUNT(DISTINCT JSON_VALUE(value,'$.date')) FROM OPENJSON(@snapshot,'$.breakdown') WHERE JSON_VALUE(value,'$.kind')='NIGHT')<>@nightCount))");
  }
  text=text.replace(/^(\s*(?:--[^\n]*\n\s*)*)CREATE\s+(FUNCTION|PROCEDURE)/i,'$1ALTER $2');
  if(!/ALTER\s+(FUNCTION|PROCEDURE)\s+pms\./i.test(text))throw new Error('MODULE_HEADER_NOT_ALTER');changes.push({name,beforeHash:row.definitionHash,text});
 }
 await mkdir(artifacts,{recursive:true});for(const change of changes){const file=new URL(change.name+'.sql',artifacts);try{await writeFile(file,change.text,{flag:'wx'});}catch(error){if(error.code!=='EEXIST'||await readFile(file,'utf8')!==change.text)throw error;}}
 if(prepare){console.log(JSON.stringify({status:'READ_ONLY_PATCH_PREPARED_NO_SQL_CHANGES',objects:changes.map(c=>({name:c.name,beforeHash:c.beforeHash,patchSha256:hash(c.text)})),authority:'Latest user explicitly requests creating/applying necessary SQL and fixing errors on SongLamPms_Design; old per-file restrictions superseded within this scope.'}));}
 else{
 const backupPath=target.backupPath.replace(/[\\/]$/,'')+'\\SongLamPms_Design_Booking013_'+Date.now()+'.bak';
 await p.request().input('path',sql.NVarChar(4000),backupPath).query('BACKUP DATABASE [SongLamPms_Design] TO DISK=@path WITH COPY_ONLY,CHECKSUM; RESTORE VERIFYONLY FROM DISK=@path WITH CHECKSUM;');
 const uuid=(await p.request().input('path',sql.NVarChar(4000),backupPath).query(`SELECT TOP(1) CONVERT(varchar(36),b.backup_set_uuid) id FROM msdb.dbo.backupset b JOIN msdb.dbo.backupmediafamily m ON m.media_set_id=b.media_set_id WHERE b.database_name=DB_NAME() AND m.physical_device_name=@path ORDER BY b.backup_set_id DESC`)).recordset[0].id;
 await writeFile(new URL('backup013-'+Date.now()+'.json',directory),JSON.stringify({backupPath,backupSetUuid:uuid,verifyOnlyPassed:true,restoreTested:false},null,2),{flag:'wx'});
 tx=new sql.Transaction(p);await tx.begin();await new sql.Request(tx).batch('SET ANSI_NULLS ON; SET QUOTED_IDENTIFIER ON; SET XACT_ABORT ON;');
 for(const change of changes)await new sql.Request(tx).batch(change.text);
 const receipt={id:'BOOKING013',approvalReference:approval,basePackageSha256:initial.packageSha256,backupSetUuid:uuid,patchSha256:hash(JSON.stringify(changes)),atUtc:new Date().toISOString(),objects:changes.map(({name,beforeHash})=>({name,beforeHash}))};
 await new sql.Request(tx).input('receipt',sql.NVarChar(3500),JSON.stringify(receipt)).query("EXEC sys.sp_addextendedproperty @name=N'SongLam.Booking013.Receipt',@value=@receipt");
 await tx.commit();committed=true;console.log(JSON.stringify({status:'BOOKING013_COMMITTED',backupSetUuid:uuid,objects:targets}));
 }
}
if(!prepare){
const definitions=(await p.request().query(`SELECT o.name Name,CONVERT(varchar(64),HASHBYTES('SHA2_256',m.definition),2) DefinitionSha256,m.uses_ansi_nulls AnsiNullsOn,m.uses_quoted_identifier QuotedIdentifierOn FROM sys.objects o JOIN sys.sql_modules m ON m.object_id=o.object_id WHERE o.schema_id=SCHEMA_ID('pms') ORDER BY o.name;`)).recordset.filter(d=>initial.definitions.some(x=>x.Name===d.Name));
await writeFile(new URL('current-deployment.json',directory),JSON.stringify({...initial,definitions,patches:['BOOKING013']},null,2));
}
}catch(e){if(tx&&!committed)await tx.rollback().catch(()=>{});console.error(JSON.stringify({status:committed?'PATCH_COMMITTED_POSTCHECK_FAILED':'PATCH_FAILED',code:/^[A-Z_]+$/.test(e.message)?e.message:'SQL_PATCH_ERROR',number:e.number??null,line:e.lineNumber??e.originalError?.info?.lineNumber??null}));process.exitCode=1;}finally{await p.close().catch(()=>{});}
