<#
.SYNOPSIS
  Seed ghế cho một event benchmark qua REST API (chia batch <= 1000 ghế).

.EXAMPLE
  $env:TOKEN = '<organizer access token>'
  .\load-tests\scripts\seed-seats.ps1 -EventId bench-event -Seats 20000
#>
param(
    [string]$BaseUrl = "http://localhost:8083",
    [string]$EventId = "bench-event",
    [int]$Seats = 20000,
    [int]$BatchSize = 1000,
    [string]$SeatPrefix = "S",
    [int]$SeatPadding = 5,
    [string]$TierId = "bench-tier",
    [string]$Token = $env:TOKEN
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Token)) {
    throw "Thiếu token organizer. Đặt `$env:TOKEN hoặc truyền -Token."
}
if ($Seats -le 0) { throw "Seats phải > 0." }
if ($BatchSize -le 0 -or $BatchSize -gt 1000) { throw "BatchSize phải trong khoảng 1..1000." }
if ($EventId -notmatch '^[A-Za-z0-9_-]+$') { throw "EventId chỉ được chứa chữ, số, _ và -." }

$BaseUrl = $BaseUrl.TrimEnd('/')
$headers = @{ Authorization = "Bearer $Token" }
$created = 0

for ($start = 1; $start -le $Seats; $start += $BatchSize) {
    $end = [Math]::Min($start + $BatchSize - 1, $Seats)
    $specs = [System.Collections.Generic.List[object]]::new()

    for ($i = $start; $i -le $end; $i++) {
        $seatId = "{0}-{1}" -f $SeatPrefix, $i.ToString().PadLeft($SeatPadding, '0')
        $specs.Add(@{ seatId = $seatId; tierId = $TierId })
    }

    $body = @{ seats = $specs } | ConvertTo-Json -Depth 5 -Compress
    $uri = "$BaseUrl/api/v1/events/$EventId/seats/initialize"

    Invoke-RestMethod -Method Post -Uri $uri -Headers $headers `
        -ContentType "application/json" -Body $body | Out-Null

    $created += ($end - $start + 1)
    Write-Host ("Seeded {0,6} / {1} seats (batch {2}..{3})" -f $created, $Seats, $start, $end)
}

Write-Host "Hoàn tất: event '$EventId' có $Seats ghế (idempotent theo seat_id)."
