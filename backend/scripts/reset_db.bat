@echo off
REM reset_db.bat - FULL database + blockchain reset (DESTROYS ALL DATA).
REM
REM This script refuses to run unless a fresh backup exists in ..\backups\,
REM or you pass --force (only recommended for throwaway demo environments).
REM
REM Usage:
REM   backup_db.bat             First: create a backup
REM   reset_db.bat              Reset DB + blockchain to a clean state
REM   reset_db.bat --force      Skip the backup check

setlocal enabledelayedexpansion

set BACKUP_DIR=%~dp0..\backups
set FRESH_HOURS=1

if "%~1"=="--force" goto reset

REM Reject backups older than FRESH_HOURS hours
for /f %%I in ('powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0check_backup_fresh.ps1" "%BACKUP_DIR%" %FRESH_HOURS%') do set CHECK=%%I
if "%CHECK%"=="stale" (
    echo ERROR: The newest backup in %BACKUP_DIR% is older than %FRESH_HOURS% hours.
    echo Run backup_db.bat again to create a fresh backup before resetting.
    exit /b 1
)
if "%CHECK%"=="missing" (
    echo ERROR: No backup found in %BACKUP_DIR%.
    echo Run backup_db.bat first, then re-run reset_db.bat.
    echo Or pass --force if you really want to destroy all data.
    exit /b 1
)

set /p CONFIRM=WARNING: This DESTROYS all data in the database and blockchain. Type RESET to continue: 
if not "%CONFIRM%"=="RESET" (
    echo Aborted.
    exit /b 1
)

:reset
echo Stopping containers and deleting ALL volumes (database + blockchain data)...
docker compose -f "%~dp0..\docker-compose.yml" down -v
if errorlevel 1 (
    echo ERROR: Failed to bring the stack down. Check Docker is running.
    exit /b 1
)

echo Rebuilding and starting a clean stack...
docker compose -f "%~dp0..\docker-compose.yml" up -d --build
if errorlevel 1 (
    echo ERROR: Failed to bring the stack up. See the error above.
    exit /b 1
)

echo.
echo Reset complete. The database is fresh (migrations will apply on first startup).
echo To restore your data:  docker exec -i blockproctor-db pg_restore -U postgres -d blockproctor --clean --if-exists < backups\blockproctor_*.dump
pause