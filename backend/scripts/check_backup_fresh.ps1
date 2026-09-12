param([string]$BackupDir, [int]$MaxAgeHours = 1)

$latest = Get-ChildItem (Join-Path $BackupDir 'blockproctor_*.dump') -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1

if (-not $latest) { Write-Output 'missing'; exit }
if ($latest.LastWriteTime -lt (Get-Date).AddHours(-$MaxAgeHours)) { Write-Output 'stale'; exit }
Write-Output 'ok'
