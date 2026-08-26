@echo off
cd /d "%~dp0"
:loop
"%~dp0..\.venv\Scripts\python.exe" -u manage.py sync_worker >> "%~dp0sync_worker.log" 2>&1
echo %date% %time% - sync_worker exited, restarting in 10s... >> "%~dp0sync_worker.log"
timeout /t 10 /nobreak >nul
goto loop
