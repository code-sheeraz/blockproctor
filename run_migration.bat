@echo off
REM Run migration script in Docker PostgreSQL container (Windows)

docker exec -i blockproctor-db psql -U postgres -d blockproctor < backend\migrations\001_add_enrollment_workflow.sql

echo Migration completed!
pause
