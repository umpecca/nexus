[CmdletBinding()]
param(
    [switch]$SkipBuild,
    [switch]$InstallIfMissing
)

$ErrorActionPreference = "Stop"

function Invoke-ProjectCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath,

        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    Write-Host "> $FilePath $($Arguments -join ' ')"
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed with exit code $LASTEXITCODE."
    }
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npmCommand) {
    $npmCommand = Get-Command npm -ErrorAction SilentlyContinue
}

if (-not $npmCommand) {
    throw "npm was not found on PATH. Install Node.js, then try again."
}

Push-Location $repoRoot
try {
    if (-not (Test-Path -LiteralPath "package.json")) {
        throw "package.json was not found in $repoRoot."
    }

    if (-not (Test-Path -LiteralPath "node_modules")) {
        if ($InstallIfMissing) {
            Invoke-ProjectCommand -FilePath $npmCommand.Source -Arguments @("install")
        } else {
            throw "node_modules was not found. Run npm install, or rerun this script with -InstallIfMissing."
        }
    }

    if (-not $SkipBuild) {
        Invoke-ProjectCommand -FilePath $npmCommand.Source -Arguments @("run", "build")
    }

    $electronCommand = Join-Path $repoRoot "node_modules\.bin\electron.cmd"
    if (-not (Test-Path -LiteralPath $electronCommand)) {
        throw "Electron launcher was not found at $electronCommand. Run npm install, then try again."
    }

    Invoke-ProjectCommand -FilePath $electronCommand -Arguments @(".")
} finally {
    Pop-Location
}
