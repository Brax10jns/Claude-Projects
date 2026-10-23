# Adds a "Resume Gauntlet" shortcut to your desktop and starts the server quietly when you sign in to Windows.
#
#   npm run install-shortcuts    add both
#   npm run remove-shortcuts     remove both (and stop the running server)
param([switch]$Remove)

$launcher = Join-Path $PSScriptRoot "launch.ps1"
$desktop = Join-Path ([Environment]::GetFolderPath("Desktop")) "Resume Gauntlet.lnk"
$startup = Join-Path ([Environment]::GetFolderPath("Startup")) "Resume Gauntlet (server).lnk"

if ($Remove) {
    Remove-Item $desktop, $startup -ErrorAction SilentlyContinue
    $port = if ($env:PORT) { $env:PORT } else { "3000" }
    Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        ForEach-Object { Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue } |
        Where-Object { $_.ProcessName -eq "node" } |
        Stop-Process -Force
    Write-Host "Removed the desktop shortcut and the sign-in startup entry."
    exit 0
}

$shell = New-Object -ComObject WScript.Shell
function New-Shortcut($path, $extraArgs, $description) {
    $lnk = $shell.CreateShortcut($path)
    $lnk.TargetPath = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
    $lnk.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcher`" $extraArgs".Trim()
    $lnk.WorkingDirectory = $PSScriptRoot
    $lnk.WindowStyle = 7  # minimized, so no console flashes up
    $lnk.IconLocation = "$env:SystemRoot\System32\imageres.dll,-112"
    $lnk.Description = $description
    $lnk.Save()
}

New-Shortcut $desktop "" "Open Resume Gauntlet (starts it if needed)"
New-Shortcut $startup "-NoBrowser" "Starts the Resume Gauntlet server when you sign in"
Write-Host "Added 'Resume Gauntlet' to your desktop."
Write-Host "The server now starts in the background each time you sign in to Windows."
