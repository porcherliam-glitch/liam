@echo off
rem Builds the Windows installer (release\NOVA-AI-Setup-<version>.exe) and opens the release folder.
rem Needs Node.js 22.13 or newer and an internet connection (npm packages, Electron, NSIS).
setlocal
title NOVA AI - setup.exe erstellen
cd /d "%~dp0"

call :pruefe_node || goto :ende
echo Pakete werden installiert ...
call npm install || goto :fehler
echo Die setup.exe wird gebaut. Das dauert einige Minuten ...
call npm run dist:win || goto :fehler
echo.
echo Fertig. Die setup.exe liegt im Ordner "release". Er wird jetzt geoeffnet.
start "" explorer "%~dp0release"
goto :ende

:fehler
echo.
echo Es ist ein Fehler aufgetreten. Die Meldungen oben zeigen, was schiefging.
:ende
pause
exit /b

:pruefe_node
node --version >nul 2>nul
if not errorlevel 1 goto :node_version
echo Node.js fehlt. NOVA braucht Node.js 22.13 oder neuer.
where winget >nul 2>nul || (
  echo Bitte Node.js LTS von https://nodejs.org installieren und diese Datei danach erneut doppelklicken.
  exit /b 1
)
choice /c JN /m "Soll Node.js jetzt mit winget installiert werden (J = Ja, N = Nein)"
if errorlevel 2 exit /b 1
winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements || exit /b 1
echo.
echo Node.js ist installiert. Bitte dieses Fenster schliessen und die Datei noch einmal doppelklicken,
echo damit Windows Node.js findet.
exit /b 1
:node_version
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)"
if errorlevel 1 (
  echo Node.js ist zu alt. Bitte Node.js 22.13 oder neuer installieren: https://nodejs.org
  exit /b 1
)
exit /b 0
