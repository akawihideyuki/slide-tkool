@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

set "PORT=8000"
set "PYTHON_CMD="

where py >nul 2>nul
if %errorlevel%==0 set "PYTHON_CMD=py -3"

if not defined PYTHON_CMD (
  where python >nul 2>nul
  if %errorlevel%==0 set "PYTHON_CMD=python"
)

if not defined PYTHON_CMD (
  echo.
  echo Python was not found.
  echo Install Python or add it to PATH, then try again.
  echo.
  pause
  exit /b 1
)

echo.
echo スライドつく～るを起動しています...
echo Open: http://127.0.0.1:%PORT%/
echo.
echo スライドつく～るの使用中は、このウィンドウを開いたままにしてください。
echo このウィンドウを閉じると、ローカルサーバーが停止します。
echo.

start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Milliseconds 900; Start-Process 'http://127.0.0.1:%PORT%/'"

%PYTHON_CMD% -m http.server %PORT% --bind 127.0.0.1

if errorlevel 1 (
  echo.
  echo Failed to start the local server.
  echo Port %PORT% may already be in use.
  echo.
  pause
)

endlocal
