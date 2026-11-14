// Diagnostic under the dedicated Windows identity. RPCs only, no business writes.
import{createRequire}from'node:module';import{randomUUID}from'node:crypto';import{currentWindowsPrincipal}from'../../backend/src/adapters/sql/windows-provider.js';
if(currentWindowsPrincipal().toLowerCase()!=='desktop-9epi86k\\songlam_pms_test')throw new Error('DEDICATED_SERVICE_REQUIRED');
const require=createRequire(new URL('../../backend/package.json',import.meta.url)),sql=require('mssql/msnodesqlv8');
const p=new sql.ConnectionPool({server:'.\\SQLEXPRESS',database:'SongLamPms_Design',driver:'ODBC Driver 17 for SQL Server',pool:{max:1,min:0},options:{trustedConnection:true,encrypt:true,trustServerCertificate:true},beforeConnect:c=>{c.conn_str+=';TrustServerCertificate=Yes;';}});p.on('error',()=>{});
try{await p.connect();const result=await p.request().input('AppUserId',sql.BigInt,'4').input('Operation',sql.VarChar(32),'timeline').input('InputJson',sql.NVarChar(sql.MAX),JSON.stringify({roomId:'362',from:'2026-12-13',to:'2026-12-15',offset:0,limit:200})).input('RequestId',sql.NVarChar(80),randomUUID()).execute('pms.usp_AppBookingRead');
const payload=JSON.parse(result.recordsets[0][0].PayloadJson);console.log(JSON.stringify({status:'REAL_SERVICE_READ',timeline:payload}));
}catch(e){console.error(JSON.stringify({status:'SERVICE_READ_FAILED',number:e.number??null,code:e.code??null}));process.exitCode=1;}finally{await p.close().catch(()=>{});}
