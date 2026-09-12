// test/routes/blockchainRoutes.test.js
// Supertest coverage for the blockchain API endpoints (chain mocked).

import { vi, describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../config/db.js', () => ({ default: { query: vi.fn() } }));
vi.mock('../../services/blockchainService.js', () => ({
    recordExamOnChain: vi.fn(async () => ({ success: true, txHash: '0xexam' })),
    recordAttemptOnChain: vi.fn(async () => ({ success: true, txHash: '0xattempt' })),
    verifyExamIntegrity: vi.fn(async () => ({ verified: true, match: true })),
    verifyAttemptIntegrity: vi.fn(async () => ({ verified: true, match: true })),
    verifyLogsIntegrity: vi.fn(async () => ({ verified: true, match: true })),
    getBlockchainStatistics: vi.fn(async () => ({ available: true, totalAttemptsRecorded: 3 })),
    generateExamHash: vi.fn(() => '0xhash'),
    generateAttemptHash: vi.fn(() => '0xhash'),
    generateLogsHash: vi.fn(() => '0xhash'),
    isBlockchainReady: vi.fn(() => true),
}));

process.env.JWT_SECRET = 'test-secret-for-unit-tests';

import pool from '../../config/db.js';
import { generateToken } from '../../middleware/auth.js';
import blockchainRoutes from '../../routes/blockchainRoutes.js';

const query = vi.mocked(pool.query);

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/blockchain', blockchainRoutes);
    return app;
}

const app = buildApp();
const token = generateToken({ id: 5, role: 'student', email: 's@x.com' });

describe('blockchainRoutes', () => {
    beforeEach(() => vi.clearAllMocks());

    it('requires authentication', async () => {
        const res = await request(app).get('/api/blockchain/status');
        expect(res.status).toBe(401);
    });

    it('GET /status reports readiness and statistics', async () => {
        const res = await request(app).get('/api/blockchain/status').set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.connected).toBe(true);
        expect(res.body.statistics.available).toBe(true);
    });

    it('POST /exams/:examId/record records an existing exam', async () => {
        query.mockResolvedValue({ rows: [{ id: 7, title: 'T' }] });
        const res = await request(app)
            .post('/api/blockchain/exams/7/record')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.txHash).toBe('0xexam');
    });

    it('POST /exams/:examId/record returns 404 for missing exams', async () => {
        query.mockResolvedValue({ rows: [] });
        const res = await request(app)
            .post('/api/blockchain/exams/999/record')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(404);
    });

    it('POST /attempts/:attemptId/record records an existing attempt', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ id: 500, student_id: 5, exam_id: 10 }] })
            .mockResolvedValueOnce({ rows: [{ id: 1 }] });
        const res = await request(app)
            .post('/api/blockchain/attempts/500/record')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.txHash).toBe('0xattempt');
    });

    it('POST /attempts/:attemptId/record returns 404 for missing attempts', async () => {
        query.mockResolvedValue({ rows: [] });
        const res = await request(app)
            .post('/api/blockchain/attempts/999/record')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(404);
    });

    it('GET /verify/attempt/:attemptId verifies integrity', async () => {
        query.mockResolvedValue({ rows: [{ id: 500, exam_id: 10, student_id: 5 }] });
        const res = await request(app)
            .get('/api/blockchain/verify/attempt/500')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.verified).toBe(true);
    });

    it('GET /verify/attempt/:attemptId returns 404 for missing attempts', async () => {
        query.mockResolvedValue({ rows: [] });
        const res = await request(app)
            .get('/api/blockchain/verify/attempt/999')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(404);
    });

    it('GET /hash/attempt/:attemptId returns the computed hash', async () => {
        query.mockResolvedValue({ rows: [{ id: 500 }] });
        const res = await request(app)
            .get('/api/blockchain/hash/attempt/500')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.hash).toBe('0xhash');
    });
});
