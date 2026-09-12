// test/proctorService.test.js
// Unit tests for the proctor violation service (db mocked).

import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../config/db.js', () => ({
    default: { query: vi.fn() }
}));

import db from '../config/db.js';
import {
    logViolation,
    getViolationsForAttempt,
    getViolationsForSession,
    generateViolationsHash,
    getViolationStatistics,
    getProctorSummary
} from '../services/proctorService.js';

const query = vi.mocked(db.query);

describe('proctorService.logViolation', () => {
    beforeEach(() => query.mockReset());

    it('inserts with rounded integer trust score', async () => {
        query.mockResolvedValue({ rows: [{ id: 1 }] });
        await logViolation({
            studentId: 10, examId: 20, attemptId: 30,
            type: 'MULTI_FACE', description: 'two faces', trustScore: 87.6, metadata: { faces: 2 }
        });
        expect(query).toHaveBeenCalledTimes(1);
        const [sql, params] = query.mock.calls[0];
        expect(sql).toContain('INSERT INTO proctor_logs');
        expect(params).toEqual([10, 20, 30, 'MULTI_FACE', 'two faces', 88, JSON.stringify({ faces: 2 })]);
    });

    it('defaults trust score to 100 and attempt_id to null when absent', async () => {
        query.mockResolvedValue({ rows: [{ id: 2 }] });
        await logViolation({ studentId: 1, examId: 2, type: 'ABSENCE', description: 'gone' });
        const params = query.mock.calls[0][1];
        expect(params[2]).toBeNull();
        expect(params[5]).toBe(100);
    });

    it('returns the inserted row', async () => {
        query.mockResolvedValue({ rows: [{ id: 99, violation_type: 'HEAD_TURN_LEFT' }] });
        const row = await logViolation({ studentId: 1, examId: 2, type: 'HEAD_TURN_LEFT' });
        expect(row.id).toBe(99);
    });
});

describe('proctorService getters', () => {
    it('getViolationsForAttempt queries by attempt and orders by time', async () => {
        query.mockResolvedValue({ rows: [{ id: 1 }] });
        await getViolationsForAttempt(7);
        expect(query.mock.calls[0][1]).toEqual([7]);
        expect(query.mock.calls[0][0]).toContain('ORDER BY created_at ASC');
    });

    it('getViolationsForSession queries by student and exam', async () => {
        query.mockResolvedValue({ rows: [] });
        await getViolationsForSession(1, 2);
        expect(query.mock.calls[0][1]).toEqual([1, 2]);
    });
});

describe('proctorService.generateViolationsHash', () => {
    beforeEach(() => query.mockReset());

    it('returns a deterministic hash with count 0 for no violations', async () => {
        query.mockResolvedValue({ rows: [] });
        const result = await generateViolationsHash(1, 2);
        expect(result.count).toBe(0);
        expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
        const again = await generateViolationsHash(1, 2);
        expect(result.hash).toBe(again.hash);
    });

    it('hashes the normalized violation data', async () => {
        query.mockResolvedValue({
            rows: [
                { violation_type: 'MULTI_FACE', description: 'd1', trust_score: 60, created_at: '2026-01-01' }
            ]
        });
        const result = await generateViolationsHash(1, 2);
        expect(result.count).toBe(1);
        expect(result.violations).toEqual([
            { type: 'MULTI_FACE', description: 'd1', trustScore: 60, timestamp: '2026-01-01' }
        ]);
        expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
        // different violation content must produce a different hash
        query.mockResolvedValue({
            rows: [
                { violation_type: 'HEAD_TURN_LEFT', description: 'd2', trust_score: 90, created_at: '2026-01-01' }
            ]
        });
        const other = await generateViolationsHash(1, 2);
        expect(result.hash).not.toBe(other.hash);
    });
});

describe('proctorService.getViolationStatistics', () => {
    it('returns byType and totals from two queries', async () => {
        query.mockResolvedValueOnce({ rows: [{ violation_type: 'MULTI_FACE', count: '3' }] });
        query.mockResolvedValueOnce({ rows: [{ total_violations: '3' }] });
        const stats = await getViolationStatistics();
        expect(stats.byType).toEqual([{ violation_type: 'MULTI_FACE', count: '3' }]);
        expect(stats.totals).toEqual({ total_violations: '3' });
    });
});

describe('proctorService.getProctorSummary', () => {
    it('groups violations by type and computes min/avg trust', async () => {
        query.mockResolvedValue({
            rows: [
                { violation_type: 'A', description: 'x', trust_score: 80, created_at: 't1' },
                { violation_type: 'A', description: 'y', trust_score: 60, created_at: 't2' },
                { violation_type: 'B', description: 'z', trust_score: null, created_at: 't3' }
            ]
        });
        const summary = await getProctorSummary(5);
        expect(summary.attemptId).toBe(5);
        expect(summary.totalViolations).toBe(3);
        expect(summary.violationsByType.A.count).toBe(2);
        expect(summary.violationsByType.B.count).toBe(1);
        expect(summary.minTrustScore).toBe(60);
        expect(summary.avgTrustScore).toBe(70);
        expect(summary.timeline).toHaveLength(3);
    });

    it('returns 100 trust defaults when no violations exist', async () => {
        query.mockResolvedValue({ rows: [] });
        const summary = await getProctorSummary(5);
        expect(summary.totalViolations).toBe(0);
        expect(summary.minTrustScore).toBe(100);
        expect(summary.avgTrustScore).toBe(100);
    });
});
