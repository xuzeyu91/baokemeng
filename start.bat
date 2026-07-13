@echo off
chcp 65001 >nul 2>&1
echo Starting Pokemon Card Battle server...
echo ========================================
echo.
echo Server starting...
echo.
echo Local:   http://localhost:8000
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    for /f "tokens=1" %%b in ("%%a") do echo Network: http://%%b:8000
)
echo.
echo Press Ctrl+C to stop the server
echo ========================================

rem Switch to the folder where this bat lives (so double-click works from anywhere)
cd /d "%~dp0"

rem Make sure python is available
where python >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Python not found. Please install Python 3 and add it to PATH.
    pause
    exit /b 1
)

rem Open browser automatically after 2 seconds (remove this line if not wanted)
timeout /t 2 /nobreak >nul & start "" http://localhost:8000

python serve.py
