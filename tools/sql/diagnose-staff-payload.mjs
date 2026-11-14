// Maintenance-only, read-only diagnostics. Never outputs hash/password values.
import {readFileSync} from 'node:fs';
import {loadWindowsSqlProvider} from '../../backend/src/adapters/sql/windows-provider.js';
const bundle=JSON.parse(readFileSync(new URL('./private/test-staff-B20261112_UI01/credentials.local.json',import.meta.url),'utf8').replace(/^\uFEFF/,''));
const provider=loadWindowsSqlProvider({expectedPrincipal:'DESKTOP-9EPI86K\\Thang DZ',principalApprovalReference:'USER-20261112-MODULES-5-6-MAINTENANCE-ONLY',odbcDriver:'ODBC Driver 17 for SQL Server'});
const pool=provider.createPool({server:'.\\SQLEXPRESS',database:'SongLamPms_Design',auth:{mode:'windows'},transport:{encrypt:true,trustServerCertificate:true,port:null},pool:{min:0,max:1,idleTimeoutMs:1000},connectionTimeoutMs:5000,requestTimeoutMs:5000});
try{
 await pool.connect();const t=provider.types;
 const result=await pool.request().input('AccountsJson',t.NVarChar(t.MAX),JSON.stringify(bundle.accounts.map(({password,...a})=>a)))
 .input('BatchCode',t.VarChar(40),bundle.batchCode).query(`
 SELECT RoleCode,LEN(PasswordHash) AS HashLength,
 CASE WHEN LEFT(PasswordHash,25) COLLATE Latin1_General_100_BIN2=N'$pbkdf2-sha256-v1$600000$' THEN 1 ELSE 0 END AS PrefixValid,
 CASE WHEN SUBSTRING(PasswordHash,48,1)=N'$' THEN 1 ELSE 0 END AS SeparatorValid,
 CASE WHEN SUBSTRING(PasswordHash,26,22) COLLATE Latin1_General_100_BIN2 NOT LIKE N'%[^A-Za-z0-9_-]%' THEN 1 ELSE 0 END AS SaltCharsValid,
 CASE WHEN SUBSTRING(PasswordHash,49,43) COLLATE Latin1_General_100_BIN2 NOT LIKE N'%[^A-Za-z0-9_-]%' THEN 1 ELSE 0 END AS KeyCharsValid,
 CASE WHEN SUBSTRING(PasswordHash,47,1) COLLATE Latin1_General_100_BIN2 LIKE N'[AQgw]' THEN 1 ELSE 0 END AS SaltEndValid,
 CASE WHEN SUBSTRING(PasswordHash,91,1) COLLATE Latin1_General_100_BIN2 LIKE N'[AEIMQUYcgkosw048]' THEN 1 ELSE 0 END AS KeyEndValid,
 CASE WHEN Username COLLATE Latin1_General_100_BIN2=CONCAT(N'SONGLAM_TEST_',@BatchCode,N'_',UPPER(RoleCode)) COLLATE Latin1_General_100_BIN2 THEN 1 ELSE 0 END AS NameValid,
 CASE WHEN DATALENGTH(Username)=DATALENGTH(CONCAT(N'SONGLAM_TEST_',@BatchCode,N'_',UPPER(RoleCode))) THEN 1 ELSE 0 END AS NameBytesValid,
 CASE WHEN LEN(FullName) BETWEEN 1 AND 160 THEN 1 ELSE 0 END AS FullNameValid
 FROM OPENJSON(@AccountsJson) WITH(Username nvarchar(max) '$.username',FullName nvarchar(max) '$.fullName',RoleCode nvarchar(max) '$.roleCode',PasswordHash nvarchar(max) '$.passwordHash');`);
 console.log(JSON.stringify({readOnly:true,checks:result.recordset}));
}catch(error){console.log(JSON.stringify({status:'DIAGNOSTIC_FAILED',number:Number.isInteger(error?.number)?error.number:null}));process.exitCode=1;}
finally{await pool.close();}
