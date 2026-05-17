$ProjectDir = $PSScriptRoot

# Refresh PATH so npm/node are available in this session
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

Write-Host ""
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "  Clinical Trial Intelligence Suite"                  -ForegroundColor Cyan
Write-Host "  Startup"                                             -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host ""

# --- 1. Docker Desktop --------------------------------------------------------
$dockerProcess = Get-Process "Docker Desktop" -ErrorAction SilentlyContinue
if (-not $dockerProcess) {
    Write-Host "[1/5] Starting Docker Desktop..." -ForegroundColor Yellow
    $dockerExe = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    if (-not (Test-Path $dockerExe)) {
        Write-Host "      Docker Desktop not found at: $dockerExe" -ForegroundColor Red
        Write-Host "      Start Docker Desktop manually then re-run." -ForegroundColor Red
        exit 1
    }
    Start-Process $dockerExe
} else {
    Write-Host "[1/5] Docker Desktop already running." -ForegroundColor Green
}

Write-Host "      Waiting for Docker daemon..." -ForegroundColor DarkGray
$timeout = 90
$elapsed = 0
while ($elapsed -lt $timeout) {
    docker info 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Seconds 3
    $elapsed += 3
    Write-Host "      ... $elapsed / ${timeout}s" -ForegroundColor DarkGray
}
if ($LASTEXITCODE -ne 0) {
    Write-Host "      Docker daemon did not respond in ${timeout}s. Exiting." -ForegroundColor Red
    exit 1
}
Write-Host "      Docker daemon ready." -ForegroundColor Green
Write-Host ""

# --- 2. Start containers ------------------------------------------------------
Write-Host "[2/5] Starting containers (EHRbase :8084 + PostgreSQL :5435)..." -ForegroundColor Yellow
Push-Location $ProjectDir
docker compose up -d
$composeExit = $LASTEXITCODE
Pop-Location
if ($composeExit -ne 0) {
    Write-Host "      docker compose up failed." -ForegroundColor Red
    exit 1
}
Write-Host "      Containers started." -ForegroundColor Green
Write-Host ""

# --- 3. Wait for EHRbase ------------------------------------------------------
Write-Host "[3/5] Waiting for EHRbase on :8084 (up to 90s)..." -ForegroundColor Yellow
$timeout = 90
$elapsed = 0
$ready = $false
while ($elapsed -lt $timeout) {
    Start-Sleep -Seconds 3
    $elapsed += 3
    try {
        $res = Invoke-WebRequest -Uri "http://localhost:8084/ehrbase/rest/status" -TimeoutSec 3 -ErrorAction Stop -UseBasicParsing
        if ($res.StatusCode -eq 200) { $ready = $true; break }
    } catch { }
    Write-Host "      ... $elapsed / ${timeout}s" -ForegroundColor DarkGray
}
if ($ready) {
    Write-Host "      EHRbase is ready." -ForegroundColor Green
} else {
    Write-Host "      EHRbase did not respond in ${timeout}s." -ForegroundColor Red
    Write-Host "      Check logs:  docker compose logs ehrbase" -ForegroundColor DarkGray
}
Write-Host ""

# --- 4. React dev servers -----------------------------------------------------
Write-Host "[4/5] Starting React dev servers..." -ForegroundColor Yellow

$pathRefresh = '$env:Path = [System.Environment]::GetEnvironmentVariable(''Path'',''Machine'') + '';'' + [System.Environment]::GetEnvironmentVariable(''Path'',''User'')'

$apps = @(
    @{ Name = "TrialSafety"; Dir = "frontend-trialsafety"; Port = 5173 },
    @{ Name = "TrialMatch";  Dir = "frontend-trialmatch";  Port = 5174 }
)
foreach ($app in $apps) {
    $appDir  = Join-Path $ProjectDir $app.Dir
    $pkgJson = Join-Path $appDir "package.json"
    if (Test-Path $pkgJson) {
        $cmd = "$pathRefresh; Set-Location '$appDir'; npm run dev"
        Start-Process powershell -ArgumentList "-NoExit", "-Command", $cmd -WindowStyle Normal
        Write-Host "      $($app.Name) starting on http://localhost:$($app.Port)" -ForegroundColor Green
    } else {
        Write-Host "      $($app.Name): not found at $appDir - skipping." -ForegroundColor DarkGray
    }
}
Write-Host ""

# --- 5. Gateway proxy ---------------------------------------------------------
Write-Host "[5/5] Starting gateway proxy on :3000..." -ForegroundColor Yellow
$proxyDir = Join-Path $ProjectDir "proxy"
$proxyModules = Join-Path $proxyDir "node_modules"

if (-not (Test-Path $proxyModules)) {
    Write-Host "      Installing proxy dependencies..." -ForegroundColor DarkGray
    Push-Location $proxyDir
    npm install 2>$null
    Pop-Location
}

$cmd = "$pathRefresh; Set-Location '$proxyDir'; node server.js"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $cmd -WindowStyle Normal
Write-Host "      Gateway starting on http://localhost:3000" -ForegroundColor Green
Write-Host ""

# --- Summary ------------------------------------------------------------------
Start-Sleep -Seconds 2
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "  All services started." -ForegroundColor Green
Write-Host "-----------------------------------------------------" -ForegroundColor DarkGray
Write-Host "  Suite (gateway):  http://localhost:3000           " -ForegroundColor White
Write-Host "    /              TrialSafety                      " -ForegroundColor DarkGray
Write-Host "    /match/        TrialMatch                       " -ForegroundColor DarkGray
Write-Host "-----------------------------------------------------" -ForegroundColor DarkGray
Write-Host "  EHRbase:          http://localhost:8084/ehrbase/swagger-ui/" -ForegroundColor DarkGray
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host ""
