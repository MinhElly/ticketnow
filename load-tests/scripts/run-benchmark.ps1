<#
.SYNOPSIS
  Chạy S1-S4 cho một chiến lược khóa và lưu summary JSON vào load-tests/results/.

.NOTES
  seat-inventory phải đang chạy với đúng chiến lược, ví dụ PowerShell:
    $env:SEAT_LOCK_STRATEGY = "pessimistic"
    mvn -f seat-inventory/pom.xml spring-boot:run
  Sau khi đổi strategy phải restart service (property không @RefreshScope).

.EXAMPLE
  $env:TOKEN = '<customer access token>'
  $env:DB_ROOT_PASSWORD = '<root password>'
  .\load-tests\scripts\run-benchmark.ps1 -Strategy redis -Seed
#>
param(
    [ValidateSet("pessimistic", "optimistic", "redis")]
    [string]$Strategy = "redis",
    [string]$EventId = "bench-event",
    [string]$BaseUrl = "http://localhost:8083",
    [string]$Token = $env:TOKEN,
    [string]$DbPassword = $env:DB_ROOT_PASSWORD,
    [string]$K6 = "k6",
    [switch]$Seed,
    [switch]$SkipReset
)

$ErrorActionPreference = "Stop"
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$loadTestRoot = Resolve-Path (Join-Path $scriptRoot "..")
$resultsDir = Join-Path $loadTestRoot "results"

if (-not (Get-Command $K6 -ErrorAction SilentlyContinue)) {
    throw "Không tìm thấy k6. Cài k6 (https://k6.io/docs/get-started/installation/) hoặc truyền -K6 <đường dẫn>."
}
if ([string]::IsNullOrWhiteSpace($Token)) {
    throw "Thiếu TOKEN. Lấy access token customer/organizer từ Postman (PKCE) rồi đặt `$env:TOKEN."
}

New-Item -ItemType Directory -Force -Path $resultsDir | Out-Null

if ($Seed) {
    & (Join-Path $scriptRoot "seed-seats.ps1") -BaseUrl $BaseUrl -EventId $EventId -Seats 20000 -Token $Token
}

$scenarios = @(
    @{ Name = "s1"; Script = "scenarios/s1-contention.js"; Vus = 1000;  Seats = 100;  Label = "1k VU / 100 ghe" },
    @{ Name = "s2"; Script = "scenarios/s2-scale.js";      Vus = 20000; Seats = 2000; Label = "20k VU / 2k ghe" },
    @{ Name = "s3"; Script = "scenarios/s3-hot-seat.js";   Vus = 1000;  Seats = 1;    Label = "hot seat" },
    @{ Name = "s4"; Script = "scenarios/s4-distributed.js";Vus = 1000;  Seats = 1000; Label = "phan tan" }
)

$env:BASE_URL = $BaseUrl
$env:EVENT_ID = $EventId
$env:TOKEN = $Token
$env:TTL_SECONDS = "600"

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"

Write-Host "=== Strategy: $Strategy | Event: $EventId | k6: $K6 ===" -ForegroundColor Cyan
Write-Host "Nhắc lại: seat-inventory phải đang chạy với SEAT_LOCK_STRATEGY=$Strategy" -ForegroundColor Yellow

foreach ($scenario in $scenarios) {
    if (-not $SkipReset) {
        & (Join-Path $scriptRoot "reset-seats.ps1") -EventId $EventId -DbPassword $DbPassword
    }

    $env:VUS = [string]$scenario.Vus
    $env:SEATS = [string]$scenario.Seats
    $output = Join-Path $resultsDir ("{0}-{1}-{2}.json" -f $Strategy, $scenario.Name, $stamp)
    $scriptPath = Join-Path $loadTestRoot $scenario.Script

    Write-Host ""
    Write-Host ">>> $($scenario.Name.ToUpper()) - $($scenario.Label) -> $output" -ForegroundColor Green
    & $K6 run --summary-export $output --tag "strategy=$Strategy" --tag "scenario=$($scenario.Name)" $scriptPath
    if ($LASTEXITCODE -ne 0) {
        throw "k6 thất bại ở $($scenario.Name) (exit $LASTEXITCODE)."
    }
}

Write-Host ""
Write-Host "Xong. Summary JSON nằm trong $resultsDir" -ForegroundColor Cyan
Write-Host "Kiểm tra bán trùng: load-tests/sql/check-duplicates.sql" -ForegroundColor Cyan
