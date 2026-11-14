// Build review artifacts only. Never connects to SQL or executes pending files.
import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../../database/proposals/auth-v1/', import.meta.url);
const entries = [
  { source:'contracts/test-staff-body.sql', file:'006-test-staff-bootstrap.sql.pending', name:'pms.usp_SeedTestStaffBatch', role:null },
  { source:'contracts/catalog-read-body.sql', file:'007-catalog-read.sql.pending', name:'pms.usp_AppCatalogRead', role:'pms_web_catalog_reader' }
];
for (const item of entries) {
  const body = await readFile(new URL(item.source, root), 'utf8');
  const script = `-- GENERATED REVIEW ARTIFACT: node tools/sql/render-login-contracts.mjs
-- Never executed by server, installer or this renderer. Separate review required.
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET NOCOUNT ON;
SET XACT_ABORT ON;
DECLARE @ApprovalReference nvarchar(200)=NULL;
IF NULLIF(@ApprovalReference,N'') IS NULL THROW 53900,'Contract deployment not approved.',1;
IF DB_NAME()<>N'SongLamPms_Design' OR CONVERT(nvarchar(128),SERVERPROPERTY('ServerName'))<>N'DESKTOP-9EPI86K\\SQLEXPRESS'
 OR NOT EXISTS(SELECT 1 FROM sys.database_recovery_status WHERE database_id=DB_ID() AND database_guid='C4DD399E-5661-4741-A424-5ABFEEFBC1AC')
 THROW 53901,'Unexpected contract target.',1;
IF @@TRANCOUNT<>0 THROW 53902,'No ambient transaction permitted.',1;
IF NOT EXISTS(SELECT 1 FROM sys.extended_properties WHERE class=0 AND name=N'SongLam.Environment' AND CONVERT(nvarchar(128),value)=N'test')
 OR NOT EXISTS(SELECT 1 FROM sys.extended_properties WHERE class=0 AND name=N'SongLam.TestIdentity' AND CONVERT(nvarchar(128),value)=N'eb18c6f2-373d-4a83-a34f-d9809f1cbc7a')
 THROW 53903,'Verified D1 markers required.',1;
IF OBJECT_ID(N'${item.name}') IS NOT NULL${item.role ? ` OR DATABASE_PRINCIPAL_ID(N'${item.role}') IS NOT NULL` : ''}
 THROW 53904,'Existing objects require upgrade review; no overwrite.',1;
BEGIN TRY
 BEGIN TRANSACTION;
 EXEC sys.sp_executesql N'${body.replaceAll("'", "''")}';
${item.role ? ` EXEC(N'CREATE ROLE ${item.role} AUTHORIZATION dbo');
 GRANT EXECUTE ON OBJECT::${item.name} TO ${item.role};` : ' -- No grant to the web service: maintenance-only bootstrap.'}
 COMMIT;
 SELECT N'CONTRACT_DEPLOYED_INTEGRATION_NOT_VERIFIED' AS Status;
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK;
 THROW;
END CATCH;
`;
  await writeFile(new URL(item.file, root), script, 'utf8');
  console.log('RENDERED_REVIEW_ONLY ' + item.file);
}
