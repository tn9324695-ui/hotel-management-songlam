$cred = Import-Clixml 'tools\sql\private\service-account\credential.clixml'
$proc = Start-Process 'C:\Program Files\nodejs\node.exe' -Credential $cred -LoadUserProfile -WindowStyle Hidden -WorkingDirectory 'C:\ProgramData\SongLamPmsTest\20261112-modules-3-4' -ArgumentList 'tools\sql\service-entry.mjs' -RedirectStandardOutput 'C:\ProgramData\SongLamPmsTest\20261112-modules-3-4\logs\live-out.txt' -RedirectStandardError 'C:\ProgramData\SongLamPmsTest\20261112-modules-3-4\logs\live-err.txt' -PassThru
Write-Host "Started PID: $($proc.Id)"

for ($i = 0; $i -lt 15; $i++) {
    Start-Sleep -Seconds 2
    try {
        $res = Invoke-RestMethod -Uri 'http://127.0.0.1:8093/api/v1/connection/status' -TimeoutSec 3
        Write-Host "T=$($i*2)s: Success, sqlConnected=$($res.data.sqlConnected)"
    } catch {
        Write-Host "T=$($i*2)s: Error: $_"
        $status = Get-Process -Id $proc.Id -ErrorAction SilentlyContinue
        Write-Host "Process running: $($null -ne $status)"
        break
    }
}
