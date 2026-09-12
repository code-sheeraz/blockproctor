# BlockProctor Technical Documentation

Technical reference for the BlockProctor system: a blockchain-based, AI-proctored
online examination platform. Covers architecture, data model, blockchain
integration, API surface, security, and development workflow.

---

## 1. System Overview

BlockProctor records exam data, proctor-log data, results, and identity
verification events on a local blockchain (Anvil/Foundry) to create a
tamper-evident audit trail. The frontend runs realtime AI proctoring in the
browser (face-api.js + MediaPipe): head-pose tracking, multi-face detection,
identity verification, and absence detection. Violations degrade a per-session
trust score; crossing thresholds locks the exam.

### Research Goals
- UDLR head-pose monitoring (up/down/left/right)
- Multi-face and absence detection
- Continuous identity verification against an enrolled face descriptor
- Blockchain-backed integrity for attempts, exams, and proctor logs
- Exportable research datasets (violations, attempts, sessions, students)

## 2. Architecture

```
Browser (React + Vite)
  └─ ExamProctor.jsx (face-api.js + MediaPipe) → violation events
        │
        ▼  REST (JSON, Bearer JWT)
Express backend (backend/)  ────► PostgreSQL 15 (schema from migrations/)
  ├─ Routes: auth, users, enroll, exams, session, admin,
  │          instructors, students, research, blockchain
  ├─ Services: proctorService, examSessionService,
  │            blockchainService, chainReseed
  └─ config: db (pg Pool), blockchain (ethers provider/signer,
             lazy contract + address hot-swap)
        │
        ▼  JSON-RPC
Anvil node (blockchain/, Foundry) ── ProctorChain.sol
```

Docker Compose services: `blockchain`, `postgres`, `backend`, `pgadmin`.
Volumes: `postgres_data`, `blockchain_data` (Anvil state, survives restarts).

### Directory Layout
```
BlockProctor/
├── backend/
│   ├── server.js             # Express app, security headers, rate limits
│   ├── migrate.js            # Migration runner + bcrypt backfill
│   ├── migrations/           # 001 (schema snapshot) + 002–014 idempotent deltas
│   ├── config/               # db.js, blockchain.js
│   ├── middleware/auth.js    # JWT authenticate + role authorize
│   ├── routes/               # 10 route modules (see §6)
│   ├── services/             # blockchain, proctor, examSession, chainReseed
│   ├── utils/                # hash, scoring, integrityScore, stableStringify
│   ├── controllers/          # examContollers, userController
│   └── test/                 # unit + chain integration suites
├── blockchain/
│   ├── contracts/ProctorChain.sol
│   ├── scripts/deploy.js     # writes blockchain/artifacts/blockchain-addresses.env
│   ├── scripts/ensureDeployed.mjs  # deploy-if-missing on boot
│   └── start.sh              # anvil --state + auto-deploy
├── frontend/
│   ├── src/pages/            # Login, Register, CaptureProfile, StudentDashboard,
│   │                         # ExamSession, ExamResults, AdminDashboard, InstructorDashboard
│   ├── src/components/       # ExamProctor, Pagination, ErrorBoundary, ...
│   └── public/models/        # face-api.js model files
├── docker-compose.yml
└── .github/workflows/ci.yml
```

## 3. Database

PostgreSQL 15. `backend/migrations/001_initial_schema.sql` is the authoritative
schema snapshot (generated from the live schema); files `002`–`014` are
idempotent deltas (indexes, LMS columns, audit tables, seed data, bcrypt
columns). `migrate.js` applies pending files in order and records them in
`_migrations`; on completion it backfills bcrypt `password_hash` values from any
remaining plaintext seed passwords (cost 12) and clears the plaintext column.

### Core Tables
| Table | Purpose |
|-------|---------|
| users | Students; role, enrollment_status enum, face_verification_photo/hash, department/batch |
| admins, instructors | Staff accounts (bcrypt password_hash) |
| departments, batches, classes | Org structure (LMS) |
| class_enrollments | Student ↔ class membership |
| exams | title, duration, questions_json, class/instructor, time window, proctoring config, blockchain_hash/tx |
| attempts | answers_json, score, correct_count, blockchain_hash/tx, session link; UNIQUE(exam_id, student_id) |
| exam_sessions | live proctoring state: trust scores, violation counts, lock state, heartbeat, question_order |
| proctor_logs | per-event violation records (legacy events_json + typed columns) |
| ai_events | AI detection events used by research endpoints |
| heartbeat_logs, exam_access_requests | session telemetry / access workflow |
| audit_* (8 tables) | append-only audit trails: classes, exams, attempts, sessions, logs, enrollments, heartbeats, deletions |

Enrollment status flow: `pending_admin → pending_face → pending_instructor → enrolled`.

## 4. Blockchain Integration

### 4.1 Contract — ProctorChain.sol
| Function | Description |
|----------|-------------|
| `recordExam(examId, dataHash)` | Record exam data hash on-chain |
| `recordAttempt(attemptId, examId, studentId, dataHash, proctorLogHash, trustScore, violationCount)` | Record attempt + logs hash |
| `verifyExam / verifyAttempt / verifyProctorLogs` | Verify a provided hash against the chain |
| `getExamRecord / getAttemptRecord / getStatistics` | Read records / totals |

### 4.2 Lifecycle (Anvil, persistent)
- The blockchain container runs `anvil --state /app/data/state.json` (volume
  `blockchain_data`), so contracts and hashes survive restarts.
- `scripts/ensureDeployed.mjs` runs at boot: checks `eth_getCode` at the
  recorded address and deploys **only** when the chain is genuinely fresh.
  Addresses are written to `blockchain/artifacts/blockchain-addresses.env`
  (`PROCTOR_CHAIN_ADDRESS=...`).
- Backend resolves addresses lazily via `config/blockchain.js`, watches the
  file's mtime, and hot-swaps the contract instance + resets the nonce cache
  when it changes. Nonces are managed sequentially to avoid races.
- `services/chainReseed.js` re-records any DB attempt missing from the chain
  (on startup and every 60 s) — a wiped volume self-heals without manual steps.

### 4.3 Hash Pipeline
Hashes are SHA-256 over a **stable** JSON serialization (`utils/stableStringify`)
of the data subset relevant to integrity (attempt id, exam, answers, score,
timestamps). Logs hashes are computed over ordered violation events with
trust scores. This means any DB-side tampering is detectable at verification.

## 5. AI Proctoring

`components/ExamProctor.jsx` runs in the browser: face detection + recognition
(face-api.js), head-pose estimation (MediaPipe), face-match against the
enrolled descriptor, and absence tracking. Tunable CONFIG:
`HEAD_YAW_THRESHOLD`, `HEAD_PITCH_THRESHOLD`, `ABSENCE_GRACE_PERIOD`,
`ABSENCE_CRITICAL_THRESHOLD`, `IDENTITY_DISTANCE_THRESHOLD`,
`IDENTITY_CHECK_INTERVAL`, `MULTI_FACE_TOLERANCE`.

Violation types: HEAD_TURN_LEFT/RIGHT/UP/DOWN, ABSENCE_CRITICAL, MULTI_FACE,
IMPERSONATION. Each violation is sent to the backend, logged in `proctor_logs`,
and applied to the session trust score (`utils/integrityScore.js`). Trust below
threshold → session locked; exam auto-submits on timeout.

## 6. API Reference

All routes under `/api`. Auth required unless noted. JWT roles: student,
instructor, admin.

### Auth — `authRoutes.js` (`/api/auth`)
| Method/Path | Notes |
|---|---|
| POST /register | student signup: name, email, password, student_id, department_id, batch_id |
| POST /login | body: email, password, role (student/instructor/admin) → token + user |
| GET /registration-options | departments + batches for the form |
| GET /enrollment-status/:userId | enrollment state |

### Users — `userRoutes.js` (`/api/users`)
`GET /:userId/enrollment-status`, `GET /:userId/face`, `GET /:userId/photo`,
`POST /:userId/log` (proctor log events).

### Enrollment — `enrollRoutes.js` (`/api/enroll`)
`POST /upload` — face descriptor upload.

### Exams — `examRoutes.js` (`/api/exams`)
`GET /`, `GET /:id`, `POST /submit`.

### Sessions — `sessionRoutes.js` (`/api/session`)
`POST /start` {studentId, examId} → session or LOCKED/TERMINATED/EXPIRED status;
`POST /heartbeat`; `POST /violation`; `POST /force-submit`; `POST /submit`;
`GET /:sessionId/status`; `POST /request-access`; `GET /admin/:sessionId`;
`POST /admin/:sessionId/lock|unlock` (admin).

### Admin — `adminRoutes.js` (`/api/admin`, `authenticate` + `authorize('admin')`)
`POST /login`; `GET /dashboard/stats`, `/students`, `/enrollments/pending`,
`/face-verifications/pending`, `/exams`, `/classes`, `/attempts`,
`/proctor-logs`, `/submitted-exams`, `/student-logs`; approvals:
`POST /enrollments/:userId/approve|reject`, `POST /face-verifications/:userId/approve|reject`,
`POST /departments`, `POST /batches`, `POST /instructors`;
audit: `GET /audit/*` (deletions, exams, attempts/logs, sessions, heartbeats,
classes/enrollments, exam-integrity, identity, summary); `POST /students/:studentId/reset-face`.

### Instructors — `instructorRoutes.js` (`/api/instructors`)
`POST /login`; `GET /:id/dashboard`, `/classes`, `/exams`; `POST /:id/classes`;
`GET /:id/classes/:classId`, `/students`; `POST /:id/classes/:classId/students`
and `/bulk`; `POST /:id/exams`, `POST /:id/exams/:examId/publish`;
`GET /:id/exams/:examId/results`; `GET /:id/pending-students`.

### Students — `studentRoutes.js` (`/api/students`)
`GET /:id/dashboard`, `/exams/available`, `/exams/:examId`, `/attempts`, `/classes`.

### Research — `researchRoutes.js` (`/api/research`)
`GET /ai-metrics`, `/detection-timeline`, `/system-metrics`, `/exam-analysis`,
`/proctor-metrics`, `/violation-breakdown`, `/detection-accuracy`,
`/blockchain-metrics`, `/blockchain-audit`, `/summary`;
`POST /verify-integrity`; exports: `GET /export/violations|attempts|sessions|students|exams|violation-summary`;
`GET /full-export`.

### Blockchain — `blockchainRoutes.js` (`/api/blockchain`)
`GET /status`; `POST /exams/:examId/record`, `/attempts/:attemptId/record`,
`/batch-record-attempts`; `GET /verify/exam/:examId`, `/verify/attempt/:attemptId`,
`/verify/logs/:attemptId`, `/hash/exam/:examId`, `/hash/attempt/:attemptId`,
`/hash/logs/:attemptId`.

## 7. Security

- **Passwords**: bcrypt (cost 12) in `password_hash`; plaintext `password`
  column is deprecated and cleared by migration backfill. Login fails if no
  hash is present.
- **JWT**: signed with `JWT_SECRET` (24 h expiry); server refuses to boot with
  a known-weak secret.
- **Rate limiting**: `/api/auth` 20 req/15 min; general API 600 req/15 min.
- **Headers/CORS**: helmet defaults; CORS whitelist via `ALLOWED_ORIGINS`.
- **Audit**: append-only audit tables + blockchain hashes make tampering
  detectable both off-chain (audit) and on-chain (hash mismatch).
- **Dev key warning**: the Foundry dev private key is accepted only for local
  development (startup warning).

## 8. Configuration

`backend/.env` (copy `backend/.env.example`; not committed):
```env
DATABASE_URL=postgresql://postgres:12345@postgres:5432/blockproctor
BLOCKCHAIN_RPC=http://blockproctor-blockchain:8545
JWT_SECRET=<strong random value>
PRIVATE_KEY=0xac0974...        # Foundry/Hardhat dev key — local dev only
PORT=8080
ALLOWED_ORIGINS=http://localhost:5173
```
Contract addresses come from `blockchain/artifacts/blockchain-addresses.env`
automatically — do **not** set `PROCTOR_CHAIN_ADDRESS` manually.

## 9. Development Workflow

```bash
# Full stack
docker compose up --build
docker exec -it blockproctor-backend node migrate.js   # or run_migration.bat

# Backend unit tests (no infra)
cd backend && npm test

# Backend chain integration (compose running)
cd backend && $env:BLOCKCHAIN_RPC="http://127.0.0.1:8545"; npm run test:integration

# Frontend
cd frontend && npm run dev        # dev server
cd frontend && npm test           # vitest suites
cd frontend && npm run lint && npm run build

# CI (GitHub Actions, .github/workflows/ci.yml)
#   backend: npm test · frontend: lint + test + build
```

## 10. Migration Policy

- `001_initial_schema.sql` is a full, idempotent schema snapshot (guards for
  enums, constraints, identity columns, tables) — safe on fresh and existing DBs.
- Later migrations only **add** structure: indexes, audit tables, LMS columns,
  seed data (upsert), enum values (`ADD VALUE IF NOT EXISTS`), bcrypt columns.
- Never edit an applied migration: add a new numbered file instead.
- The DB is reset with `docker compose down -v` (accepts loss of dev data),
  followed by `docker exec -it blockproctor-backend node migrate.js`.
