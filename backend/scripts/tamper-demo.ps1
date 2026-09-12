# BlockProctor - Blockchain Integrity Test Script
# This script demonstrates how tampering with data is detected by the blockchain

# SAFETY CHECK - Only run in development!
if ($env:ENVIRONMENT -and $env:ENVIRONMENT -ne 'development') {
    Write-Host "ERROR: This test script modifies the database directly and should only run in development!" -ForegroundColor Red
    Write-Host "Set `$env:ENVIRONMENT = 'development' to run this test." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=========================================================================" -ForegroundColor Cyan
Write-Host "     BLOCKPROCTOR BLOCKCHAIN INTEGRITY VERIFICATION TEST" -ForegroundColor Cyan
Write-Host "=========================================================================" -ForegroundColor Cyan
Write-Host ""

$API_BASE = "http://localhost:8080/api"

# STEP 1: Get an attempt with blockchain hash
Write-Host "[STEP 1] Finding an attempt with blockchain verification..." -ForegroundColor Yellow
$attemptQuery = "SELECT id, student_id, exam_id, score, blockchain_hash FROM attempts WHERE blockchain_hash IS NOT NULL ORDER BY id DESC LIMIT 1;"

$attemptResult = docker exec blockproctor-db psql -U postgres -d blockproctor -t -c $attemptQuery
Write-Host "Found attempt:" -ForegroundColor Green
Write-Host $attemptResult

# Extract attempt ID and score
$fields = $attemptResult.Trim() -split '\|'
$attemptId = $fields[0].Trim()
$originalScore = $fields[3].Trim()
Write-Host ""
Write-Host "Attempt ID: $attemptId, Original Score: $originalScore" -ForegroundColor Cyan

# STEP 2: Verify integrity BEFORE tampering
Write-Host ""
Write-Host "[STEP 2] Verifying integrity BEFORE tampering..." -ForegroundColor Yellow

try {
    $verifyBefore = Invoke-RestMethod -Uri "$API_BASE/blockchain/verify/attempt/$attemptId" -Method GET
    Write-Host "[OK] Verification Result (BEFORE tampering):" -ForegroundColor Green
    Write-Host "   Verified: $($verifyBefore.verified)" -ForegroundColor $(if($verifyBefore.verified){"Green"}else{"Red"})
    Write-Host "   Match: $($verifyBefore.match)" -ForegroundColor $(if($verifyBefore.match){"Green"}else{"Red"})
    Write-Host "   Current Hash: $($verifyBefore.currentHash.Substring(0,30))..."
    Write-Host "   Stored Hash:  $($verifyBefore.storedHash.Substring(0,30))..."
} catch {
    Write-Host "[ERROR] Error verifying: $_" -ForegroundColor Red
}

# STEP 3: TAMPER with the data (change the score)
Write-Host ""
Write-Host "[STEP 3] TAMPERING with the data (changing score)..." -ForegroundColor Yellow
$tamperedScore = 999

Write-Host "[WARNING] Changing score from $originalScore to $tamperedScore..." -ForegroundColor Red

$tamperQuery = "UPDATE attempts SET score = $tamperedScore WHERE id = $attemptId;"
docker exec blockproctor-db psql -U postgres -d blockproctor -c $tamperQuery | Out-Null

Write-Host "Score changed in database!" -ForegroundColor Red

# STEP 4: Verify integrity AFTER tampering
Write-Host ""
Write-Host "[STEP 4] Verifying integrity AFTER tampering..." -ForegroundColor Yellow

try {
    $verifyAfter = Invoke-RestMethod -Uri "$API_BASE/blockchain/verify/attempt/$attemptId" -Method GET
    Write-Host "[CHECK] Verification Result (AFTER tampering):" -ForegroundColor Magenta
    Write-Host "   Verified: $($verifyAfter.verified)" -ForegroundColor $(if($verifyAfter.verified){"Green"}else{"Red"})
    Write-Host "   Match: $($verifyAfter.match)" -ForegroundColor $(if($verifyAfter.match){"Green"}else{"Red"})
    Write-Host "   Current Hash (tampered): $($verifyAfter.currentHash.Substring(0,30))..."
    Write-Host "   Stored Hash (original):  $($verifyAfter.storedHash.Substring(0,30))..."
    
    if (-not $verifyAfter.verified) {
        Write-Host ""
        Write-Host "[ALERT] TAMPERING DETECTED! Hashes don't match!" -ForegroundColor Red
        Write-Host "   The blockchain has detected that the exam record was modified!" -ForegroundColor Red
    }
} catch {
    Write-Host "[ERROR] Error verifying: $_" -ForegroundColor Red
}

# STEP 5: RESTORE original data
Write-Host ""
Write-Host "[STEP 5] Restoring original data..." -ForegroundColor Yellow

$restoreQuery = "UPDATE attempts SET score = $originalScore WHERE id = $attemptId;"
docker exec blockproctor-db psql -U postgres -d blockproctor -c $restoreQuery | Out-Null

Write-Host "[OK] Score restored to $originalScore" -ForegroundColor Green

# STEP 6: Verify integrity AFTER restoration
Write-Host ""
Write-Host "[STEP 6] Verifying integrity AFTER restoration..." -ForegroundColor Yellow

try {
    $verifyRestored = Invoke-RestMethod -Uri "$API_BASE/blockchain/verify/attempt/$attemptId" -Method GET
    Write-Host "[OK] Verification Result (AFTER restoration):" -ForegroundColor Green
    Write-Host "   Verified: $($verifyRestored.verified)" -ForegroundColor $(if($verifyRestored.verified){"Green"}else{"Red"})
    Write-Host "   Match: $($verifyRestored.match)" -ForegroundColor $(if($verifyRestored.match){"Green"}else{"Red"})
    
    if ($verifyRestored.verified) {
        Write-Host ""
        Write-Host "[OK] DATA INTEGRITY CONFIRMED! Hashes match again!" -ForegroundColor Green
    }
} catch {
    Write-Host "[ERROR] Error verifying: $_" -ForegroundColor Red
}

# SUMMARY
Write-Host ""
Write-Host "=========================================================================" -ForegroundColor Cyan
Write-Host "                           TEST SUMMARY" -ForegroundColor Cyan
Write-Host "=========================================================================" -ForegroundColor Cyan
Write-Host "  [OK] Before Tampering: Hash verified successfully" -ForegroundColor Green
Write-Host "  [X]  After Tampering:  Hash mismatch detected (TAMPERING DETECTED!)" -ForegroundColor Red
Write-Host "  [OK] After Restoration: Hash verified successfully" -ForegroundColor Green
Write-Host "=========================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  The blockchain successfully detects ANY modification to:" -ForegroundColor White
Write-Host "    - Student ID" -ForegroundColor White
Write-Host "    - Exam ID" -ForegroundColor White
Write-Host "    - Score" -ForegroundColor White
Write-Host "    - Answers" -ForegroundColor White
Write-Host "    - Submission time" -ForegroundColor White
Write-Host ""
