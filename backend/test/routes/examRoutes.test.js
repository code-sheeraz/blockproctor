// test/routes/examRoutes.test.js
// Supertest coverage for exam list/detail/submit endpoints.

import { vi, describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../config/db.js', () => ({ default: { query: vi.fn(), connect: vi.fn() } }));
vi.mock('../../services/blockchainService.js', () => ({
    recordAttemptOnChain: vi.fn(async () => ({ success: true, txHash: '0xtx', dataHash: '0xabc' })),
    generateAttemptHash: vi.fn(() => '0xabc'),
}));
vi.mock('../../services/proctorService.js', () => ({
    generateViolationsHash: vi.fn(async () => ({ hash: '0xlogs', count: 0 })),
}));

process.env.JWT_SECRET = 'test-secret-for-unit-tests';

import pool from '../../config/db.js';
import { recordAttemptOnChain } from '../../services/blockchainService.js';
import { generateToken } from '../../middleware/auth.js';
import examRoutes from '../../routes/examRoutes.js';

const query = vi.mocked(pool.query);
const poolConnect = vi.mocked(pool.connect);
const recordOnChain = vi.mocked(recordAttemptOnChain);

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/exams', examRoutes);
    return app;
}

const app = buildApp();
const token = generateToken({ id: 5, role: 'student', email: 's@x.com' });

function makeClient() {
    const client = {
        query: vi.fn(async (sql, params) => {
            const upper = String(sql).toUpperCase();
            if (upper.includes('FROM EXAMS WHERE ID')) {
                return { rows: [{ questions_json: [{ answer: 'A' }, { answer: 'B' }] }] };
            }
            if (upper.includes('INSERT INTO EXAM_SESSIONS')) return { rows: [] };
            if (upper.includes('INSERT INTO ATTEMPTS')) return { rows: [{ id: 500 }] };
            return { rows: [] };
        }),
        release: vi.fn(),
    };
    return client;
}

describe('GET /api/exams', () => {
    beforeEach(() => vi.clearAllMocks());

    it('requires authentication', async () => {
        const res = await request(app).get('/api/exams');
        expect(res.status).toBe(401);
    });

    it('lists exams with completion flags', async () => {
        query.mockResolvedValue({
            rows: [{ id: 1, title: 'Midterm', status: 'COMPLETED', score: 80 }, { id: 2, title: 'Final', status: null, score: null }]
        });
        const res = await request(app).get('/api/exams?studentId=5').set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.exams[0].is_completed).toBe(true);
        expect(res.body.exams[1].is_completed).toBe(false);
    });

    it('strips question banks and blockchain internals from list responses', async () => {
        query.mockResolvedValue({
            rows: [{
                id: 1,
                title: 'Midterm',
                status: 'COMPLETED',
                score: 80,
                questions_json: [{ answer: 'A' }, { answer: 'B' }, { answer: 'C' }],
                blockchain_hash: '0xdeadbeef',
                blockchain_tx: '0xtx'
            }]
        });
        const res = await request(app).get('/api/exams?studentId=5').set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        const exam = res.body.exams[0];
        expect(exam.questions_json).toBeUndefined();
        expect(exam.blockchain_hash).toBeUndefined();
        expect(exam.blockchain_tx).toBeUndefined();
        expect(exam.question_count).toBe(3); // count stays, content goes
        expect(exam.is_completed).toBe(true);
    });
});

describe('GET /api/exams/:id', () => {
    it('returns a single exam', async () => {
        query.mockResolvedValue({ rows: [{ id: 1, title: 'Midterm' }] });
        const res = await request(app).get('/api/exams/1').set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.exam.title).toBe('Midterm');
    });

    it('returns 404 for a missing exam', async () => {
        query.mockResolvedValue({ rows: [] });
        const res = await request(app).get('/api/exams/999').set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(404);
    });
});

describe('POST /api/exams/submit', () => {
    beforeEach(() => vi.clearAllMocks());

    it('scores answers, commits the transaction, records on-chain', async () => {
        const client = makeClient();
        poolConnect.mockResolvedValue(client);
        query.mockResolvedValue({ rows: [] }); // session guard: no session -> allowed; proctor logs fetch
        const res = await request(app)
            .post('/api/exams/submit')
            .set('Authorization', `Bearer ${token}`)
            .send({ examId: 1, studentId: 5, answers: ['A', 'B'] });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.score).toBe(100); // unified percentage scale (2/2 correct)
        expect(res.body.attemptId).toBe(500);
        expect(client.query).toHaveBeenCalledWith('BEGIN');
        expect(client.query).toHaveBeenCalledWith('COMMIT');
        await vi.waitFor(() => expect(recordOnChain).toHaveBeenCalled());
    });

    it('rolls back and reports when the exam does not exist', async () => {
        const client = makeClient();
        client.query.mockImplementation(async (sql) => {
            if (String(sql).includes('FROM exams WHERE id')) return { rows: [] };
            return { rows: [] };
        });
        poolConnect.mockResolvedValue(client);
        query.mockResolvedValue({ rows: [] }); // session guard: no session
        const res = await request(app)
            .post('/api/exams/submit')
            .set('Authorization', `Bearer ${token}`)
            .send({ examId: 999, studentId: 5, answers: [] });
        expect(res.status).toBe(500);
        expect(res.body.message).toBe('Exam not found');
        expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('rejects submission for a LOCKED session (403)', async () => {
        query.mockResolvedValueOnce({ rows: [{ status: 'IN_PROGRESS', is_locked: true }] });
        const res = await request(app)
            .post('/api/exams/submit')
            .set('Authorization', `Bearer ${token}`)
            .send({ examId: 1, studentId: 5, answers: ['A'] });
        expect(res.status).toBe(403);
        expect(res.body.locked).toBe(true);
        expect(poolConnect).not.toHaveBeenCalled();
    });

    it('rejects resubmission after the session is COMPLETED (400)', async () => {
        query.mockResolvedValueOnce({ rows: [{ status: 'COMPLETED', is_locked: false }] });
        const res = await request(app)
            .post('/api/exams/submit')
            .set('Authorization', `Bearer ${token}`)
            .send({ examId: 1, studentId: 5, answers: ['A'] });
        expect(res.status).toBe(400);
        expect(res.body.completed).toBe(true);
        expect(poolConnect).not.toHaveBeenCalled();
    });

    it('rejects submission for a TERMINATED session (400)', async () => {
        query.mockResolvedValueOnce({ rows: [{ status: 'TERMINATED', is_locked: false }] });
        const res = await request(app)
            .post('/api/exams/submit')
            .set('Authorization', `Bearer ${token}`)
            .send({ examId: 1, studentId: 5, answers: ['A'] });
        expect(res.status).toBe(400);
        expect(res.body.terminated).toBe(true);
        expect(poolConnect).not.toHaveBeenCalled();
    });

    it('rejects submission for an EXPIRED session (400)', async () => {
        query.mockResolvedValueOnce({ rows: [{ status: 'EXPIRED', is_locked: false }] });
        const res = await request(app)
            .post('/api/exams/submit')
            .set('Authorization', `Bearer ${token}`)
            .send({ examId: 1, studentId: 5, answers: ['A'] });
        expect(res.status).toBe(400);
        expect(res.body.expired).toBe(true);
    });

    it('still allows legacy clients that never created a session', async () => {
        query.mockResolvedValueOnce({ rows: [] }); // no session row
        const client = makeClient();
        poolConnect.mockResolvedValue(client);
        const res = await request(app)
            .post('/api/exams/submit')
            .set('Authorization', `Bearer ${token}`)
            .send({ examId: 1, studentId: 5, answers: ['A', 'B'] });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });
});
