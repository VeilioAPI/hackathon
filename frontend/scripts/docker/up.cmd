@echo off
cd /d "%~dp0..\.."
docker compose up --build -d
if errorlevel 1 exit /b 1
echo.
echo Frontend:  http://localhost:3000
echo Backend:   http://localhost:3001/api/health
echo Logs:      docker compose logs -f
echo Stop:      docker compose down
