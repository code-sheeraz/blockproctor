<div align="center">

# BlockProctor

**Blockchain-anchored, AI-driven exam proctoring with tamper-evident audit trails.**

[![CI](https://github.com/code-sheeraz/blockproctor/actions/workflows/ci.yml/badge.svg)](https://github.com/code-sheeraz/blockproctor/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![Docker](https://img.shields.io/badge/docker-%3E%3D20-blue)](https://docker.com)

A full-stack system that combines **real-time AI proctoring** (head-pose estimation, identity verification, multi-face detection, absence monitoring) with **on-chain anchoring** of exam hashes, attempt data, and proctor logs — ensuring every exam session is verifiably tamper-proof.

</div>

---

## Features

- **Real-time AI Proctoring** — client-side face detection via MediaPipe + face-api.js with head-pose tracking, identity verification, absence detection, and trust scoring
- **Blockchain Audit Trail** — every exam, attempt, and proctor log is hashed and anchored on a Solidity smart contract (Anvil/Hardhat local chain)
- **Four-State Integrity Verification** — VERIFIED / STALE_ANCHOR / UNVERIFIED / NO_ANCHOR with deterministic derivation from on-chain vs. database state
- **Instructor Workflow** — class management, MCQ exam builder with duplicate/edit, publish/unpublish, and per-student grading
- **Admin Dashboard** — student enrollment approval, face verification audit, proctor session monitoring, blockchain verification panel, and research data extraction APIs
- **Detection Metrics Harness** — reproducible evaluation script that computes accuracy, precision, recall, F1, and FPR per violation class against ground-truth session data
- **Self-Healing Blockchain Sync** — `chainReseed` service re-records any missing on-chain hashes on startup + every 60 seconds

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React + Vite)                      │
├──────────────────────────────────────────────────────────────────────┤
│  LoginPage  │  StudentDashboard  │  ExamSession + ExamProctor        │
│  RegisterPage  │  InstructorDashboard  │  AdminDashboard             │
└──────────────────────────┬───────────────────────────────────────────┘
                           │ REST API
┌──────────────────────────▼───────────────────────────────────────────┐
│                        BACKEND (Express.js)                          │
├──────────────────────────────────────────────────────────────────────┤
│  Routes:   auth │ users │ exams │ session │ instructors │ students   │
│            admin │ research │ blockchain                             │
│  Services: blockchainService │ examSessionService │ proctorService   │
│  Utils:    scoring │ detectionMetrics │ headPose │ trustEngine       │
└──────────┬──────────────────────────────┬───────────────────────────┘
           │                              │
┌──────────▼──────────┐  ┌────────────────▼────────────────────────┐
│    PostgreSQL 15    │  │   Anvil Blockchain (Foundry)            │
│  users, exams,      │  │   ProctorChain.sol — recordExam(),      │
│  attempts, sessions,│  │   recordAttempt(), verifyExam(),        │
│  proctor_logs,      │  │   verifyAttempt(), verifyProctorLogs()  │
│  heartbeat_logs     │  │   State persisted to Docker volume      │
└─────────────────────┘  └─────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- **Docker** (Compose v2) — runs PostgreSQL, Anvil blockchain, backend, and pgAdmin
- **Node.js 20+** — only needed for frontend development and running tests

### 1. Start the full stack

```bash
docker compose up --build
```

This boots PostgreSQL, the Anvil blockchain node (with ProctorChain auto-deployed), the Express backend, and pgAdmin. The database is empty until you run migrations.

### 2. Run database migrations

```bash
# Windows
run_migration.bat

# Or directly
docker exec -it blockproctor-backend node migrate.js
```

The migration is idempotent — safe to re-run. It creates the full schema and seeds admin/instructor accounts.

### 3. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Visit **http://localhost:5173**.

### Seed demo data (optional)

```bash
backend\scripts\seed_demo.bat
```

Creates a demo student, class, and exam for quick testing.

### Default accounts

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@blockproctor.com | admin123 |
| Instructor | instructor@cs.edu | instructor123 |
| Demo student | demo.student@blockproctor.com | student123 |

> Students must register (LoginPage → Register), be approved by admin, and enrolled by an instructor before taking exams.

## How It Works

### AI Proctoring Detection

The `ExamProctor` component runs three detection pipelines on the client using the webcam:

| Detection | Method | Threshold | Penalty |
|-----------|--------|-----------|---------|
| Head Turn (L/R/U/D) | MediaPipe 468-landmark head-pose estimation | Yaw > 0.25, Pitch > 0.20 | -20% per direction |
| Absence | MediaPipe face count over time | No face > 3s (minor) / > 8s (critical) | -5% / -30% |
| Multi-Face | MediaPipe face count | > 1 face for > 500ms | -30% |
| Identity Mismatch | face-api.js 68-dim descriptor distance | 3 consecutive fails > 0.55 | -20% |
| Tab Away / Screen Lock | Page Visibility API + freeze detection | Any event | -10% |
| Keyboard Shortcut | Ctrl/Cmd/Alt/F-key interception | Blocked keys | -5% |
| Right-Click | contextmenu event | Blocked | -5% |

When cumulative trust drops below 35%, the exam is **locked** and auto-submitted.

### Blockchain Lifecycle

1. **Exam Created** → `recordExam(examId, hash)` anchors the exam definition on-chain
2. **Exam Submitted** → `recordAttempt(attemptId, examId, studentId, dataHash, logHash, trustScore, violationCount)` records the attempt + proctor logs
3. **Verification** → `verifyAttempt()` and `verifyProctorLogs()` compare on-chain hashes against current database state
4. **Self-Healing** → `chainReseed` runs on startup + every 60s, re-recording any DB attempts missing from the chain

### Four-State Integrity Model

| State | Meaning |
|-------|---------|
| `VERIFIED` | On-chain hash matches current database data |
| `STALE_ANCHOR` | Data was modified after being anchored (potential tamper) |
| `UNVERIFIED` | No matching on-chain record found |
| `NO_ANCHOR` | Attempt never recorded on-chain |

## Configuration

### Backend (`backend/.env`)

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/blockproctor
BLOCKCHAIN_RPC=http://127.0.0.1:8545
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
JWT_SECRET=              # REQUIRED — generate with: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
PORT=8080
```

Contract addresses are resolved automatically from `blockchain/artifacts/blockchain-addresses.env` — no manual configuration needed.

### Frontend (`frontend/.env`)

```env
# Optional — defaults to http://<hostname>:8080/api
# VITE_API_URL=http://localhost:8080/api
```

### Proctoring thresholds

Edit the `CONFIG` object in `frontend/src/components/ExamProctor.jsx`:

```js
const CONFIG = {
    HEAD_YAW_THRESHOLD: 0.25,           // Left/right sensitivity
    HEAD_PITCH_THRESHOLD: 0.20,         // Up/down sensitivity
    ABSENCE_GRACE_PERIOD: 3000,         // ms before absence flagged
    ABSENCE_CRITICAL_THRESHOLD: 8000,   // ms before critical
    IDENTITY_DISTANCE_THRESHOLD: 0.55,  // Face-match distance cutoff
    IDENTITY_CHECK_INTERVAL: 3000,      // ms between identity checks
    MULTI_FACE_TOLERANCE: 500,          // ms before multi-face flagged
};
```

## Testing

### Automated tests

```bash
# Backend unit tests (235 tests, no Docker required)
cd backend && npm test

# Frontend unit tests (53 tests)
cd frontend && npm test

# Lint
cd frontend && npm run lint

# Full build
cd frontend && npm run build
```

All tests are enforced by GitHub Actions CI on every push and PR to `main`.

### Detection metrics evaluation

```bash
cd backend
node scripts/evaluate_detection.mjs data/ground-truth/field_validation_sessionclasses.json
```

Outputs per-class TP/FP/FN/TN, precision, recall, F1, accuracy, and FPR — matching the results in the thesis (98.4% accuracy, 96.6% micro-F1).

### Manual testing

See [TESTING_CHECKLIST.md](TESTING_CHECKLIST.md) for the full end-to-end verification flow covering authentication, enrollment, exam proctoring, blockchain verification, and security checks.

## Project Structure

```
blockproctor/
├── frontend/                     React + Vite SPA
│   ├── src/
│   │   ├── components/
│   │   │   ├── ExamProctor.jsx       Real-time AI proctoring engine
│   │   │   ├── AdminDashboard.jsx    Admin panel (enrollment, audit, blockchain, research)
│   │   │   └── InstructorDashboard.jsx  Class/exam management
│   │   ├── pages/
│   │   │   ├── LoginPage.jsx         Auth + registration
│   │   │   ├── ExamSession.jsx       Proctored exam experience
│   │   │   └── ...
│   │   └── utils/
│   │       ├── headPose.js           Head-pose estimation from landmarks
│   │       └── trustEngine.js        Trust-score state machine
│   └── scripts/
│       └── copy-mediapipe.mjs        Vendored MediaPipe asset copier
├── backend/                      Express.js REST API
│   ├── routes/                   10 route modules (auth, exams, session, research, ...)
│   ├── services/
│   │   ├── blockchainService.js  On-chain recording + four-state verification
│   │   ├── examSessionService.js Session lifecycle + scoring + trust management
│   │   └── proctorService.js     Violation logging
│   ├── utils/
│   │   ├── scoring.js            Format-agnostic answer resolution + scoring
│   │   └── detectionMetrics.js   Evaluation harness (precision/recall/F1)
│   ├── middleware/auth.js        JWT authentication + role authorization
│   ├── migrations/               SQL schema (idempotent)
│   ├── scripts/                  Seed, backup, tamper-demo, evaluation CLI
│   └── test/                     235 unit tests (vitest)
├── blockchain/                   Solidity contracts
│   ├── contracts/ProctorChain.sol  Main audit-trail smart contract
│   └── scripts/ensureDeployed.mjs  Auto-deploy on fresh chain
├── docker-compose.yml            4-service orchestration
├── TECHNICAL_DOCUMENTATION.md    Full API + architecture reference
└── TESTING_CHECKLIST.md          End-to-end QA manual
```

## API Reference

See [TECHNICAL_DOCUMENTATION.md](TECHNICAL_DOCUMENTATION.md) for the complete API reference covering all 10 route modules.

Key endpoints:

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Authenticate and receive JWT |
| POST | `/api/auth/register` | Register a new student account |
| GET | `/api/instructors/:id/classes` | List instructor's classes |
| POST | `/api/instructors/:id/exams` | Create a new exam |
| POST | `/api/session/start` | Start an exam session |
| POST | `/api/session/heartbeat` | Report heartbeat + violations |
| POST | `/api/session/submit` | Submit exam answers |
| GET | `/api/research/proctor-metrics` | Detection performance metrics |
| POST | `/api/research/verify-integrity` | Blockchain integrity check |
| GET | `/api/blockchain/status` | Blockchain connection status |

## Security Model

- **JWT authentication** on all routes with role-based authorization (student, instructor, admin)
- **IDOR protection** — users can only access their own data; instructors scoped to their classes
- **Rate limiting** on auth routes (10 req/15min) and general API (100 req/15min)
- **Helmet** security headers enabled
- **No sensitive data in responses** — exam questions stripped from list endpoints, passwords never returned
- **Blockchain immutability** — exam hashes, attempt data, and proctor logs are anchored on-chain; any post-hoc modification is detected as `STALE_ANCHOR`

## Limitations & Future Work

- **MediaPipe/face-api.js dependency** on CDN for WASM assets — vendored locally for offline use, but updates require manual copy
- **Client-side proctoring** — a sufficiently sophisticated user could theoretically bypass browser-level detection; server-side video analysis would be more robust but requires GPU infrastructure
- **Single-chain deployment** — currently targets a local Anvil chain; production would need a public testnet/mainnet deployment
- **No video recording** — the system logs events, not video; adding encrypted video storage would improve audit capability

## Team

- **Sheeraz Ali** — Group Leader, full-stack development, blockchain integration
- **Yashfin Rashid** — AI proctoring engine, detection metrics, face-api.js integration
- **Shurooq Sharif** — Backend architecture, database design, security hardening

Final Year Project — QUEST Nawabshah, 2026.

## License

This project is licensed under the [MIT License](LICENSE).
