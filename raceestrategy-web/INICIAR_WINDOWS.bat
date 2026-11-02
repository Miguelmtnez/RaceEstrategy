@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title RaceEstrategy - Preparacion

echo ========================================================
echo   RACEESTRATEGY - INSTALACION Y ARRANQUE LOCAL
 echo ========================================================

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Necesitas Node.js instalado y agregado al PATH.
  pause
  exit /b 1
)
if not exist "backend\package.json" (
  echo ERROR: No se encuentra backend\package.json. Descomprime el ZIP completo.
  pause
  exit /b 1
)
if not exist "frontend\package.json" (
  echo ERROR: No se encuentra frontend\package.json. Descomprime el ZIP completo.
  pause
  exit /b 1
)

echo Comprobando la estructura del proyecto...
node COMPROBAR_ARCHIVOS.cjs
if errorlevel 1 (
  pause
  exit /b 1
)

if not exist "backend\.env" (
  copy /Y "backend\.env.example" "backend\.env" >nul
  node -e "const fs=require('fs'),crypto=require('crypto'),p='backend/.env';fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace(/^TOKEN_ENCRYPTION_KEY=.*$/m,'TOKEN_ENCRYPTION_KEY='+crypto.randomBytes(32).toString('hex')));"
  if errorlevel 1 (
    echo ERROR: No se pudo crear backend\.env.
    pause
    exit /b 1
  )
  echo [OK] Archivo .env local creado con una clave aleatoria.
) else (
  echo [OK] Se conserva backend\.env existente.
)

 echo.
 echo Instalando dependencias del backend...
call npm install --prefix backend
if errorlevel 1 (
  echo ERROR al instalar el backend. Revisa los mensajes anteriores.
  pause
  exit /b 1
)
 echo.
 echo Instalando dependencias del frontend...
call npm install --prefix frontend
if errorlevel 1 (
  echo ERROR al instalar el frontend. Revisa los mensajes anteriores.
  pause
  exit /b 1
)

 echo.
 echo [OK] Abriendo el backend y el frontend en dos ventanas.
start "RaceEstrategy BACKEND" /D "%~dp0backend" cmd /k npm run dev
start "RaceEstrategy FRONTEND" /D "%~dp0frontend" cmd /k npm run dev
 echo.
 echo Entra en http://localhost:5173
 echo Mantén abiertas ambas terminales mientras uses la web.
 echo Para conectar Strava por API debes completar backend\.env.
 echo Si quieres importar ZIP o CSV, no necesitas configurar Strava API.
 pause
