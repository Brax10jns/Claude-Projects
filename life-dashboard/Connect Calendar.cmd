@echo off
cd /d "%~dp0"
chcp 65001 >nul
title Life Dashboard - iCloud Calendar
where node >nul 2>nul
if errorlevel 1 goto :nonode
node src\connect.js calendar
if errorlevel 1 goto :end
start "" "%USERPROFILE%\LifeDashboard\life-dashboard.html"
echo.
echo Done. Copy everything above this line and paste it to Claude.
goto :end
:nonode
echo Node.js is not installed. Opening nodejs.org - install the LTS version, then try again.
start https://nodejs.org
:end
echo.
pause
