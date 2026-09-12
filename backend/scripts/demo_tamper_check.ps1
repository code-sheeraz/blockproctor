# demo_tamper_check.ps1 - LIVE tamper-detection demo for the presentation.
# Flips one attempt's score in the DB, shows the on-chain verification flip to
# TAMPERED, restores the original score, and shows it return to VERIFIED.
#
# Run:  powershell -ExecutionPolicy Bypass -File backend\scripts\demo_tamper_check.ps1 [-AttemptId 3]

param([int]$AttemptId = 3)

$ErrorActionPreference = 'Stop'

# 1. Login as admin
$login = Invoke-RestMethod -Method Post -Uri 'http://localhost:8080/api/auth/login' `
    -ContentType 'application/json' `
    -Body '{"email":"admin@blockproctor.com","password":"admin123","role":"admin"}'
$hx = @{ Authorization = "Bearer $($login.token)" }

function Get-State($id) {
    (Invoke-RestMethod -Uri "http://localhost:8080/api/blockchain/verify/attempt/$id" -Headers $hx).state
}

$original = docker exec blockproctor-db psql -U postgres -d blockproctor -t -A -c `
    "SELECT score::text FROM attempts WHERE id = $AttemptId"
if (-not $original) { throw "Attempt $AttemptId not found" }
Write-Host "`n=== TAMPER-DETECTION DEMO (attempt $AttemptId, original score = $original) ===" -ForegroundColor Cyan

Write-Host "[1/4] Baseline check..." -NoNewline
Write-Host " state = $(Get-State $AttemptId)" -ForegroundColor Green

# 2. Tamper: bump the score in the database only
docker exec blockproctor-db psql -U postgres -d blockproctor -q -c `
    "UPDATE attempts SET score = score + 7 WHERE id = $AttemptId" | Out-Null
Write-Host "[2/4] Score secretly altered in DB (+7)..."
Start-Sleep -Milliseconds 500
$tampered = Get-State $AttemptId
Write-Host ("      Verification says: {0}" -f $tampered) -ForegroundColor $(if ($tampered -eq 'STALE_ANCHOR' -or $tampered -eq 'TAMPERED') { 'Red' } else { 'Yellow' })

# 3. Restore
docker exec blockproctor-db psql -U postgres -d blockproctor -q -c `
    "UPDATE attempts SET score = $original WHERE id = $AttemptId" | Out-Null
Write-Host "[3/4] Original score restored ($original)..."
Start-Sleep -Milliseconds 500

# 4. Final state
$final = Get-State $AttemptId
Write-Host "[4/4] Verification says: $final" -ForegroundColor $(if ($final -eq 'VERIFIED') { 'Green' } else { 'Red' })
Write-Host "=== Demo complete ===`n" -ForegroundColor Cyan
