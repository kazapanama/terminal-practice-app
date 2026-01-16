@echo off
echo Starting Linux Command Practice...
echo.

:: Try to find an available port
set PORT=8080

:: Open browser after a short delay
start "" cmd /c "timeout /t 2 >nul && start http://localhost:%PORT%"

:: Try Python first (most common)
python -m http.server %PORT% 2>nul
if %errorlevel% neq 0 (
    python3 -m http.server %PORT% 2>nul
)
if %errorlevel% neq 0 (
    :: Try Node.js serve
    npx serve -l %PORT% 2>nul
)
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Could not start server.
    echo Please install Python or Node.js
    pause
)
