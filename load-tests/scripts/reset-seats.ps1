<#
.SYNOPSIS
  Reset trạng thái ghế của một event về AVAILABLE và xóa Redis key tương ứng.
  Dùng giữa các lần benchmark để mỗi chiến lược chạy trên cùng dữ liệu sạch.

.EXAMPLE
  $env:DB_ROOT_PASSWORD = '<root password>'
  .\load-tests\scripts\reset-seats.ps1 -EventId bench-event
#>
param(
    [string]$EventId = "bench-event",
    [string]$DbContainer = "ticketnow-mariadb",
    [string]$RedisContainer = "ticketnow-redis",
    [string]$DbName = "ticketnow_inventory",
    [string]$DbPassword = $env:DB_ROOT_PASSWORD
)

$ErrorActionPreference = "Stop"

if ($EventId -notmatch '^[A-Za-z0-9_-]+$') { throw "EventId chỉ được chứa chữ, số, _ và -." }
if ([string]::IsNullOrWhiteSpace($DbPassword)) {
    throw "Thiếu DB root password. Đặt `$env:DB_ROOT_PASSWORD hoặc truyền -DbPassword."
}
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Không tìm thấy docker trên PATH."
}

$sql = "UPDATE seats SET status='AVAILABLE', held_by_booking=NULL, held_until=NULL, version=version+1 WHERE event_id='$EventId';"
docker exec -e "MYSQL_PWD=$DbPassword" $DbContainer mariadb -uroot $DbName -e $sql
if ($LASTEXITCODE -ne 0) { throw "Reset MariaDB thất bại (exit $LASTEXITCODE)." }

$redisPattern = "seat:{$EventId}:*"
docker exec $RedisContainer sh -c "redis-cli --scan --pattern '$redisPattern' | xargs -r redis-cli DEL"
if ($LASTEXITCODE -ne 0) { throw "Reset Redis thất bại (exit $LASTEXITCODE)." }

Write-Host "Đã reset event '$EventId': DB -> AVAILABLE, Redis keys '$redisPattern' đã xóa."
