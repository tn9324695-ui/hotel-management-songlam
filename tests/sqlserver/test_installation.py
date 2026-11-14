"""Smoke-test the PowerShell installer using a disposable UUID-named database."""
from pathlib import Path
import re
import shutil
import subprocess
import sys
import uuid

root=Path(__file__).resolve().parents[2]
db='SongLamInstallTest_'+uuid.uuid4().hex
sqlcmd=shutil.which('sqlcmd')
if not sqlcmd:
    raise SystemExit('sqlcmd not found')
base=[sqlcmd,'-S',r'lpc:.\SQLEXPRESS','-E','-C','-b','-h','-1','-W']

def sql(statement):
    result=subprocess.run(base+['-d','master','-Q',statement],capture_output=True,text=True,timeout=30)
    if result.returncode:
        raise RuntimeError(result.stdout+result.stderr)
    return result.stdout.strip()

if sql(f"SET NOCOUNT ON; SELECT COALESCE(DB_ID(N'{db}'),0);")!='0':
    raise SystemExit('Refusing to use an existing database')
try:
    result=subprocess.run(['powershell','-NoProfile','-ExecutionPolicy','RemoteSigned','-File',
        str(root/'database/sqlserver/install.ps1'),'-Database',db,'-TrustServerCertificate'],
        cwd=root,capture_output=True,text=True,timeout=60)
    if result.returncode:
        raise RuntimeError(result.stdout+result.stderr)
    version=sql(f'SET NOCOUNT ON; SELECT MAX(Version) FROM [{db}].pms.SchemaVersion;')
    if version!='3':
        raise AssertionError('Installer did not reach schema 3: '+version)
    # Re-running must refuse an existing database, without resetting it.
    rerun=subprocess.run(['powershell','-NoProfile','-ExecutionPolicy','RemoteSigned','-File',
        str(root/'database/sqlserver/install.ps1'),'-Database',db,'-TrustServerCertificate'],
        cwd=root,capture_output=True,text=True,timeout=30)
    if rerun.returncode==0 or 'Database already exists' not in rerun.stdout+rerun.stderr:
        raise AssertionError('Installer did not safely reject an existing database')
    if sql(f'SET NOCOUNT ON; SELECT MAX(Version) FROM [{db}].pms.SchemaVersion;')!='3':
        raise AssertionError('Existing database was changed')
    print('PASS: fresh PowerShell installation reached schema 3')
    print('PASS: second installation refused the existing database')
finally:
    if not re.fullmatch(r'SongLamInstallTest_[0-9a-f]{32}',db):
        raise RuntimeError('Unexpected cleanup target')
    sql(f"IF DB_ID(N'{db}') IS NOT NULL BEGIN ALTER DATABASE [{db}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [{db}]; END;")
    print('Removed disposable installer database:',db)
