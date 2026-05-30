param(
    [string]$OutputPath = ".\build\cpa-usage-keeper.exe",
    [string]$Msys2Root = "D:\msys2",
    [switch]$SkipWebBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-CommandPath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,
        [string[]]$Candidates = @()
    )

    foreach ($candidate in $Candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }

    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if ($null -ne $command) {
        return $command.Source
    }

    throw "Cannot find required command: $Name"
}

function Resolve-Gcc {
    param([string]$Root)

    $candidates = @(
        (Join-Path $Root "ucrt64\bin\gcc.exe"),
        (Join-Path $Root "mingw64\bin\gcc.exe")
    )

    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }

    throw "Cannot find MSYS2 GCC. Install it with: $Root\usr\bin\pacman.exe -S --needed mingw-w64-ucrt-x86_64-gcc"
}

$repoRoot = Split-Path -Parent $PSCommandPath
Push-Location $repoRoot
try {
    $go = Resolve-CommandPath -Name "go" -Candidates @(
        $env:GO_EXE,
        "D:\go\bin\go.exe"
    )
    $npm = Resolve-CommandPath -Name "npm"
    $gcc = Resolve-Gcc -Root $Msys2Root
    $gccBin = Split-Path -Parent $gcc

    $env:Path = "$gccBin;$env:Path"
    $env:CGO_ENABLED = "1"
    $env:CC = "gcc"

    if (-not $SkipWebBuild) {
        Write-Host "Building web assets..."
        & $npm --prefix ".\web" run build
    }

    $outputFullPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath)
    $outputDir = Split-Path -Parent $outputFullPath
    if (-not (Test-Path -LiteralPath $outputDir)) {
        New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
    }

    Write-Host "Building server binary..."
    & $go build -trimpath -ldflags "-s -w" -o $outputFullPath ".\cmd\server"

    if (-not (Test-Path -LiteralPath $outputFullPath)) {
        throw "Build finished without output file: $outputFullPath"
    }

    $artifact = Get-Item -LiteralPath $outputFullPath
    Write-Host "Built $($artifact.FullName) ($($artifact.Length) bytes)"
}
finally {
    Pop-Location
}
