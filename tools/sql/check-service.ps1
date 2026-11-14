$c = Import-Clixml 'tools\sql\private\service-account\credential.clixml'
$p = Start-Process 'C:\Program Files\nodejs\node.exe' -Credential $c -LoadUserProfile -WorkingDirectory 'C:\ProgramData\SongLamPmsTest\20261112-modules-3-4' -ArgumentList 'tools\sql\service-entry.mjs' -RedirectStandardOutput 'C:\ProgramData\SongLamPmsTest\20261112-modules-3-4\logs\test-out.txt' -RedirectStandardError 'C:\ProgramData\SongLamPmsTest\20261112-modules-3-4\logs\test-err.txt' -PassThru
Start-Sleep -Seconds 3
Get-Process -Id $p.Id -ErrorAction SilentlyContinue | Format-List Id, ProcessName, HasExited
if (Test-Path 'C:\ProgramData\SongLamPmsTest\20261112-modules-3-4\logs\test-out.txt') {
    Write-Host "--- OUT ---"
    Get-Content 'C:\ProgramData\SongLamPmsTest\20261112-modules-3-4\logs\test-out.txt'
}
if (Test-Path 'C:\ProgramData\SongLamPmsTest\20261112-modules-3-4\logs\test-err.txt') {
    Write-Host "--- ERR ---"
    Get-Content 'C:\ProgramData\SongLamPmsTest\20261112-modules-3-4\logs\test-err.txt'
}
