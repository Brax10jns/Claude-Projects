@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"
chcp 65001 >nul
title Life Dashboard - Apple Health

rem Double-click: uses the newest export*.zip in Downloads.
rem Or drag the zip, or the extracted apple_health_export folder, onto this file.

where node >nul 2>nul
if errorlevel 1 goto :nonode

if not exist config.json copy config.example.json config.json >nul

set "SRC=%~1"
if defined SRC goto :havesrc

for /f "usebackq delims=" %%D in (`powershell -NoProfile -Command "(New-Object -ComObject Shell.Application).NameSpace('shell:Downloads').Self.Path"`) do set "DL=%%D"
if not defined DL set "DL=%USERPROFILE%\Downloads"
echo Looking in !DL! ...
for /f "delims=" %%F in ('dir /b /a-d /o-d "!DL!\export*.zip" 2^>nul') do if not defined SRC set "SRC=!DL!\%%F"
if not defined SRC if exist "!DL!\apple_health_export\export.xml" set "SRC=!DL!\apple_health_export"
if not defined SRC if exist "!DL!\export\apple_health_export\export.xml" set "SRC=!DL!\export\apple_health_export"
if not defined SRC goto :nofile

:havesrc
echo Using: !SRC!
set "XML="
if /i "!SRC:~-4!"==".zip" goto :unzip
if exist "!SRC!\export.xml" set "XML=!SRC!\export.xml"
if exist "!SRC!\apple_health_export\export.xml" set "XML=!SRC!\apple_health_export\export.xml"
if /i "!SRC:~-4!"==".xml" set "XML=!SRC!"
if not defined XML goto :noxml
goto :run

:unzip
set "TMPDIR=%TEMP%\life-dashboard-health"
if exist "!TMPDIR!" rmdir /s /q "!TMPDIR!"
mkdir "!TMPDIR!"
echo Unzipping, this can take a minute for a big export ...
tar -xf "!SRC!" -C "!TMPDIR!"
if errorlevel 1 goto :badzip
for /f "delims=" %%X in ('dir /s /b "!TMPDIR!\export.xml" 2^>nul') do if not defined XML set "XML=%%X"
if not defined XML goto :noxml

:run
node src\sources\apple-health.js "!XML!"
set "RC=!errorlevel!"
if defined TMPDIR rmdir /s /q "!TMPDIR!" 2>nul
if not "!RC!"=="0" goto :end
node src\build.js
if errorlevel 1 goto :end
start "" "%~dp0dist\life-dashboard.html"
echo.
echo Done. Copy everything above this line and paste it to Claude.
goto :end

:nonode
echo Node.js is not installed. Opening nodejs.org - install the LTS version,
echo then double-click this file again.
start https://nodejs.org
goto :end

:nofile
echo No export*.zip found in your Downloads folder.
echo Drag the Health export zip onto this file instead.
goto :end

:badzip
echo Could not unzip !SRC!. Right-click it, choose Extract All,
echo then drag the extracted apple_health_export folder onto this file.
goto :end

:noxml
echo Could not find export.xml in !SRC!.
echo Drag the apple_health_export folder onto this file instead.
goto :end

:end
echo.
pause
