@echo off
rem Copia fechada de la base de datos. Todo lo del centro esta en ese fichero:
rem clientes, historial, ventas y caja.
setlocal
cd /d "%~dp0"

if not exist "backups" mkdir "backups"

for /f %%a in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HHmm"') do set "SELLO=%%a"

copy /y "data\lucyerp.db" "backups\lucyerp-%SELLO%.db" >nul
if errorlevel 1 (
  echo No se ha podido copiar la base de datos.
) else (
  echo Copia creada: backups\lucyerp-%SELLO%.db
  echo.
  echo Esta copia esta en el mismo disco que la original: llevatela tambien
  echo a un USB o a la nube, o no sirve de nada si el disco falla.
)
pause
