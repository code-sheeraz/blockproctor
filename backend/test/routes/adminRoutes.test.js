// test/routes/adminRoutes.test.js
// Supertest coverage for key admin endpoints (db + chain mocked).

import { vi, describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../config/db.js', () => ({ default: { query: vi.fn(), connect: vi.fn() } }));
vi.mock('../../services/blockchainService.js', () => ({
    verifyAttemptIntegrity: vi.fn(async () => ({ verified: true, match: true, exists: true })),
    isBlockchainReady: vi.fn(() => true),
}));

process.env.JWT_SECRET = 'test-secret-for-unit-tests';

import pool from '../../config/db.js';
import { generateToken } from '../../middleware/auth.js';
import adminRoutes from '../../routes/adminRoutes.js';

const query = vi.mocked(pool.query);

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/admin', adminRoutes);
    return app;
}

const app = buildApp();
const adminToken = generateToken({ id: 1, role: 'admin', email: 'admin@x.com' });
const studentToken = generateToken({ id: 5, role: 'student', email: 's@x.com' });

describe('adminRoutes', () => {
    beforeEach(() => vi.clearAllMocks());

    it('rejects non-admin tokens on protected routes', async () => {
        const res = await request(app)
            .get('/api/admin/dashboard/stats')
            .set('Authorization', `Bearer ${studentToken}`);
        expect(res.status).toBe(403);
    });

    it('requires a token on protected routes', async () => {
        const res = await request(app).get('/api/admin/dashboard/stats');
        expect(res.status).toBe(401);
    });

    it('GET /dashboard/stats returns aggregated counters', async () => {
        query.mockResolvedValue({
            rows: [{ pending_students: '2', enrolled_students: '5', total_exams: '3', total_attempts: '10' }]
        });
        const res = await request(app)
            .get('/api/admin/dashboard/stats')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(res.body.stats.total_attempts).toBe('10');
    });

    it('GET /students filters by enrollment status', async () => {
        query.mockResolvedValue({ rows: [{ id: 5, name: 'S', enrollment_status: 'pending_admin' }] });
        const res = await request(app)
            .get('/api/admin/students?status=pending_admin')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(query.mock.calls[0][1]).toEqual(['pending_admin']);
        expect(res.body.students).toHaveLength(1);
    });

    it('POST /enrollments/:userId/approve updates the user status', async () => {
        query.mockResolvedValue({ rows: [{ id: 5, enrollment_status: 'pending_face' }] });
        const res = await request(app)
            .post('/api/admin/enrollments/5/approve')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    it('POST /enrollments/:userId/reject records a deletion audit entry', async () => {
        query.mockResolvedValue({ rows: [{ id: 5, email: 's@x.com' }] });
        const res = await request(app)
            .post('/api/admin/enrollments/5/reject')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ reason: 'incomplete documents' });
        expect(res.status).toBe(200);
        expect(res.body.message).toBe('Enrollment rejected');
    });

    it('GET /audit/summary returns audit counts', async () => {
        query.mockResolvedValue({
            rows: [{ total_exam_edits: '1', total_attempt_edits: '2', total_deletions: '0' }]
        });
        const res = await request(app)
            .get('/api/admin/audit/summary')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(res.body.summary).toBeDefined();
    });

    it('GET /departments lists departments', async () => {
        query.mockResolvedValue({ rows: [{ id: 1, name: 'IT' }] });
        const res = await request(app)
            .get('/api/admin/departments')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
    });
});

describe('POST /api/admin/student-logs/:studentId/exam/:examId/allow-retry', () => {
    beforeEach(() => vi.clearAllMocks());

    it('archives the prior attempt and resets the session inside one transaction', async () => {
        const calls = [];
        const client = {
            query: vi.fn(async (sql, params) => {
                calls.push({ sql: String(sql), params });
                const upper = String(sql).toUpperCase();
                if (upper.includes('FROM EXAMS WHERE ID')) return { rows: [{ duration_minutes: 45 }] };
                if (upper.includes('FROM EXAM_SESSIONS WHERE STUDENT_ID')) {
                    return { rows: [{ id: 88, status: 'TERMINATED' }] };
                }
                if (upper.includes('FROM ATTEMPTS A')) {
                    return { rows: [{ id: 500, exam_id: 10, student_id: 5, blockchain_hash: '0xh', blockchain_tx: '0xtx', correct_count: 3 }] };
                }
                return { rows: [] };
            }),
            release: vi.fn(),
        };
        vi.mocked(pool.connect).mockResolvedValue(client);

        const res = await request(app)
            .post('/api/admin/student-logs/5/exam/10/allow-retry')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ adminNotes: 'crash verified' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);

        // Prior attempt archived with chain references preserved...
        const audit = calls.find(c => c.sql.toUpperCase().includes('INSERT INTO AUDIT_ATTEMPTS'));
        expect(audit).toBeDefined();
        expect(audit.params).toContain('0xh');
        expect(audit.params).toContain('0xtx');
        // ...logs detached and attempt deleted...
        expect(calls.some(c => c.sql.toUpperCase().includes('UPDATE PROCTOR_LOGS SET ATTEMPT_ID = NULL'))).toBe(true);
        expect(calls.some(c => c.sql.toUpperCase().includes('DELETE FROM ATTEMPTS'))).toBe(true);
        // ...and the session fully reset with the full timer restored (45min -> 2700s).
        const reset = calls.find(c => c.sql.toUpperCase().includes("STATUS = 'NOT_STARTED'"));
        expect(reset).toBeDefined();
        expect(reset.params).toContain(2700);
        // All inside one transaction.
        expect(client.query).toHaveBeenCalledWith('BEGIN');
        expect(client.query).toHaveBeenCalledWith('COMMIT');
    });

    it('returns 404 for an unknown exam without starting a transaction', async () => {
        const client = {
            query: vi.fn(async () => ({ rows: [] })),
            release: vi.fn(),
        };
        vi.mocked(pool.connect).mockResolvedValue(client);

        const res = await request(app)
            .post('/api/admin/student-logs/5/exam/999/allow-retry')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({});

        expect(res.status).toBe(404);
        expect(client.query).not.toHaveBeenCalledWith('BEGIN');
    });
});
