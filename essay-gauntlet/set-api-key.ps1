# Saves your Anthropic API key as a Windows user environment variable (ANTHROPIC_API_KEY),
# so it lives in your Windows profile instead of a file in this (OneDrive-synced) folder.
#
#   npm run set-key          save or replace the key
#   npm run remove-key       delete it
#
# Afterwards, open a NEW terminal before running npm start: Windows only hands
# updated variables to programs started after the change.
param([switch]$Remove)

$name = "ANTHROPIC_API_KEY"

if ($Remove) {
    [Environment]::SetEnvironmentVariable($name, $null, "User")
    Write-Host "Removed $name from your Windows user environment."
    exit 0
}

$existing = [Environment]::GetEnvironmentVariable($name, "User")
if ($existing) { Write-Host "A key is already saved. Entering a new one replaces it." }

# Read the key without echoing it to the screen.
$secure = Read-Host -Prompt "Paste your Anthropic API key (input is hidden)" -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr).Trim() }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }

if (-not $key) { Write-Host "No key entered; nothing changed."; exit 1 }
if (-not $key.StartsWith("sk-ant-")) {
    Write-Host "That doesn't look like an Anthropic API key (they start with sk-ant-). Nothing changed."
    exit 1
}

[Environment]::SetEnvironmentVariable($name, $key, "User")
Write-Host "Saved $name to your Windows user environment."
Write-Host "Open a new terminal, then run: npm start"
