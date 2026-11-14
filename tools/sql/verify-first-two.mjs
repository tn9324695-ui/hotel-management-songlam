// Offline verification of SQL readback + captured execution output. Does not
// execute SQL, restore backups, create principals or enable application runtime.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const names=['usp_AppEnvironment','usp_AppAuthLookup','usp_AppIdentity'];
const digest=value=>createHash('sha256').update(value.replaceAll('\r',''),'utf16le').digest('hex').toUpperCase();
const fail=code=>{throw Object.assign(new Error(code),{code});};
export function verifyFirstTwo({metadata,source,output}={}){
  if(metadata?.serverIdentity!=='DESKTOP-9EPI86K\\SQLEXPRESS'||metadata.databaseName!=='SongLamPms_Design'
    || metadata.databaseGuid?.toUpperCase()!=='C4DD399E-5661-4741-A424-5ABFEEFBC1AC'||metadata.accessMode!=='MULTI_USER'||metadata.databaseState!=='ONLINE')fail('FIRST_TWO_TARGET_MISMATCH');
  const markers=metadata.markers;
  if(!Array.isArray(markers)||markers.length!==2||!markers.some(x=>x.name==='SongLam.Environment'&&x.value==='test')
    ||!markers.some(x=>x.name==='SongLam.TestIdentity'&&x.value==='eb18c6f2-373d-4a83-a34f-d9809f1cbc7a'))fail('FIRST_TWO_MARKER_MISMATCH');
  const backup=metadata.backup;
  if(!backup||backup.backupSetUuid?.toUpperCase()!=='50C40A72-2373-40B5-805D-6D249ACA9CA0'||backup.databaseName!==metadata.databaseName
    ||backup.databaseGuid?.toUpperCase()!==metadata.databaseGuid.toUpperCase()||backup.copyOnly!==true||backup.checksums!==true||backup.position!==1
    ||backup.backupPath!=='C:\\Program Files\\Microsoft SQL Server\\MSSQL16.SQLEXPRESS\\MSSQL\\Backup\\SongLamPms_Design_D1R_20261112_b5f52bd3-8131-4193-954d-69cc81fca420.bak'
    ||typeof output!=='string'||!output.includes('The backup set on file 1 is valid.')||!output.includes('MARKER_COMMITTED_NEW_BACKUP_VERIFIED')||!output.includes(backup.backupSetUuid))fail('FIRST_TWO_BACKUP_EVIDENCE_INVALID');
  const expected=new Map();
  for(const match of source.matchAll(/EXEC sys\.sp_executesql N'((?:[^']|'')*)';/g)){
    const body=match[1].replaceAll("''","'"),name=/^CREATE OR ALTER PROCEDURE pms\.(\w+)/.exec(body)?.[1];
    // SQL Server stores newly-created CREATE OR ALTER modules as CREATE with
    // the OR/ALTER tokens removed, retaining their spaces. Compare only these
    // two exact headers; do not normalize/ignore any procedure body content.
    if(name)expected.set(name,new Set([digest(body),digest(body.replace(/^CREATE OR ALTER PROCEDURE/,'CREATE   PROCEDURE'))]));
  }
  if(expected.size!==3||!Array.isArray(metadata.procedures)||metadata.procedures.length!==3
    ||new Set(metadata.procedures.map(x=>x.name)).size!==3)fail('FIRST_TWO_MODULES_INVALID');
  for(const name of names){const actual=metadata.procedures.find(x=>x.name===name);
    if(!actual||!expected.get(name)?.has(actual.normalizedSha256)||actual.parameterCount!==(name==='usp_AppEnvironment'?0:1))fail('FIRST_TWO_MODULE_DEFINITION_MISMATCH');}
  if(!Array.isArray(metadata.grants)||metadata.grants.length!==3||new Set(metadata.grants.map(x=>x.objectName)).size!==3
    ||metadata.grants.some(x=>x.scope!=='OBJECT_OR_COLUMN'||x.state!=='GRANT'||x.permission!=='EXECUTE'||x.schemaName!=='pms'||!names.includes(x.objectName)))fail('FIRST_TWO_GRANTS_MISMATCH');
  if(metadata.appUserCount!==0||metadata.userRoleCount!==0||metadata.principalBindingCount!==0||metadata.sessionTableCount!==0||metadata.authRoleMembers!==0)fail('FIRST_TWO_SCOPE_REVIEW_REQUIRED');
  return {status:'FIRST_TWO_SQL_VERIFIED',database:metadata.databaseName,backupSetUuid:backup.backupSetUuid,
    databaseMode:metadata.accessMode,markers:markers.map(x=>({...x})),procedures:names,executeGrantCount:3,
    loginTested:false,servicePoolTested:false,employeeAccountsCreated:0,sessionStoreCreated:false,restoreRehearsalTested:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=new URL('../../',import.meta.url),evidence=new URL('tools/sql/private/first-two-20261112/',root);
  try{
    const metadata=JSON.parse((await fs.readFile(new URL('sql-readback.json',evidence),'utf8')).replace(/^\uFEFF/,''));
    const source=await fs.readFile(new URL('database/proposals/auth-v1/001-auth-read.sql.pending',root),'utf8');
    const output=await fs.readFile(new URL('004r-output.txt',evidence),'utf8');
    const result=verifyFirstTwo({metadata,source,output});
    const receiptFile=new URL('receipt.json',evidence);let receiptReused=false;
    try{
      const existing=JSON.parse(await fs.readFile(receiptFile,'utf8'));
      if(!Number.isFinite(Date.parse(existing.verifiedAtUtc))||Object.entries(result).some(([key,value])=>JSON.stringify(existing[key])!==JSON.stringify(value)))fail('FIRST_TWO_STORED_RECEIPT_MISMATCH');
      receiptReused=true;
    }catch(error){
      if(error.code!=='ENOENT')throw error;
      await fs.writeFile(receiptFile,JSON.stringify({...result,verifiedAtUtc:new Date().toISOString(),
        approvalReferences:{d1:'USER-20261112-D1R-AND-AUTH-READ',auth:'USER-20261112-FIRST-TWO-001-003'}},null,2)+'\n',{flag:'wx'});
    }
    console.log(JSON.stringify({...result,receiptReused}));
  }catch(error){console.error(JSON.stringify({status:'NOT_CONFIRMED',code:/^FIRST_TWO_[A-Z_]+$/.test(error?.code||'')?error.code:'FIRST_TWO_EVIDENCE_READ_FAILED'}));process.exitCode=1;}
}
