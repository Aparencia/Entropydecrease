# 下载说话人 embedding 模型（wespeaker，v0.7.2 REQ-153 弱化版讲者分离依赖）
#
# @ai-context: sherpa-onnx SpeakerEmbeddingExtractor 使用 wespeaker 转换模型
#              （Apache-2.0 许可）——单文件 ONNX，约 20-70MB。下载到
#              src-tauri/models/speaker-embedding/model.onnx（模型目录不入库，
#              .gitignore 已排除 src-tauri/models/）。
# @ai-context: 模型缺失时讲者分离自动降级（无标注、不报错）——本脚本为可选增强；
#              TLS 拦截环境走 Windows 证书库（与 ffmpeg 下载同模式）。
# @ai-context: 用法：powershell -ExecutionPolicy Bypass -File scripts/download-speaker-model.ps1
#
# 源：sherpa-onnx 模型仓库（wespeaker_zh_cnceleb_resnet34：中文音色 embedding，
#      sherpa-onnx 转换版，约 26.5MB；曾误用不存在的 wespeaker-zh.onnx 导致 404）
$ErrorActionPreference = "Stop"

$targetDir = Join-Path $PSScriptRoot "..\src-tauri\models\speaker-embedding"
$targetDir = [System.IO.Path]::GetFullPath($targetDir)
$targetFile = Join-Path $targetDir "model.onnx"

# 镜像源（多源回退防单点失效；模型经 sherpa-onnx 官方仓库分发）
# 1) GitHub release（k2-fsa/sherpa-onnx 模型清单中的 wespeaker_zh_cnceleb_resnet34 包）
# 2) HuggingFace 镜像（csukuangfj/speaker-embedding-models 仓库）
$mirrors = @(
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/wespeaker_zh_cnceleb_resnet34.onnx",
    "https://hf-mirror.com/csukuangfj/speaker-embedding-models/resolve/main/wespeaker_zh_cnceleb_resnet34.onnx"
)

if (Test-Path $targetFile) {
    Write-Host "模型已存在：$targetFile（跳过下载）"
    exit 0
}

Write-Host "下载说话人 embedding 模型（wespeaker-zh）→ $targetFile"
New-Item -ItemType Directory -Force -Path $targetDir | Out-Null

$ok = $false
foreach ($url in $mirrors) {
    try {
        Write-Host "尝试镜像: $url"
        Invoke-WebRequest -Uri $url -OutFile $targetFile -UseBasicParsing
        $ok = $true
        break
    } catch {
        Write-Host "镜像失败: $($_.Exception.Message)"
    }
}
if (-not $ok) {
    Remove-Item -Force $targetFile -ErrorAction SilentlyContinue
    throw "所有镜像下载失败——请从 sherpa-onnx 模型仓库手动获取 wespeaker 中文模型，放置到 $targetFile"
}

$sizeMb = [math]::Round((Get-Item $targetFile).Length / 1MB, 1)
Write-Host "完成：$targetFile（${sizeMb} MB）"
Write-Host "重启应用后，会话详情页将显示讲者切换标记（访谈/会议场景）"
