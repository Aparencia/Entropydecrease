# @ai-context
# Software copyright registration - source code document generator
# Requirement: front 30 pages + back 30 pages, each page >= 50 lines
# Why: paths derive from $PSScriptRoot so the script works regardless of checkout location.

$root = Split-Path $PSScriptRoot -Parent
$OutputDir = Join-Path $root "docs\softcopy-materials"
if (-not (Test-Path $OutputDir)) { New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null }

$allCode = [System.Collections.ArrayList]::new()

function Add-FileContent($filePath) {
    if (-not (Test-Path $filePath)) { return }
    $relPath = $filePath.Replace("$root\", "").Replace("\", "/")
    [void]$allCode.Add("// ======== File: $relPath ========")
    $content = Get-Content $filePath -Encoding UTF8
    foreach ($line in $content) { [void]$allCode.Add($line) }
    [void]$allCode.Add("")
}

function Add-PatternFiles($pattern) {
    $full = Join-Path $root $pattern
    $found = Get-ChildItem -Path $full -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch '__pycache__|\.pytest_cache|node_modules|\.test\.|tests' }
    if ($found) { foreach ($f in $found) { Add-FileContent $f.FullName } }
}

function Add-DirFiles($dir) {
    $full = Join-Path $root $dir
    $found = Get-ChildItem -Path $full -Recurse -Include *.ts,*.tsx -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch '__pycache__|node_modules|\.test\.' }
    if ($found) { foreach ($f in $found) { Add-FileContent $f.FullName } }
}

# Entry files
Add-FileContent (Join-Path $root "client\src\main.tsx")
Add-FileContent (Join-Path $root "client\src\App.tsx")
Add-FileContent (Join-Path $root "client\src\index.css")
Add-FileContent (Join-Path $root "client\src\routes\index.tsx")

# Types
Add-PatternFiles "client\src\types\*.ts"

# Core libs
Add-PatternFiles "client\src\lib\storage\*.ts"
Add-PatternFiles "client\src\lib\ai\*.ts"
Add-PatternFiles "client\src\lib\sync\*.ts"
Add-PatternFiles "client\src\lib\sync\*.tsx"
Add-PatternFiles "client\src\lib\capture\*.ts"
Add-PatternFiles "client\src\lib\crypto\*.ts"
Add-FileContent (Join-Path $root "client\src\lib\sm2.ts")
Add-FileContent (Join-Path $root "client\src\lib\utils.ts")
Add-FileContent (Join-Path $root "client\src\lib\utils\platform.ts")
Add-FileContent (Join-Path $root "client\src\lib\utils\uuid.ts")
Add-PatternFiles "client\src\lib\auth\*.ts"
Add-PatternFiles "client\src\lib\auth\*.tsx"
Add-PatternFiles "client\src\lib\audio\*.ts"
Add-PatternFiles "client\src\lib\achievements\*.ts"
Add-PatternFiles "client\src\lib\checkin\*.ts"
Add-PatternFiles "client\src\lib\commandPalette\*.ts"
Add-PatternFiles "client\src\lib\contextMenu\*.ts"
Add-PatternFiles "client\src\lib\http\*.ts"
Add-PatternFiles "client\src\lib\mode\*.ts"

# Hooks & Stores
Add-PatternFiles "client\src\hooks\*.ts"
Add-PatternFiles "client\src\stores\*.ts"

# Components
Add-PatternFiles "client\src\components\ui\*.tsx"
Add-PatternFiles "client\src\components\ui\*.ts"
Add-PatternFiles "client\src\components\layout\*.tsx"
Add-PatternFiles "client\src\components\sync\*.tsx"
Add-FileContent (Join-Path $root "client\src\components\PWAInstallPrompt.tsx")

# Pages
Add-PatternFiles "client\src\pages\*.tsx"

# Features
Add-DirFiles "client\src\features\pomodoro"
Add-DirFiles "client\src\features\notes"
Add-DirFiles "client\src\features\flashcards"
Add-DirFiles "client\src\features\feynman"
Add-DirFiles "client\src\features\dashboard"
Add-DirFiles "client\src\features\inspiration"

# Electron
Add-PatternFiles "client\electron\*.ts"

# Service Worker
Add-PatternFiles "client\src\service-worker\*.ts"

# AI Gateway (config.py refactored into config/ package during migration)
Add-FileContent (Join-Path $root "server\ai-gateway\main.py")
Add-PatternFiles "server\ai-gateway\config\*.py"
Add-FileContent (Join-Path $root "server\ai-gateway\errors.py")
Add-PatternFiles "server\ai-gateway\routers\*.py"
Add-PatternFiles "server\ai-gateway\chains\*.py"
Add-PatternFiles "server\ai-gateway\providers\*.py"
Add-PatternFiles "server\ai-gateway\middleware\*.py"
Add-PatternFiles "server\ai-gateway\prompts\*.py"

# Sync Service
Add-PatternFiles "server\sync-service\*.go"
Add-PatternFiles "server\sync-service\handlers\*.go"
Add-PatternFiles "server\sync-service\models\*.go"
Add-PatternFiles "server\sync-service\middleware\*.go"

$totalLines = $allCode.Count
Write-Host "Total code lines: $totalLines"

$linesPerPage = 50
$totalPages = [math]::Ceiling($totalLines / $linesPerPage)
Write-Host "Total pages: $totalPages"

$frontLines = 30 * $linesPerPage
$backStart = $totalLines - $frontLines

$output = [System.Collections.ArrayList]::new()

# Header
[void]$output.Add("Entropydecrease Source Code Document for Software Copyright Registration")
[void]$output.Add("=" * 60)
[void]$output.Add("")

# Front 30 pages
[void]$output.Add("[Front 30 Pages]")
[void]$output.Add("")
for ($page = 0; $page -lt 30; $page++) {
    $start = $page * $linesPerPage
    $end = [math]::Min($start + $linesPerPage - 1, $frontLines - 1)
    [void]$output.Add("--- Page $($page + 1) ---")
    for ($i = $start; $i -le $end; $i++) {
        $lineNum = $i + 1
        [void]$output.Add(("{0,5}  {1}" -f $lineNum, $allCode[$i]))
    }
    [void]$output.Add("")
}

[void]$output.Add("")
[void]$output.Add("[Back 30 Pages]")
[void]$output.Add("")
for ($page = 0; $page -lt 30; $page++) {
    $start = $page * $linesPerPage
    $endIdx = $backStart + $start
    $end = [math]::Min($endIdx + $linesPerPage - 1, $totalLines - 1)
    [void]$output.Add("--- Page $($totalPages - 29 + $page) ---")
    for ($i = $endIdx; $i -le $end; $i++) {
        $lineNum = $i + 1
        [void]$output.Add(("{0,5}  {1}" -f $lineNum, $allCode[$i]))
    }
    [void]$output.Add("")
}

$outputFile = Join-Path $OutputDir "source-code.txt"
[System.IO.File]::WriteAllLines($outputFile, $output.ToArray(), [System.Text.Encoding]::UTF8)
Write-Host "Source code document generated: $outputFile"
Write-Host "Front 30 pages: lines 1-$frontLines"
Write-Host "Back 30 pages: lines $($backStart + 1)-$totalLines"
