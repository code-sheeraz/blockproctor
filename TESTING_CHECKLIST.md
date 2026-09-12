# BlockProctor LMS Testing Checklist

Manual end-to-end test script for the BlockProctor system. Work through the
sections in order — later sections depend on state created by earlier ones
(students, classes, exams). The **Data Reset** section explains how to start
over cleanly.

## 0. Environment

| Item | Value |
|------|-------|
| Backend | http://localhost:8080 (health: `GET /health`) |
| Frontend | http://localhost:5173 |
| PostgreSQL | `postgres` / `12345` on port 5432, database `blockproctor` |
| pgAdmin | http://localhost:5051 (`admin@local.dev` / `admin`) |
| Blockchain (Anvil) | http://localhost:8545 (chain id 31337) |
| Admin seed | admin@blockproctor.com / admin123 |
| Instructor seed | instructor@cs.edu / instructor123 |
| Demo student (optional, via seed_demo.bat) | demo.student@blockproctor.com / student123 |

### 0.1 Data Reset (start over cleanly)
> ⚠️ `docker compose down -v` **permanently deletes all data**. Always back up first:
> ```bash
> backend\scripts\backup_db.bat          # dumps DB to backend\backups\
> ```
> Use `backend\scripts\reset_db.bat` instead of a bare `down -v` — it refuses to
> run unless a backup newer than 1 hour exists (or you pass `--force`).
> Restore after a reset with:
> ```bash
> docker exec -i blockproctor-db pg_restore -U postgres -d blockproctor --clean --if-exists < backend\backups\blockproctor_*.dump
> ```

```bash
docker compose down -v     # wipes postgres + blockchain state
docker compose up -d --build
docker exec -it blockproctor-backend node migrate.js   # or run_migration.bat
# optional demo data (student/class/exam) if you don't want an empty app:
backend\scripts\seed_demo.bat
```
- [ ] Backend healthy: `Invoke-RestMethod http://localhost:8080/health` → `{"status":"ok",...}`
- [ ] Migrations report `Applied 14 migration(s)` + bcrypt backfill for 2 accounts
- [ ] `docker exec blockproctor-blockchain cat /shared/artifacts/blockchain-addresses.env`
      contains a single `PROCTOR_CHAIN_ADDRESS=0x...` entry

## 1. System Startup

### 1.1 Docker Compose
```bash
docker compose up --build
```
- [ ] `docker ps` shows: blockproctor-backend (healthy), blockproctor-db (healthy),
      blockproctor-blockchain, blockproctor-pgadmin
- [ ] Backend log: `✅ ProctorChain contract ready at 0x...`
- [ ] Backend log: chain reseed runs without errors on startup

### 1.2 Frontend
```bash
cd frontend && npm run dev
```
- [ ] http://localhost:5173 loads the login page with role selector
- [ ] Demo accounts are listed on the page

## 2. Authentication

- [ ] **Admin login**: role = Admin, admin@blockproctor.com / admin123 → lands on admin dashboard
- [ ] **Instructor login**: role = Instructor, instructor@cs.edu / instructor123 → lands on instructor dashboard
- [ ] **Wrong password** → error message, no redirect
- [ ] **Unknown email** → error message
- [ ] **Rate limiting**: 20+ failed logins within 15 min → `Too many login attempts`

## 3. Student Registration + Enrollment Workflow

1. LoginPage → **Register** tab. Fill: name, student ID, email, password, department, batch.
2. Submit → "pending admin approval" message.
3. Admin: AdminDashboard → Enrollments → approve the new student.
4. Student: login as the new student → redirected to face capture (`/capture-profile/:id`).
5. Capture profile photo (webcam). Face descriptor must be saved (backend log:
   `[ENROLL] Success! Face saved for User ...`).
6. Instructor: InstructorDashboard → Classes → select class → **Add Students** → add the student
   (or bulk import by email list).
7. Student: login again → now sees `enrolled` status and available exams.

- [ ] Student shows `pending_admin` → `pending_face` → `pending_instructor` → `enrolled`
      at each step (AdminDashboard → Enrollments / Face Verifications)
- [ ] Rejected student sees a rejection state, not an exam list
- [ ] Duplicate student ID / email rejected at registration

## 4. Instructor: Classes and Exams

### 4.1 Classes
- [ ] Create class (name, year/semester, instructor)
- [ ] Class appears in instructor dashboard and admin dashboard
- [ ] Students can be added individually and in bulk
- [ ] Students not in the class cannot see the class's exams

### 4.2 Exams
- [ ] Create exam: title, description, duration, questions (MCQ/descriptive), class, time window
- [ ] Save as draft → not visible to students
- [ ] Publish → visible to students in the exam window
- [ ] Edit questions before any attempt; saved properly
- [ ] Randomize questions option honored (check order in student view)

## 5. Student: Taking an Exam (Proctored)

Prerequisite: a published exam, student enrolled, face enrolled.

1. Student login → dashboard → click **Start Exam**.
2. ExamSession page: webcam permission prompt → **Allow**.
3. Proctoring starts (face detection box visible).

### 5.1 Violation Triggers (see ExamProctor CONFIG for thresholds)
- [ ] **Head turn**: look left/right beyond threshold → violation logged, small trust drop
- [ ] **Absence**: leave the frame > critical threshold → absence violation, trust drops harder
- [ ] **Multi-face**: second person enters frame > tolerance → multi-face violation
- [ ] **Identity**: turn away so face cannot match the enrolled descriptor → identity
      verification violations on repeated failures
- [ ] **Low trust**: trust falls below lock threshold → session locked (exam paused)
- [ ] Trust score visible in session UI decreasing with violations

### 5.2 Heartbeat + Auto-submit
- [ ] Heartbeat every ~5–10 s keeps `last_heartbeat` fresh (check DB or audit page)
- [ ] Timer runs down; at 0 the session auto-submits
- [ ] Manual **Submit** ends the session, shows results page

## 6. Admin: Audit + Blockchain Verification

### 6.1 Audit Trails
- [ ] AdminDashboard → Audit: exam sessions listed with timestamps, IP, user agent
- [ ] Attempt edits/deletions recorded in audit tables (audit_attempts / audit_deletion_log)
- [ ] Class enrollment changes recorded in audit_class_enrollments

### 6.2 Blockchain
- [ ] After an attempt is submitted, DB shows `blockchain_hash` / `blockchain_tx` on the attempt
- [ ] AdminDashboard → Blockchain → Verify attempt → `✅ Verified`
- [ ] **Tamper test**: change the attempt's score in the DB
      (`docker exec blockproctor-db psql -U postgres -d blockproctor -c "UPDATE attempts SET score = 1 WHERE id = <id>;"`)
      → Verify again → **UNVERIFIED**
- [ ] Restart blockchain: `docker compose restart blockchain` → wait ~60 s →
      chainReseed re-records any missing hashes; verify again → `✅ Verified`
      (anvil state persisted, addresses re-read via hot-swap)

## 7. Research Data Extraction

With 2+ completed attempts and violations recorded:
- [ ] `/api/research/proctor-metrics` — detection counts, average trust, total violations
- [ ] `/api/research/violation-breakdown?startDate=&endDate=` — violations by type over time
- [ ] `/api/research/detection-accuracy` — detection rates + session analysis
- [ ] `/api/research/blockchain-metrics` — on-chain record counts
- [ ] `/api/research/blockchain-audit` — chain vs DB integrity report
- [ ] `/api/research/verify-integrity` (POST `{attemptId}`) — per-attempt verification
- [ ] `/api/research/export/violations`, `/export/attempts`, `/export/students`,
      `/export/exams`, `/export/sessions` — complete datasets export as JSON

## 8. Security Checks

- [ ] Requests without a Bearer token → 401
- [ ] Student token calling admin routes → 403
- [ ] Instructor token calling admin routes → 403
- [ ] `helmet` headers present on responses (`X-Content-Type-Options`, etc.)
- [ ] CORS: request from a non-whitelisted origin rejected
- [ ] Password stored only as bcrypt `password_hash` (no plaintext `password` column value)
- [ ] JWT secret failure: backend refuses to boot with a weak `JWT_SECRET`

## 9. Regression: Test Suites

```bash
# Backend unit tests (no DB/chain required)
cd backend && npm test

# Backend chain integration (docker compose running)
cd backend && $env:BLOCKCHAIN_RPC="http://127.0.0.1:8545"; npm run test:integration

# Frontend unit tests + lint + build
cd frontend && npm test && npm run lint && npm run build
```
- [ ] All backend unit tests pass
- [ ] 6/6 chain-resilience integration tests pass
- [ ] Frontend vitest suites pass, lint clean, production build succeeds
