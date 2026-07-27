$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DesktopDir = (Resolve-Path "$ScriptDir\..").Path
$AppDir = (Resolve-Path "$DesktopDir\..\app").Path
$RootDir = (Resolve-Path "$DesktopDir\..\..").Path
$env:PATH = "$RootDir\node_modules\.bin;$env:PATH"

# Build the Electron main process and apply the Codius runtime identity.
npm run build:main

# Prefer Metro's stable default port so dev browser storage keeps the same
# localhost origin across restarts. Fall back only when earlier ports are busy.
$PreviousNoColor = $env:NO_COLOR
$PreviousForceColor = $env:FORCE_COLOR
try {
    $env:NO_COLOR = "1"
    $env:FORCE_COLOR = "0"
    $env:EXPO_PORT = (npx get-port-cli 8081 8082 8083 8084 8085).Trim()
} finally {
    if ($null -eq $PreviousNoColor) {
        Remove-Item Env:\NO_COLOR -ErrorAction SilentlyContinue
    } else {
        $env:NO_COLOR = $PreviousNoColor
    }
    if ($null -eq $PreviousForceColor) {
        Remove-Item Env:\FORCE_COLOR -ErrorAction SilentlyContinue
    } else {
        $env:FORCE_COLOR = $PreviousForceColor
    }
}

# Set EXPO_DEV_URL in the environment so Electron inherits it.
$env:EXPO_DEV_URL = "http://localhost:$($env:EXPO_PORT)"

$RemoteDebuggingPort = if ($env:CODIUS_ELECTRON_REMOTE_DEBUGGING_PORT) {
    $env:CODIUS_ELECTRON_REMOTE_DEBUGGING_PORT
} else {
    "9223"
}
$ExistingElectronFlags = if ($env:CODIUS_ELECTRON_FLAGS) {
    "$($env:CODIUS_ELECTRON_FLAGS) "
} else {
    ""
}
$env:CODIUS_ELECTRON_FLAGS = "$($ExistingElectronFlags)--remote-debugging-port=$RemoteDebuggingPort"

# Allow any origin in dev so Electron on random ports works.
# SECURITY: wildcard CORS is unsafe in production — only acceptable here because
# the daemon binds to localhost and this script is never used for production.
$env:CODIUS_CORS_ORIGINS = "*"

# Fully isolate the dev instance from a production Codius install so `npm run dev`
# works while the installed app is open.
$DevStateDir = "$DesktopDir\.dev"
if (-not $env:CODIUS_HOME) {
    $env:CODIUS_HOME = "$DevStateDir\codius-home"
    $CodiusHomeManaged = $true
} else {
    $CodiusHomeManaged = $false
}

if (-not $env:CODIUS_ELECTRON_USER_DATA_DIR) {
    $env:CODIUS_ELECTRON_USER_DATA_DIR = "$DevStateDir\user-data"
}
New-Item -ItemType Directory -Force -Path $env:CODIUS_HOME, $env:CODIUS_ELECTRON_USER_DATA_DIR | Out-Null

$DevDaemonPort = if ($env:CODIUS_DEV_DAEMON_PORT) {
    $env:CODIUS_DEV_DAEMON_PORT
} else {
    "6788"
}
if (-not $env:CODIUS_LISTEN) { $env:CODIUS_LISTEN = "127.0.0.1:$DevDaemonPort" }

# Seed only the script-managed home. The daemon manager reads daemon.listen from
# config.json, so the dev port and wildcard CORS must be recorded there.
if ($CodiusHomeManaged) {
    $env:TMP_CFG_PATH = "$($env:CODIUS_HOME)/config.json"
    $env:TMP_CFG_PORT = $DevDaemonPort
    $TmpScript = [System.IO.Path]::GetTempFileName() + ".js"
    $ScriptContent = @"
const fs = require('fs');
const path = process.env.TMP_CFG_PATH;
const port = process.env.TMP_CFG_PORT;
let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(path, 'utf8')); } catch(e) {}
cfg.version = cfg.version || 1;
cfg.daemon = cfg.daemon || {};
cfg.daemon.listen = '127.0.0.1:' + port;
cfg.daemon.cors = cfg.daemon.cors || {};
cfg.daemon.cors.allowedOrigins = ['*'];
fs.writeFileSync(path, JSON.stringify(cfg, null, 2));
"@
    Set-Content -Path $TmpScript -Value $ScriptContent
    node $TmpScript
    Remove-Item $TmpScript -ErrorAction SilentlyContinue
    Remove-Item Env:\TMP_CFG_PATH -ErrorAction SilentlyContinue
    Remove-Item Env:\TMP_CFG_PORT -ErrorAction SilentlyContinue
} else {
    Write-Host "  (custom CODIUS_HOME - leaving its config.json untouched)"
}

Write-Host @"
======================================================
  Codius Dev (Windows)
======================================================
  Metro:       http://localhost:$($env:EXPO_PORT)
  CDP:         http://127.0.0.1:$RemoteDebuggingPort
  Daemon:      $($env:CODIUS_LISTEN) (isolated)
  CODIUS_HOME: $($env:CODIUS_HOME)
  userData:    $($env:CODIUS_ELECTRON_USER_DATA_DIR)
======================================================
"@

# Launch Metro + Electron together, kill both on exit.
concurrently `
    --kill-others `
    --names "metro,electron" `
    --prefix-colors "magenta,cyan" `
    "cd `"$AppDir`" && cross-env CODIUS_WEB_PLATFORM=electron npx expo start --port $($env:EXPO_PORT)" `
    "npx wait-on tcp:$($env:EXPO_PORT) && npx electron `"$DesktopDir`""
