@echo off
REM backup_db.bat - Dump the blockproctor database to the backups/ folder.
REM
REM Usage:
REM   backup_db.bat              Full backup with timestamp
REM   backup_db.bat --schema-only   Schema-only dump (no data)
REM
REM Restore a backup with:
REM   docker exec -i blockproctor-db pg_restore -U postgres -d blockproctor --clean --if-exists < backups\blockproctor_YYYYMMDD_HHMMSS.dump

setlocal enabledelayedexpansion

set DB_CONTAINER=blockproctor-db
set DB_USER=postgres
set DB_NAME=blockproctor
set BACKUP_DIR=%~dp0..\backups

if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

for /f %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set STAMP=%%I

set DUMP_FILE=%BACKUP_DIR%\blockproctor_%STAMP%.dump
set FLAGS=-U %DB_USER% -d %DB_NAME% -Fc
if "%1"=="--schema-only" set FLAGS=%FLAGS% --schema-only

echo Backing up %DB_NAME% to %DUMP_FILE% ...
docker exec %DB_CONTAINER% pg_dump %FLAGS% > "%DUMP_FILE%"
if errorlevel 1 (
    echo ERROR: Backup failed. Check the container is running - docker compose ps.
    exit /b 1
)

for %%F in ("%DUMP_FILE%") do set SIZE=%%~zF
echo.
echo Backup complete: %DUMP_FILE% (%SIZE% bytes)
echo NOTE: This backup contains all students, classes, exams, attempts and proctor logs.
pause
