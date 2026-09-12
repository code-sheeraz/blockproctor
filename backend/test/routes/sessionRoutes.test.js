// test/routes/sessionRoutes.test.js
// Supertest coverage for exam session endpoints (service mocked).

import { vi, describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../services/examSessionService.js', () => ({
    default: {
        startSession: vi.fn(),
        recordHeartbeat: vi.fn(),
        logViolation: vi.fn(),
        forceSubmitOnLock: vi.fn(),
        submitExam: vi.fn(),
        requestAccess: vi.fn(),
        getSessionDetails: vi.fn(),
        unlockSession: vi.fn(),
        lockSession: vi.fn(),
    },
}));

process.env.JWT_SECRET = 'test-secret-for-unit-tests';

import examSessionService from '../../services/examSessionService.js';
import { generateToken } from '../../middleware/auth.js';
import sessionRoutes from '../../routes/sessionRoutes.js';

const svc = vi.mocked(examSessionService);

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/session', sessionRoutes);
    return app;
}

const app = buildApp();
const studentToken = generateToken({ id: 5, role: 'student', email: 's@x.com' });
const adminToken = generateToken({ id: 1, role: 'admin', email: 'a@x.com' });

describe('POST /api/session/start', () => {
    beforeEach(() => vi.clearAllMocks());

    it('starts a session for an authenticated student', async () => {
        svc.startSession.mockResolvedValue({ success: true, session: { id: 77 }, resumed: false });
        const res = await request(app)
            .post('/api/session/start')
            .set('Authorization', `Bearer ${studentToken}`)
            .send({ studentId: 5, examId: 10 });
        expect(res.status).toBe(200);
        expect(res.body.session.id).toBe(77);
        expect(svc.startSession).toHaveBeenCalledWith(5, 10, expect.any(Object));
    });

    it('rejects unauthenticated requests', async () => {
        const res = await request(app).post('/api/session/start').send({ studentId: 5, examId: 10 });
        expect(res.status).toBe(401);
        expect(svc.startSession).not.toHaveBeenCalled();
    });

    it('maps LOCKED errors to 403 with locked flag', async () => {
        svc.startSession.mockRejectedValue(new Error('LOCKED: Too many violations'));
        const res = await request(app)
            .post('/api/session/start')
            .set('Authorization', `Bearer ${studentToken}`)
            .send({ studentId: 5, examId: 10 });
        expect(res.status).toBe(403);
        expect(res.body.locked).toBe(true);
    });

    it('maps TERMINATED and COMPLETED errors to the right codes', async () => {
        svc.startSession.mockRejectedValue(new Error('TERMINATED: left for 60s'));
        let res = await request(app)
            .post('/api/session/start')
            .set('Authorization', `Bearer ${studentToken}`)
            .send({ studentId: 5, examId: 10 });
        expect(res.status).toBe(403);
        expect(res.body.terminated).toBe(true);

        svc.startSession.mockRejectedValue(new Error('COMPLETED: already submitted'));
        res = await request(app)
            .post('/api/session/start')
            .set('Authorization', `Bearer ${studentToken}`)
            .send({ studentId: 5, examId: 10 });
        expect(res.status).toBe(400);
        expect(res.body.completed).toBe(true);

        svc.startSession.mockRejectedValue(new Error('EXPIRED: time up'));
        res = await request(app)
            .post('/api/session/start')
            .set('Authorization', `Bearer ${studentToken}`)
            .send({ studentId: 5, examId: 10 });
        expect(res.status).toBe(400);
        expect(res.body.expired).toBe(true);
    });
});

describe('POST /api/session/heartbeat', () => {
    it('forwards heartbeat and exposes lock state as 403', async () => {
        svc.recordHeartbeat.mockResolvedValue({ locked: true, lockReason: 'x' });
        const res = await request(app)
            .post('/api/session/heartbeat')
            .set('Authorization', `Bearer ${studentToken}`)
            .send({ sessionId: 1, studentId: 5, examId: 10, timeRemaining: 90 });
        expect(res.status).toBe(403);
        expect(res.body.locked).toBe(true);
    });

    it('returns success for a normal heartbeat', async () => {
        svc.recordHeartbeat.mockResolvedValue({ success: true, timeSinceLastHeartbeat: 3 });
        const res = await request(app)
            .post('/api/session/heartbeat')
            .set('Authorization', `Bearer ${studentToken}`)
            .send({ sessionId: 1, studentId: 5, examId: 10, timeRemaining: 90 });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });
});

describe('POST /api/session/violation', () => {
    it('logs a violation via the service', async () => {
        svc.logViolation.mockResolvedValue({ success: true, locked: false, violationCount: 1 });
        const res = await request(app)
            .post('/api/session/violation')
            .set('Authorization', `Bearer ${studentToken}`)
            .send({ sessionId: 1, studentId: 5, examId: 10, violationType: 'MULTI_FACE', description: '2 faces', metadata: { faces: 2 }, isSevere: false });
        expect(res.status).toBe(200);
        expect(svc.logViolation).toHaveBeenCalledWith(1, 5, 10, 'MULTI_FACE', '2 faces', { faces: 2 }, false);
    });
});

describe('POST /api/session/submit and /force-submit', () => {
    it('submits the exam', async () => {
        svc.submitExam.mockResolvedValue({ success: true, score: 80 });
        const res = await request(app)
            .post('/api/session/submit')
            .set('Authorization', `Bearer ${studentToken}`)
            .send({ sessionId: 1, studentId: 5, examId: 10, answers: ['A'] });
        expect(res.status).toBe(200);
        expect(res.body.score).toBe(80);
    });

    it('force-submits on lock', async () => {
        svc.forceSubmitOnLock.mockResolvedValue({ success: true, terminated: true });
        const res = await request(app)
            .post('/api/session/force-submit')
            .set('Authorization', `Bearer ${studentToken}`)
            .send({ sessionId: 1, studentId: 5, examId: 10, answers: ['A'], lockReason: 'x', timeRemaining: 0 });
        expect(res.status).toBe(200);
        expect(res.body.terminated).toBe(true);
    });
});

describe('POST /api/session/request-access', () => {
    it('creates an access request', async () => {
        svc.requestAccess.mockResolvedValue({ success: true, id: 9 });
        const res = await request(app)
            .post('/api/session/request-access')
            .set('Authorization', `Bearer ${studentToken}`)
            .send({ studentId: 5, examId: 10, requestType: 'technical', reason: 'camera broke' });
        expect(res.status).toBe(200);
    });
});

describe('GET /api/session/:sessionId/status', () => {
    it('returns session details', async () => {
        svc.getSessionDetails.mockResolvedValue({
            session: { status: 'IN_PROGRESS', is_locked: false, lock_reason: null, warning_count: 0, violation_count: 0, time_remaining: 100 }
        });
        const res = await request(app)
            .get('/api/session/1/status')
            .set('Authorization', `Bearer ${studentToken}`);
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('IN_PROGRESS');
        expect(res.body.timeRemaining).toBe(100);
    });

    it('returns 404 for a missing session', async () => {
        svc.getSessionDetails.mockResolvedValue(null);
        const res = await request(app)
            .get('/api/session/1/status')
            .set('Authorization', `Bearer ${studentToken}`);
        expect(res.status).toBe(404);
    });
});

describe('admin session endpoints', () => {
    it('allows an admin to lock a session', async () => {
        svc.lockSession.mockResolvedValue({ success: true });
        const res = await request(app)
            .post('/api/session/admin/1/lock')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ reason: 'suspected cheating' });
        expect(res.status).toBe(200);
    });

    it('rejects a student locking a session', async () => {
        const res = await request(app)
            .post('/api/session/admin/1/lock')
            .set('Authorization', `Bearer ${studentToken}`)
            .send({ reason: 'x' });
        expect(res.status).toBe(403);
    });
});

describe('GET /api/session/admin/:sessionId (admin-only details)', () => {
    beforeEach(() => vi.clearAllMocks());

    it('rejects a student with 403 and never touches the service', async () => {
        const res = await request(app)
            .get('/api/session/admin/77')
            .set('Authorization', `Bearer ${studentToken}`);
        expect(res.status).toBe(403);
        expect(svc.getSessionDetails).not.toHaveBeenCalled();
    });

    it('returns full details for an admin', async () => {
        svc.getSessionDetails.mockResolvedValue({
            session: { id: 77, status: 'IN_PROGRESS' },
            violations: [{ violation_type: 'MULTI_FACE' }],
            heartbeats: [],
        });
        const res = await request(app)
            .get('/api/session/admin/77')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(res.body.session.id).toBe(77);
        expect(res.body.violations).toHaveLength(1);
        expect(svc.getSessionDetails).toHaveBeenCalledWith('77');
    });

    it('returns 404 for a missing session', async () => {
        svc.getSessionDetails.mockResolvedValue(null);
        const res = await request(app)
            .get('/api/session/admin/999')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(404);
    });
});
