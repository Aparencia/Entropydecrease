# 下载 ffmpeg 静态版到 src-tauri/ffmpeg/（v0.3.0 视频文件导入/内嵌字幕依赖，ADR-008）
#
# @ai-context: 本机存在 TLS 拦截（rustls 报 UnknownIssuer），PowerShell 走 Windows
#              证书库可正常下载——与 sherpa-archive/ort 同模式：手动运行一次，
#              产物不入库（.gitignore 已排除 src-tauri/ffmpeg/）。
# @ai-context: 用法：powershell -ExecutionPolicy Bypass -File scripts/download-ffmpeg.ps1
#              下载后应用运行时自动探测该目录（FfmpegResolver，PATH 之前）。
#
# 镜像源（BtbN 静态构建，多源回退防单点失效）：
#   1) https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip
#   2) https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip
$ErrorActionPreference = "Stop"

$targetDir = Join-Path $PSScriptRoot "..\src-tauri\ffmpeg"
$targetDir = [System.IO.Path]::GetFullPath($targetDir)
$workDir = Join-Path ([System.IO.Path]::GetTempPath()) ("ffmpeg-dl-" + [guid]::NewGuid().ToString("N"))

$mirrors = @(
    "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip",
    "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
)

Write-Host "下载 ffmpeg 静态版 → $targetDir"
New-Item -ItemType Directory -Force -Path $workDir | Out-Null

$zip = Join-Path $workDir "ffmpeg.zip"
$ok = $false
foreach ($url in $mirrors) {
    try {
        Write-Host "尝试镜像: $url"
        Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
        $ok = $true
        break
    } catch {
        Write-Host "镜像失败: $($_.Exception.Message)"
    }
}
if (-not $ok) { throw "所有镜像下载失败，请手动下载 ffmpeg 静态版并解压到 $targetDir（需含 ffmpeg.exe 与 ffprobe.exe）" }

# 解压（zip 内目录结构因源而异，递归查找两个 exe 后拷贝到目标目录）
Expand-Archive -Path $zip -DestinationPath $workDir -Force
New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
$ffmpegExe = Get-ChildItem -Path $workDir -Recurse -Filter "ffmpeg.exe" | Select-Object -First 1
$ffprobeExe = Get-ChildItem -Path $workDir -Recurse -Filter "ffprobe.exe" | Select-Object -First 1
if (-not $ffmpegExe -or -not $ffprobeExe) { throw "压缩包内未找到 ffmpeg.exe/ffprobe.exe" }

Copy-Item $ffmpegExe.FullName (Join-Path $targetDir "ffmpeg.exe") -Force
Copy-Item $ffprobeExe.FullName (Join-Path $targetDir "ffprobe.exe") -Force
Remove-Item -Recurse -Force $workDir

Write-Host "完成：$targetDir\ffmpeg.exe / ffprobe.exe"
Write-Host "验证：& '$targetDir\ffmpeg.exe' -version"
