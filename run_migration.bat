@echo off
REM Run all database migrations via the migration runner
docker exec -i blockproctor-backend node migrate.js
if %errorlevel% neq 0 (
    echo Migration failed! Check the error above.
    pause
    exit /b 1
)
echo All migrations completed successfully!
pause
