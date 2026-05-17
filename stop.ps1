$ProjectDir = $PSScriptRoot

Write-Host ""
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "  Module 4 - Clinical Trial Intelligence Suite"        -ForegroundColor Cyan
Write-Host "  Shutdown"                                             -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host ""

# --- 1. Stop gateway + React dev servers --------------------------------------
Write-Host "[1/2] Stopping gateway and React dev servers..." -ForegroundColor Yellow

$ports = @(
    @{ Name = "Gateway (proxy)"; Port = 3000 },
    @{ Name = "TrialSafety";     Port = 5173 },
    @{ Name = "TrialMatch";      Port = 5174 }
)
foreach ($p in $ports) {
    $conn = Get-NetTCPConnection -LocalPort $p.Port -State Listen -ErrorAction SilentlyContinue
    if ($conn) {
        Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
        Write-Host "      $($p.Name) (port $($p.Port)) stopped." -ForegroundColor Green
    } else {
        Write-Host "      $($p.Name) (port $($p.Port)) was not running." -ForegroundColor DarkGray
    }
}
Write-Host ""

# --- 2. Stop containers -------------------------------------------------------
Write-Host "[2/2] Stopping containers..." -ForegroundColor Yellow
Push-Location $ProjectDir
docker compose down
Pop-Location
Write-Host "      Containers stopped." -ForegroundColor Green

Write-Host ""
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "  Shutdown complete." -ForegroundColor Green
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host ""
