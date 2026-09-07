@echo off
rem Arranca LucyERP en este PC. Deja la ventana abierta mientras se usa.
setlocal
cd /d "%~dp0"

rem Node: si hay uno portable en la carpeta node\ se usa ese; si no, el del sistema.
set "NODE_EXE=node"
if exist "%~dp0node\node.exe" set "NODE_EXE=%~dp0node\node.exe"

rem La base de datos, siempre la de esta carpeta, este instalada donde este.
set "DATABASE_URL=file:%~dp0data/lucyerp.db"
set "DATABASE_URL=%DATABASE_URL:\=/%"

rem Solo este PC: no se abre a la red, asi que Windows no pregunta por el firewall.
set "HOSTNAME=127.0.0.1"
set "PORT=3000"
set "NODE_ENV=production"

echo.
echo   LucyERP arrancando en http://localhost:3000
echo   Deja esta ventana abierta mientras uses la aplicacion.
echo.
"%NODE_EXE%" server.js
pause
