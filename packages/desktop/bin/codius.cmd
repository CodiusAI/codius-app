@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "RESOURCES_DIR=%SCRIPT_DIR%.."
set "APP_EXECUTABLE=%RESOURCES_DIR%\..\Codius.exe"
if not exist "%APP_EXECUTABLE%" (
  echo Bundled Codius executable not found relative to %RESOURCES_DIR% 1>&2
  exit /b 1
)

set "ELECTRON_RUN_AS_NODE=1"
set "CODIUS_NODE_ENV=production"
set "CODIUS_DESKTOP_MANAGED=1"
set "CODIUS_CLI=%~f0"
"%APP_EXECUTABLE%" --disable-warning=DEP0040 "%RESOURCES_DIR%\app.asar.unpacked\dist\daemon\node-entrypoint-runner.js" node-script "%RESOURCES_DIR%\app.asar\node_modules\@codius.ai\cli\dist\index.js" %*
exit /b %errorlevel%
