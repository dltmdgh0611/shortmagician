# build-portable.ps1
# ────────────────────────────────────────────────────────────────────────────────
# Builds a portable distribution of ShortMagician.
#
# Output:
#   release/shortmagician/          <- Portable folder (exe + runtime)
#   release/shortmagician.zip       <- Ready-to-distribute archive
#
# Secrets (.env, serviceAccountKey.json) are encrypted and embedded
# inside backend.exe — no config files in the distribution folder.
#
# Prerequisites:
#   - Node.js 18+, Yarn
#   - Rust toolchain (rustc, cargo)
#   - Python 3.10+ with PyInstaller (`pip install pyinstaller`)
#   - Backend dependencies installed (`cd backend && pip install -r requirements.txt`)
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/build-portable.ps1
# ────────────────────────────────────────────────────────────────────────────────

$ErrorActionPreference = "Stop"

# -- Paths --
$ProjectRoot  = Split-Path -Parent $PSScriptRoot
$BackendDir   = Join-Path $ProjectRoot "backend"
$TauriDir     = Join-Path $ProjectRoot "src-tauri"
$ScriptsDir   = $PSScriptRoot
$OutputDir    = Join-Path $ProjectRoot "release\shortmagician"
$ZipPath      = Join-Path $ProjectRoot "release\shortmagician.zip"

Write-Host ""
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "       ShortMagician - Portable Build                 " -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host ""

# -- 0. Clean previous output --
if (Test-Path $OutputDir) {
    Write-Host "[0/6] Cleaning previous build..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $OutputDir
}
if (Test-Path $ZipPath) {
    Remove-Item -Force $ZipPath
}
New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

# -- 1. Build Frontend (Vite) --
Write-Host ""
Write-Host "[1/6] Building frontend (Vite)..." -ForegroundColor Green
Push-Location $ProjectRoot
try {
    yarn build
    if ($LASTEXITCODE -ne 0) { throw "Frontend build failed" }
} finally {
    Pop-Location
}
Write-Host "  OK  Frontend -> dist/" -ForegroundColor DarkGreen

# -- 2. Embed secrets into backend source --
Write-Host ""
Write-Host "[2/6] Embedding secrets into backend..." -ForegroundColor Green
py (Join-Path $ScriptsDir "embed_secrets.py")
if ($LASTEXITCODE -ne 0) { throw "Secret embedding failed" }

# -- 3. Build Backend (PyInstaller --onefile) --
Write-Host ""
Write-Host "[3/6] Building backend (PyInstaller)..." -ForegroundColor Green
Push-Location $BackendDir
try {
    # Clean previous PyInstaller output
    if (Test-Path "dist")  { Remove-Item -Recurse -Force "dist" }
    if (Test-Path "build") { Remove-Item -Recurse -Force "build" }

    py -m PyInstaller --onefile --name backend `
        --paths . `
        --hidden-import uvicorn.logging `
        --hidden-import uvicorn.loops.auto `
        --hidden-import uvicorn.protocols.http.auto `
        --hidden-import uvicorn.protocols.http.h11_impl `
        --hidden-import uvicorn.protocols.websockets.auto `
        --hidden-import uvicorn.lifespan.on `
        --hidden-import uvicorn.lifespan.off `
        --hidden-import multipart `
        --hidden-import multipart.multipart `
        --hidden-import google.auth `
        --hidden-import google.auth.transport `
        --hidden-import google.auth.transport.requests `
        --hidden-import google.auth.transport.grpc `
        --hidden-import google.cloud.texttospeech_v1 `
        --hidden-import grpc `
        --hidden-import grpc._cython `
        --hidden-import grpc._cython.cygrpc `
        --collect-all firebase_admin `
        --collect-all google.cloud.texttospeech `
        --collect-all google.api_core `
        --collect-all openai `
        --exclude-module numpy `
        --exclude-module pandas `
        --exclude-module scipy `
        --exclude-module numba `
        --exclude-module sqlalchemy `
        --exclude-module openpyxl `
        --exclude-module tkinter `
        --exclude-module matplotlib `
        --exclude-module PIL `
        --exclude-module test `
        --exclude-module unittest `
        --exclude-module pytest `
        --noconfirm `
        backend_entry.py

    if ($LASTEXITCODE -ne 0) { throw "PyInstaller build failed" }

    if (-not (Test-Path "dist\backend.exe")) {
        throw "backend.exe not found after PyInstaller build"
    }
} finally {
    Pop-Location
}
Write-Host "  OK  Backend -> backend/dist/backend.exe" -ForegroundColor DarkGreen

# -- 4. Build Tauri (release) --
Write-Host ""
Write-Host "[4/6] Building Tauri (release)..." -ForegroundColor Green
Push-Location $TauriDir
try {
    cargo build --release
    if ($LASTEXITCODE -ne 0) { throw "Tauri (cargo) build failed" }
} finally {
    Pop-Location
}
$TauriExe = Join-Path $TauriDir "target\release\shortmagician.exe"
if (-not (Test-Path $TauriExe)) {
    throw "shortmagician.exe not found at $TauriExe"
}
Write-Host "  OK  Tauri -> src-tauri/target/release/shortmagician.exe" -ForegroundColor DarkGreen

# -- 5. Assemble Portable Folder --
Write-Host ""
Write-Host "[5/6] Assembling portable folder..." -ForegroundColor Green

# Main Tauri exe
Copy-Item $TauriExe $OutputDir
Write-Host "  +  shortmagician.exe" -ForegroundColor DarkGray

# Backend exe (secrets embedded inside — no .env or key files)
Copy-Item (Join-Path $BackendDir "dist\backend.exe") $OutputDir
Write-Host "  +  backend.exe (secrets embedded)" -ForegroundColor DarkGray

# Sidecar binaries (in binaries/ subdirectory)
$BinDir = Join-Path $OutputDir "binaries"
New-Item -ItemType Directory -Path $BinDir -Force | Out-Null
Copy-Item (Join-Path $TauriDir "binaries\ffmpeg-x86_64-pc-windows-msvc.exe")  $BinDir
Copy-Item (Join-Path $TauriDir "binaries\ffprobe-x86_64-pc-windows-msvc.exe") $BinDir
Copy-Item (Join-Path $TauriDir "binaries\yt-dlp-x86_64-pc-windows-msvc.exe")  $BinDir
Write-Host "  +  binaries/ (ffmpeg, ffprobe, yt-dlp)" -ForegroundColor DarkGray

# Resource fonts
$FontsDir = Join-Path $OutputDir "resources\fonts"
New-Item -ItemType Directory -Path $FontsDir -Force | Out-Null
Copy-Item (Join-Path $TauriDir "resources\fonts\*.otf") $FontsDir
Write-Host "  +  resources/fonts/ (NotoSansCJK)" -ForegroundColor DarkGray

# -- 6. Create ZIP --
Write-Host ""
Write-Host "[6/6] Creating ZIP archive..." -ForegroundColor Green
Compress-Archive -Path $OutputDir -DestinationPath $ZipPath -Force
Write-Host "  OK  $ZipPath" -ForegroundColor DarkGreen

# -- Cleanup generated _secrets.py (don't leave in source tree) --
$SecretsFile = Join-Path $BackendDir "app\_secrets.py"
if (Test-Path $SecretsFile) {
    Remove-Item $SecretsFile -Force
    Write-Host "  OK  Cleaned _secrets.py from source tree" -ForegroundColor DarkGray
}

# -- Summary --
Write-Host ""
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "  Build Complete!                                      " -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Portable folder : $OutputDir" -ForegroundColor White
Write-Host "  ZIP archive     : $ZipPath" -ForegroundColor White
Write-Host ""
Write-Host "  Structure:" -ForegroundColor Gray
Write-Host "    shortmagician/" -ForegroundColor Gray
Write-Host "    +-- shortmagician.exe     (Tauri desktop app)" -ForegroundColor Gray
Write-Host "    +-- backend.exe           (FastAPI, secrets embedded)" -ForegroundColor Gray
Write-Host "    +-- backend.log           (auto-created at runtime)" -ForegroundColor Gray
Write-Host "    +-- binaries/" -ForegroundColor Gray
Write-Host "    |   +-- ffmpeg-*.exe" -ForegroundColor Gray
Write-Host "    |   +-- ffprobe-*.exe" -ForegroundColor Gray
Write-Host "    |   +-- yt-dlp-*.exe" -ForegroundColor Gray
Write-Host "    +-- resources/" -ForegroundColor Gray
Write-Host "        +-- fonts/" -ForegroundColor Gray
Write-Host "            +-- NotoSansCJK*.otf" -ForegroundColor Gray
Write-Host ""
Write-Host "  No .env or serviceAccountKey.json in the folder!" -ForegroundColor Yellow
Write-Host "  All secrets are encrypted inside backend.exe." -ForegroundColor Yellow
Write-Host ""
Write-Host "  Target requirements:" -ForegroundColor Gray
Write-Host "    - Windows 10 (1809+) or Windows 11" -ForegroundColor Gray
Write-Host "    - WebView2 Runtime (pre-installed on Win10 21H2+/Win11)" -ForegroundColor Gray
Write-Host ""
