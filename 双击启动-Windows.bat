@echo off
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 run-demo.py
) else (
  python run-demo.py
)
if errorlevel 1 (
  echo Please install Python 3 if it is not available, then try again.
  pause
)
