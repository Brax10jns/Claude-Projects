# Starts Resume Gauntlet in the background (if it isn't already running) and opens it in your browser.
# The desktop shortcut and the sign-in startup entry made by `npm run install-shortcuts` both run this.
#
#   launch.ps1               start the server if needed, then open the app
#   launch.ps1 -NoBrowser    start the server only (used at Windows sign-in)
#
# The server runs hidden; its output goes to %LOCALAPPDATA%\ResumeGauntlet\server.log.
param([switch]$NoBrowser)

$ErrorActionPreference = "Stop"
$here = $PSScriptRoot
$port = if ($env:PORT) { $env:PORT } else { "3000" }
$url = "http://127.0.0.1:$port"
Add-Type -AssemblyName System.Windows.Forms

function Show-Message($text, $buttons = "OK", $icon = "Information") {
    [System.Windows.Forms.MessageBox]::Show($text, "Resume Gauntlet", $buttons, $icon)
}

# Returns the server's health ({ ok, model }) or $null when nothing answers on the port.
function Get-Health {
    try { Invoke-RestMethod "$url/api/health" -TimeoutSec 2 } catch { $null }
}

# Shortcuts don't start from a terminal, so pick up a key saved by `npm run set-key` straight from the user profile.
if (-not $env:ANTHROPIC_API_KEY) {
    $env:ANTHROPIC_API_KEY = [Environment]::GetEnvironmentVariable("ANTHROPIC_API_KEY", "User")
}
$hasKey = $env:ANTHROPIC_API_KEY -or (Test-Path (Join-Path $here ".env"))

if (-not $hasKey) {
    # At sign-in, stay quiet: the desktop shortcut asks for the key when you actually open the app.
    if ($NoBrowser) { exit 0 }
    $answer = Show-Message "No Anthropic API key is saved yet. Set it now?" "YesNo" "Question"
    if ($answer -ne "Yes") { exit 0 }
    Start-Process powershell -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$here\set-api-key.ps1`"" -Wait
    $env:ANTHROPIC_API_KEY = [Environment]::GetEnvironmentVariable("ANTHROPIC_API_KEY", "User")
    if (-not $env:ANTHROPIC_API_KEY) { exit 0 }
}

$health = Get-Health

# A server started before the key was saved can't review anything; restart it with the key.
if ($health -and -not $health.ok -and $env:ANTHROPIC_API_KEY) {
    Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        ForEach-Object { Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue } |
        Where-Object { $_.ProcessName -eq "node" } |
        Stop-Process -Force
    Start-Sleep -Milliseconds 500
    $health = $null
}

if (-not $health) {
    $node = (Get-Command node -ErrorAction SilentlyContinue).Source
    if (-not $node) {
        if (-not $NoBrowser) { Show-Message "Node.js isn't installed. Install it from https://nodejs.org, then try again." "OK" "Error" }
        exit 1
    }
    if (-not (Test-Path (Join-Path $here "node_modules"))) {
        Start-Process npm.cmd -ArgumentList "install" -WorkingDirectory $here -Wait
    }

    $logDir = Join-Path $env:LOCALAPPDATA "ResumeGauntlet"
    New-Item -ItemType Directory -Force $logDir | Out-Null
    Start-Process $node -ArgumentList "server.js" -WorkingDirectory $here -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $logDir "server.log") -RedirectStandardError (Join-Path $logDir "server-error.log")

    # Wait up to ~15 seconds for it to answer.
    for ($i = 0; $i -lt 30 -and -not $health; $i++) {
        Start-Sleep -Milliseconds 500
        $health = Get-Health
    }
    if (-not $health) {
        if (-not $NoBrowser) { Show-Message "The server didn't start. Details are in $logDir\server-error.log." "OK" "Error" }
        exit 1
    }
}

if (-not $NoBrowser) { Start-Process $url }
