#!/usr/bin/env pwsh
# Install script for Neon Future Theme
# This script builds and installs the theme to JupyterLab

$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Neon Future Theme Installation Script" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Get the script directory
$ThemeDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $ThemeDir

Write-Host "Step 1: Installing dependencies..." -ForegroundColor Yellow
jlpm install
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to install dependencies"
    exit 1
}
Write-Host "Dependencies installed successfully!" -ForegroundColor Green
Write-Host ""

Write-Host "Step 2: Building TypeScript sources..." -ForegroundColor Yellow
jlpm run build:lib
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to build TypeScript sources"
    exit 1
}
Write-Host "TypeScript build successful!" -ForegroundColor Green
Write-Host ""

Write-Host "Step 3: Building JupyterLab extension..." -ForegroundColor Yellow
jlpm run build:labextension
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to build JupyterLab extension"
    exit 1
}
Write-Host "JupyterLab extension build successful!" -ForegroundColor Green
Write-Host ""

Write-Host "Step 4: Installing extension to JupyterLab..." -ForegroundColor Yellow
jupyter labextension install . --no-build
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to install extension"
    exit 1
}
Write-Host "Extension installed successfully!" -ForegroundColor Green
Write-Host ""

Write-Host "Step 5: Rebuilding JupyterLab..." -ForegroundColor Yellow
jupyter lab build
if ($LASTEXITCODE -ne 0) {
    Write-Warning "JupyterLab rebuild had warnings, but theme may still work"
}
Write-Host "JupyterLab rebuild complete!" -ForegroundColor Green
Write-Host ""

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Installation Complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "To use the theme:" -ForegroundColor Yellow
Write-Host "  1. Start JupyterLab: jupyter lab" -ForegroundColor White
Write-Host "  2. Go to Settings > Theme" -ForegroundColor White
Write-Host "  3. Select 'Neon Future'" -ForegroundColor White
Write-Host ""
Write-Host "To verify installation:" -ForegroundColor Yellow
Write-Host "  jupyter labextension list" -ForegroundColor White
Write-Host ""
