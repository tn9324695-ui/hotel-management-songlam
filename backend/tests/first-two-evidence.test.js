// Synthetic readback evidence only; this does not deploy or query SQL.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {verifyFirstTwo} from '../../tools/sql/verify-first-two.mjs';
const names=['usp_AppEnvironment','usp_AppAuthLookup','usp_AppIdentity'];
function fixture(createHeader=false){
  const bodies=names.map(name=>`CREATE OR ALTER PROCEDURE pms.${name} AS BEGIN SELECT 1; END`);
  const source=bodies.map(body=>"EXEC sys.sp_executesql N'"+body+"';").join('\n');
  const metadata={serverIdentity:'DESKTOP-9EPI86K\\SQLEXPRESS',databaseName:'SongLamPms_Design',databaseGuid:'C4DD399E-5661-4741-A424-5ABFEEFBC1AC',accessMode:'MULTI_USER',databaseState:'ONLINE',
    markers:[{name:'SongLam.Environment',value:'test'},{name:'SongLam.TestIdentity',value:'eb18c6f2-373d-4a83-a34f-d9809f1cbc7a'}],
    backup:{backupSetUuid:'50C40A72-2373-40B5-805D-6D249ACA9CA0',databaseName:'SongLamPms_Design',databaseGuid:'C4DD399E-5661-4741-A424-5ABFEEFBC1AC',copyOnly:true,checksums:true,position:1,
      backupPath:'C:\\Program Files\\Microsoft SQL Server\\MSSQL16.SQLEXPRESS\\MSSQL\\Backup\\SongLamPms_Design_D1R_20261112_b5f52bd3-8131-4193-954d-69cc81fca420.bak'},
    procedures:bodies.map((body,i)=>({name:names[i],normalizedSha256:createHash('sha256').update(createHeader?body.replace('CREATE OR ALTER PROCEDURE','CREATE   PROCEDURE'):body,'utf16le').digest('hex').toUpperCase(),parameterCount:i===0?0:1})),
    grants:names.map(name=>({scope:'OBJECT_OR_COLUMN',state:'GRANT',permission:'EXECUTE',schemaName:'pms',objectName:name})),
    appUserCount:0,userRoleCount:0,principalBindingCount:0,sessionTableCount:0,authRoleMembers:0};
  return {metadata,source,output:'The backup set on file 1 is valid. MARKER_COMMITTED_NEW_BACKUP_VERIFIED 50C40A72-2373-40B5-805D-6D249ACA9CA0'};
}
test('evidence comparison accepts exact CREATE OR ALTER or observed CREATE header without claiming login',()=>{
  for(const mode of [false,true]){const result=verifyFirstTwo(fixture(mode));assert.equal(result.status,'FIRST_TWO_SQL_VERIFIED');assert.equal(result.loginTested,false);assert.equal(result.servicePoolTested,false);}
});
test('changed body, broad permission, missing marker or wrong access mode cannot pass evidence verification',()=>{
  for(const mutate of [f=>{f.metadata.procedures[0].normalizedSha256='A'.repeat(64);},f=>{f.metadata.grants[0].scope='SCHEMA';},f=>{f.metadata.grants[0].permission='SELECT';},f=>{f.metadata.markers.pop();},f=>{f.metadata.accessMode='SINGLE_USER';}]){
    const f=fixture();mutate(f);assert.throws(()=>verifyFirstTwo(f));
  }
});
