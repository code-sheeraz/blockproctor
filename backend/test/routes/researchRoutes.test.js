// test/routes/researchRoutes.test.js
// Supertest coverage for key research endpoints (db + services mocked).

import { vi, describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../config/db.js', () => ({ default: { query: vi.fn() } }));
vi.mock('../../services/proctorService.js', () => ({
    getViolationStatistics: vi.fn(async () => ({
        byType: [{ violation_type: 'MULTI_FACE', count: '5' }],
        totals: { total_violations: '5' },
    })),
    getProctorSummary: vi.fn(async (id) => ({ attemptId: id, totalViolations: 2 })),
}));
vi.mock('../../services/blockchainService.js', () => ({
    isBlockchainReady: vi.fn(() => true),
    getBlockchainStatistics: vi.fn(async () => ({ available: true, totalAttemptsRecorded: 3 })),
    verifyAttemptIntegrity: vi.fn(async () => ({ verified: true, match: true })),
    generateAttemptHash: vi.fn(() => '0xhash'),
}));

process.env.JWT_SECRET = 'test-secret-for-unit-tests';

import pool from '../../config/db.js';
import { generateToken } from '../../middleware/auth.js';
import researchRoutes from '../../routes/researchRoutes.js';

const query = vi.mocked(pool.query);

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/research', researchRoutes);
    return app;
}

const app = buildApp();
const adminToken = generateToken({ id: 1, role: 'admin', email: 'admin@x.com' });
const studentToken = generateToken({ id: 5, role: 'student', email: 's@x.com' });

describe('researchRoutes', () => {
    beforeEach(() => vi.clearAllMocks());

    it('requires an admin token', async () => {
        const res = await request(app)
            .get('/api/research/proctor-metrics')
            .set('Authorization', `Bearer ${studentToken}`);
        expect(res.status).toBe(403);
    });

    it('GET /proctor-metrics aggregates violation statistics', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ total_exams: '2', total_attempts: '4', avg_score: '70' }] })
            .mockResolvedValueOnce({ rows: [{ attempt_id: 1, violation_count: '2' }] });
        const res = await request(app)
            .get('/api/research/proctor-metrics')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(res.body.metrics.violations.byType[0].violation_type).toBe('MULTI_FACE');
        expect(res.body.metrics.integrityAnalysis.totalAttempts).toBe(1);
    });

    it('GET /violation-breakdown returns byType/byHour/byExam', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ violation_type: 'MULTI_FACE', count: '5' }] })
            .mockResolvedValueOnce({ rows: [{ hour: '10', count: '2' }] })
            .mockResolvedValueOnce({ rows: [{ exam_title: 'Midterm', violation_count: '5' }] });
        const res = await request(app)
            .get('/api/research/violation-breakdown')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(res.body.breakdown.byType).toHaveLength(1);
        expect(res.body.breakdown.byHour).toHaveLength(1);
        expect(res.body.breakdown.byExam).toHaveLength(1);
    });

    it('GET /blockchain-metrics returns chain statistics', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ total_attempts: '3', recorded_attempts: '3', pending_attempts: '0' }] })
            .mockResolvedValueOnce({ rows: [{ id: 1, blockchain_hash: '0xhash' }] })
            .mockResolvedValueOnce({ rows: [{ day: '2026-08-01', attempts_submitted: '3' }] });
        const res = await request(app)
            .get('/api/research/blockchain-metrics')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(res.body.blockchain.attemptCounts.total).toBe(3);
        expect(res.body.blockchain.integrityStatus).toBe('HEALTHY');
    });

    it('GET /export/violations exports the full violation dataset', async () => {
        query.mockResolvedValue({ rows: [{ id: 1, violation_type: 'MULTI_FACE' }] });
        const res = await request(app)
            .get('/api/research/export/violations')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(res.body.count).toBe(1);
        expect(res.body.data).toHaveLength(1);
    });

    it('GET /detection-accuracy computes accuracy rates', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ violation_type: 'A', count: '4' }] })
            .mockResolvedValueOnce({ rows: [{ hour: '9', count: '1' }] })
            .mockResolvedValueOnce({ rows: [{ total: '10' }] });
        const res = await request(app)
            .get('/api/research/detection-accuracy')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });
});

describe('POST /api/research/detection-quality', () => {
    beforeEach(() => vi.clearAllMocks());

    it('requires an admin token', async () => {
        const res = await request(app)
            .post('/api/research/detection-quality')
            .set('Authorization', `Bearer ${studentToken}`)
            .send({ groundTruth: [], logs: [] });
        expect(res.status).toBe(403);
    });

    it('rejects missing ground truth', async () => {
        const res = await request(app)
            .post('/api/research/detection-quality')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ logs: [] });
        expect(res.status).toBe(400);
    });

    it('rejects when neither logs nor sessionId is provided', async () => {
        const res = await request(app)
            .post('/api/research/detection-quality')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ groundTruth: [{ type: 'MULTI_FACE', timestamp: 1000 }] });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/logs.*sessionId/i);
    });

    it('computes metrics from inline logs (perfect detection)', async () => {
        const gt = [
            { type: 'MULTI_FACE', timestamp: 1000 },
            { type: 'IMPERSONATION', timestamp: 60000 },
        ];
        const logs = [
            { violation_type: 'MULTI_FACE', created_at: 1200 },
            { violation_type: 'IMPERSONATION', created_at: 61000 },
        ];
        const res = await request(app)
            .post('/api/research/detection-quality')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ groundTruth: gt, logs, toleranceMs: 3000 });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.evaluation.summary.tp).toBe(2);
        expect(res.body.evaluation.summary.macroF1).toBe(1);
        expect(res.body.evaluation.perType).toHaveLength(2);
        expect(res.body.evaluation.detectedEventCount).toBe(2);
        expect(res.body.evaluation.groundTruthEventCount).toBe(2);
    });

    it('loads logs from the database via sessionId', async () => {
        query.mockResolvedValue({
            rows: [
                { violation_type: 'TAB_SWITCH', created_at: '2026-08-01T10:00:00Z' },
                { violation_type: 'RIGHT_CLICK', created_at: '2026-08-01T10:01:00Z' },
            ]
        });
        const res = await request(app)
            .post('/api/research/detection-quality')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                sessionId: 42,
                groundTruth: [
                    { type: 'TAB_SWITCH', timestamp: '2026-08-01T10:00:01Z' },
                    { type: 'COPY_ATTEMPT', timestamp: '2026-08-01T10:02:00Z' },
                ],
                negativeWindows: 5000,
            });
        expect(res.status).toBe(200);
        // query called with the session id
        expect(query).toHaveBeenCalledWith(
            expect.stringMatching(/FROM proctor_logs WHERE session_id/i),
            [42]
        );
        // TAB_SWITCH matched (within tolerance), COPY_ATTEMPT missed,
        // RIGHT_CLICK is a false alarm
        expect(res.body.evaluation.summary.tp).toBe(1);
        expect(res.body.evaluation.summary.fp).toBe(1);
        expect(res.body.evaluation.summary.fn).toBe(1);
        // tn = 5000 - 1 = 4999 -> fpr = 1/5000
        expect(res.body.evaluation.summary.fpr).toBeCloseTo(1 / 5000, 6);
        const types = res.body.evaluation.perType.map(p => p.violationType).sort();
        expect(types).toEqual(['COPY_ATTEMPT', 'RIGHT_CLICK', 'TAB_SWITCH']);
    });

    it('propagates malformed timestamps as a 400 error', async () => {
        const res = await request(app)
            .post('/api/research/detection-quality')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                groundTruth: [{ type: 'A', timestamp: 'garbage' }],
                logs: [],
            });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Invalid timestamp/i);
    });
});
