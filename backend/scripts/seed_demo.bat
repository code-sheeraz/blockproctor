@echo off
REM seed_demo.bat - Load optional demo data (student, class, exam) into the database.
REM Safe to re-run (INSERT ... ON CONFLICT DO NOTHING).
docker exec -i blockproctor-db psql -U postgres -d blockproctor < "%~dp0seed_demo.sql"
if errorlevel 1 (
    echo ERROR: Demo seed failed. Check the container is running.
    pause
    exit /b 1
)
echo Demo data loaded. Login: demo.student@blockproctor.com / student123
pause
