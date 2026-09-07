@echo off
rem Instala LucyERP como servicio de Windows, para que arranque solo al
rem encender el PC. Ejecutar COMO ADMINISTRADOR, con nssm.exe en esta carpeta
rem (se descarga de https://nssm.cc).
rem
rem El servicio arranca node directamente y no este .cmd: NSSM lanza
rem ejecutables, y ademas un .cmd se quedaria colgado en el `pause`.
setlocal
cd /d "%~dp0"

if not exist "%~dp0nssm.exe" (
  echo Falta nssm.exe en esta carpeta. Descargalo de https://nssm.cc y dejalo aqui.
  pause
  exit /b 1
)

set "NODE_EXE=node.exe"
if exist "%~dp0node\node.exe" set "NODE_EXE=%~dp0node\node.exe"

set "DB_URL=file:%~dp0data/lucyerp.db"
set "DB_URL=%DB_URL:\=/%"

if not exist "logs" mkdir "logs"

nssm.exe install LucyERP "%NODE_EXE%" "%~dp0server.js"
nssm.exe set LucyERP AppDirectory "%~dp0"
nssm.exe set LucyERP DisplayName "LucyERP"
nssm.exe set LucyERP Description "ERP del centro de estetica (http://localhost:3000)"
nssm.exe set LucyERP Start SERVICE_AUTO_START
nssm.exe set LucyERP AppEnvironmentExtra NODE_ENV=production HOSTNAME=127.0.0.1 PORT=3000 DATABASE_URL=%DB_URL%
nssm.exe set LucyERP AppStdout "%~dp0logs\lucyerp.log"
nssm.exe set LucyERP AppStderr "%~dp0logs\lucyerp.log"
nssm.exe set LucyERP AppRotateFiles 1

net start LucyERP

echo.
echo Listo. Abre http://localhost:3000
pause
