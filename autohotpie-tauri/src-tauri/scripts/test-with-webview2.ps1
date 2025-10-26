[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$RuntimePath,

    [Parameter(Mandatory = $false)]
    [string[]]$CargoArgs = @("--lib", "--", "--nocapture")
)

$scriptRoot = Split-Path -Parent $PSCommandPath
$crateRoot = [IO.Path]::GetFullPath((Join-Path $scriptRoot ".."))

if (-not $RuntimePath) {
    $candidateRoots = @(
        ($crateRoot),
        ([IO.Path]::GetFullPath((Join-Path $crateRoot ".."))),
        ([IO.Path]::GetFullPath((Join-Path $crateRoot "..\..")))
    ) | ForEach-Object {
        Join-Path $_ "WebView2Fixed\runtimes\win-x64\native"
    }

    foreach ($candidate in $candidateRoots) {
        if ([string]::IsNullOrWhiteSpace($candidate)) { continue }
        if (Test-Path -LiteralPath $candidate) {
            $RuntimePath = $candidate
            break
        }
    }

    if (-not $RuntimePath) {
        throw "WebView2 runtime directory not found. Pass -RuntimePath 'C:\\path\\to\\WebView2\\EBWebView\\Redist'"
    }
}

$resolvedRuntime = Resolve-Path -LiteralPath $RuntimePath -ErrorAction SilentlyContinue
if (-not $resolvedRuntime) {
    throw "WebView2 runtime directory not found: $RuntimePath"
}

$env:WEBVIEW2_BROWSER_EXECUTABLE_FOLDER = $resolvedRuntime.ProviderPath
Write-Host "WEBVIEW2_BROWSER_EXECUTABLE_FOLDER=$env:WEBVIEW2_BROWSER_EXECUTABLE_FOLDER"

Push-Location $crateRoot
try {
    & cargo test @CargoArgs
} finally {
    Pop-Location
}
