# Download onnxruntime-win-x64-gpu_cuda12-1.28.0 (CUDA EP runtime, ADR-009 / v0.4.0 M1)
#
# @ai-context: TLS interception on this machine breaks rustls downloads from CDNs
#              (UnknownIssuer); PowerShell uses the Windows cert store and works.
#              Runtime distribution therefore goes through PowerShell scripts.
# @ai-context: .part atomic write + Content-Length check (TD-007/M7 pattern).
#              The GPU package bundles CUDA/cuDNN runtime DLLs; onnxruntime.dll
#              still works on non-NVIDIA machines (CUDA EP init fails, CPU EP used).
#              Requires an NVIDIA driver supporting CUDA 12.x for GPU use.
#
# Usage: powershell -ExecutionPolicy Bypass -File app/download-ort-cuda.ps1
#
# NOTE: keep this file ASCII-only - PowerShell 5.1 parses BOM-less UTF-8 as
#       ANSI/GBK, and non-ASCII bytes corrupt parsing on Chinese Windows.

$ErrorActionPreference = "Stop"
# 脚本位于 app/（与 download-ffmpeg.ps1 同约定）；ort 目录在 app/src-tauri/ort
$appDir = $PSScriptRoot
$ortDir = Join-Path $appDir "src-tauri\ort"
$version = "1.28.0"
$pkg = "onnxruntime-win-x64-gpu_cuda12-$version"
$urls = @(
    "https://github.com/microsoft/onnxruntime/releases/download/v$version/$pkg.zip"
)
$zip = Join-Path $ortDir "$pkg.zip"
$part = "$zip.part"
$dest = Join-Path $ortDir $pkg

if (Test-Path (Join-Path $dest "lib\onnxruntime.dll")) {
    Write-Host "[download-ort-cuda] already present: $dest, skip"
    exit 0
}
New-Item -ItemType Directory -Force -Path $ortDir | Out-Null

$downloaded = $false
foreach ($url in $urls) {
    try {
        Write-Host "[download-ort-cuda] downloading: $url"
        $resp = Invoke-WebRequest -Uri $url -OutFile $part -UseBasicParsing -PassThru
        $expected = $resp.Headers.'Content-Length'
        $actual = (Get-Item -LiteralPath $part).Length
        if ($expected -and [long]$expected -ne $actual) {
            throw "size mismatch: expected $expected got $actual"
        }
        if (Test-Path $zip) { Remove-Item $zip -Force }
        Move-Item -LiteralPath $part -Destination $zip
        $downloaded = $true
        break
    } catch {
        Write-Host "[download-ort-cuda] download failed: $_"
        if (Test-Path $part) { Remove-Item $part -Force }
    }
}
if (-not $downloaded) { throw "all mirrors failed" }

Write-Host "[download-ort-cuda] extracting..."
Expand-Archive -LiteralPath $zip -DestinationPath $ortDir -Force
Remove-Item -LiteralPath $zip -Force
Write-Host "[download-ort-cuda] done: $dest"
