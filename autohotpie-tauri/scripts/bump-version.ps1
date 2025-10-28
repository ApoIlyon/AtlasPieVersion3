param(
    [Parameter(Mandatory = $true)]
    [string]$Version
)

$ErrorActionPreference = "Stop"

if ($Version -notmatch '^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$') {
    Write-Error "Invalid version '$Version'. Use SemVer format, e.g. 0.1.1"
    exit 1
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$packageJsonPath = Join-Path $projectRoot 'package.json'
$packageLockPath = Join-Path $projectRoot 'package-lock.json'
$tauriConfPath = Join-Path $projectRoot 'src-tauri/tauri.conf.json'
$cargoTomlPath = Join-Path $projectRoot 'src-tauri/Cargo.toml'
$cargoLockPath = Join-Path $projectRoot 'src-tauri/Cargo.lock'

function Update-File {
    param(
        [string]$Path,
        [scriptblock]$Updater
    )

    $content = Get-Content -Path $Path -Raw
    $newContent = & $Updater $content

    if ($null -eq $newContent) {
        Write-Error "Failed to update '$Path'"
        exit 1
    }

    if ($newContent -ne $content) {
        Set-Content -Path $Path -Value $newContent -Encoding UTF8
    }
}

$packageJson = Get-Content -Path $packageJsonPath -Raw
$packageVersionMatch = [regex]::Match($packageJson, '"version"\s*:\s*"([^"]+)"')
if (-not $packageVersionMatch.Success) {
    Write-Error "Could not find version in package.json"
    exit 1
}
$previousVersion = $packageVersionMatch.Groups[1].Value

Update-File -Path $packageJsonPath -Updater {
    param($content)
    [regex]::Replace($content, '"version"\s*:\s*"[^"]+"', '"version": "' + $Version + '"', 1)
}

if (Test-Path $packageLockPath) {
    Update-File -Path $packageLockPath -Updater {
        param($content)
        if ($content -notmatch [regex]::Escape($previousVersion)) {
            return $content
        }
        $pattern = '"version"\s*:\s*"' + [regex]::Escape($previousVersion) + '"'
        [regex]::Replace($content, $pattern, { param($m) '"version": "' + $Version + '"' }, 2)
    }
}

Update-File -Path $tauriConfPath -Updater {
    param($content)
    [regex]::Replace($content, '"version"\s*:\s*"[^"]+"', '"version": "' + $Version + '"', 1)
}

Update-File -Path $cargoTomlPath -Updater {
    param($content)
    $pattern = '(?m)^(version\s*=\s*")([^"]+)(")'
    [regex]::Replace($content, $pattern, { param($m) $m.Groups[1].Value + $Version + $m.Groups[3].Value }, 1)
}

if (Test-Path $cargoLockPath) {
    Update-File -Path $cargoLockPath -Updater {
        param($content)
        $pattern = '(?s)(\[\[package\]\]\s+name = "autohotpie-tauri"\s+version = ")([^"]+)(")'
        if ($content -notmatch $pattern) {
            return $content
        }
        [regex]::Replace($content, $pattern, { param($m) $m.Groups[1].Value + $Version + $m.Groups[3].Value }, 1)
    }
}

Write-Host "Updated project version to $Version"
if ($previousVersion -ne $Version) {
    Write-Host "Previous version: $previousVersion"
}
