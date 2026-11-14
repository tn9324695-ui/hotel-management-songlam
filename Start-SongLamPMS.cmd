@echo off
setlocal
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File "%~dp0tools\sql\open-songlam-test.ps1"
if errorlevel 1 pause
endlocal
