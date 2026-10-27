@echo off
cd /d "%~dp0"
chcp 65001 >nul
title Life Dashboard - Schedule daily update
where node >nul 2>nul
if errorlevel 1 goto :nonode
node src\schedule.js
goto :end
:nonode
echo Node.js is not installed. Opening nodejs.org - install the LTS version, then try again.
start https://nodejs.org
:end
echo.
pause
