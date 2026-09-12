// test/examSessionService.test.js
// Unit tests for the exam session lifecycle service (db + chain mocked).

import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../config/db.js', () => ({ default: { query: vi.fn(), connect: vi.fn() } }));
vi.mock('../services/blockchainService.js', () => ({
    recordAttemptOnChain: vi.fn(async () => ({ success: true, txHash: '0xtx' })),
    isBlockchainReady: vi.fn(() => true),
}));
vi.mock('../utils/scoring.js', async (importOriginal) => ({
    ...(await importOriginal()),
}));

import pool from '../config/db.js';
import { recordAttemptOnChain } from '../services/blockchainService.js';
import { startSession, recordHeartbeat, logViolation, submitExam, requestAccess, lockSession, unlockSession, forceSubmitOnLock } from '../services/examSessionService.js';

const poolQuery = vi.mocked(pool.query);
const poolConnect = vi.mocked(pool.connect);
const recordOnChain = vi.mocked(recordAttemptOnChain);

function makeClient() {
    const queries = [];
    const client = {
        query: vi.fn(async (sql, params) => {
            queries.push({ sql, params });
            const upper = String(sql).toUpperCase();
            if (upper.includes('FROM EXAMS') && upper.includes('IS_PUBLISHED')) {
                return { rows: [{ id: 10, class_id: 1, duration_minutes: 30, questions_json: [{ answer: 'A' }, { answer: 'B' }], randomize_questions: false }] };
            }
            if (upper.includes('FROM CLASS_ENROLLMENTS')) {
                return { rows: [{ id: 1 }] };
            }
            if (upper.includes('FROM EXAM_SESSIONS WHERE STUDENT_ID')) {
                return { rows: [] };
            }
            if (upper.includes('INSERT INTO EXAM_SESSIONS')) {
                return { rows: [{ id: 77, exam_id: 10, student_id: 5, status: 'IN_PROGRESS' }] };
            }
            if (upper.includes('UPDATE EXAM_SESSIONS SET RESULT')) {
                return { rows: [] };
            }
            if (upper.includes('INSERT INTO PROCTOR_LOGS')) {
                return { rows: [{ id: 1 }] };
            }
            if (upper.includes('INSERT INTO HEARTBEAT_LOGS')) {
                return { rows: [] };
            }
            if (upper.includes('FROM EXAM_SESSIONS WHERE ID')) {
                return { rows: [{ id: 77, status: 'IN_PROGRESS' }] };
            }
            if (upper.includes('FROM EXAMS WHERE ID')) {
                return { rows: [{ questions_json: [{ answer: 'A' }, { answer: 'B' }] }] };
            }
            if (upper.includes('UPDATE EXAM_SESSIONS')) {
                return { rows: [] };
            }
            if (upper.includes('INSERT INTO ATTEMPTS')) {
                return { rows: [{ id: 500 }] };
            }
            if (upper.includes('UPDATE PROCTOR_LOGS SET ATTEMPT_ID')) {
                return { rows: [] };
            }
            return { rows: [] };
        }),
        release: vi.fn(),
    };
    return { client, queries };
}

describe('examSessionService.startSession', () => {
    beforeEach(() => vi.clearAllMocks());

    it('creates a new session for an enrolled student of a published exam', async () => {
        const { client } = makeClient();
        poolConnect.mockResolvedValue(client);
        const result = await startSession(5, 10, { ip: '1.2.3.4' });
        expect(result.success).toBe(true);
        expect(result.resumed).toBe(false);
        expect(result.session.id).toBe(77);
        expect(result.exam).toBeDefined();
        expect(client.query).toHaveBeenCalledWith('BEGIN');
        expect(client.query).toHaveBeenCalledWith('COMMIT');
        expect(client.release).toHaveBeenCalled();
    });

    it('rejects unpublished/missing exams', async () => {
        const { client, queries } = makeClient();
        client.query.mockImplementation(async (sql) => {
            const upper = String(sql).toUpperCase();
            if (upper.includes('FROM EXAMS') && upper.includes('IS_PUBLISHED')) return { rows: [] };
            return { rows: [] };
        });
        poolConnect.mockResolvedValue(client);
        await expect(startSession(5, 10)).rejects.toThrow('Exam not found or not published');
        expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('rejects students not enrolled in the class', async () => {
        const { client } = makeClient();
        client.query.mockImplementation(async (sql) => {
            const upper = String(sql).toUpperCase();
            if (upper.includes('FROM EXAMS') && upper.includes('IS_PUBLISHED')) {
                return { rows: [{ id: 10, class_id: 1, duration_minutes: 30 }] };
            }
            if (upper.includes('FROM CLASS_ENROLLMENTS')) return { rows: [] };
            return { rows: [] };
        });
        poolConnect.mockResolvedValue(client);
        await expect(startSession(5, 10)).rejects.toThrow('Student not enrolled in this class');
    });

    it('returns LOCKED error when an existing session is locked', async () => {
        const { client } = makeClient();
        client.query.mockImplementation(async (sql) => {
            const upper = String(sql).toUpperCase();
            if (upper.includes('FROM EXAMS') && upper.includes('IS_PUBLISHED')) {
                return { rows: [{ id: 10, class_id: 1, duration_minutes: 30 }] };
            }
            if (upper.includes('FROM CLASS_ENROLLMENTS')) return { rows: [{ id: 1 }] };
            if (upper.includes('FROM EXAM_SESSIONS WHERE STUDENT_ID')) {
                return { rows: [{ id: 77, is_locked: true, lock_reason: 'Too many violations' }] };
            }
            return { rows: [] };
        });
        poolConnect.mockResolvedValue(client);
        await expect(startSession(5, 10)).rejects.toThrow('LOCKED: Too many violations');
    });
});

describe('examSessionService.submitExam', () => {
    beforeEach(() => vi.clearAllMocks());

    it('scores answers, upserts the attempt, and triggers on-chain recording', async () => {
        const { client } = makeClient();
        poolConnect.mockResolvedValue(client);
        // recordAttemptOnChainAsync runs on pool.query (module pool)
        poolQuery
            .mockResolvedValueOnce({ rows: [{ violation_type: 'A' }] })   // proctor logs
            .mockResolvedValueOnce({ rows: [{ id: 500, exam_id: 10, student_id: 5, score: 100 }] }) // attempt
            .mockResolvedValue({ rows: [] });                              // UPDATE attempts
        const result = await submitExam(77, 5, 10, ['A', 'B']);
        expect(result.success).toBe(true);
        expect(result.score).toBe(100);
        expect(result.correctCount).toBe(2);
        expect(result.attemptId).toBe(500);
        // async fire-and-forget: wait a tick for recordAttemptOnChain
        await vi.waitFor(() => expect(recordOnChain).toHaveBeenCalled());
        expect(recordOnChain).toHaveBeenCalledWith(
            expect.objectContaining({ id: 500 }), [{ violation_type: 'A' }]
        );
    });

    it('rejects when the session is already completed', async () => {
        const { client } = makeClient();
        client.query.mockImplementation(async (sql) => {
            const upper = String(sql).toUpperCase();
            if (upper.includes('FROM EXAM_SESSIONS WHERE ID')) {
                return { rows: [{ id: 77, status: 'COMPLETED' }] };
            }
            return { rows: [] };
        });
        poolConnect.mockResolvedValue(client);
        await expect(submitExam(77, 5, 10, [])).rejects.toThrow('Exam already submitted');
    });

    it('rejects unknown sessions', async () => {
        const { client } = makeClient();
        client.query.mockImplementation(async (sql) => {
            const upper = String(sql).toUpperCase();
            if (upper.includes('FROM EXAM_SESSIONS WHERE ID')) return { rows: [] };
            return { rows: [] };
        });
        poolConnect.mockResolvedValue(client);
        await expect(submitExam(999, 5, 10, [])).rejects.toThrow('Session not found');
    });
});

describe('examSessionService helpers', () => {
    beforeEach(() => vi.clearAllMocks());

    it('recordHeartbeat returns locked status for a locked session', async () => {
        const { client } = makeClient();
        client.query.mockImplementation(async (sql) => {
            if (String(sql).includes('FROM exam_sessions WHERE id')) {
                return { rows: [{ id: 1, is_locked: true, lock_reason: 'violations' }] };
            }
            return { rows: [] };
        });
        poolConnect.mockResolvedValue(client);
        const result = await recordHeartbeat(1, 5, 10, 100, {});
        expect(result.locked).toBe(true);
        expect(result.lockReason).toBe('violations');
    });

    it('recordHeartbeat reports a missing session', async () => {
        const { client } = makeClient();
        client.query.mockResolvedValue({ rows: [] });
        poolConnect.mockResolvedValue(client);
        const result = await recordHeartbeat(1, 5, 10, 100, {});
        expect(result.success).toBe(false);
        expect(result.error).toBe('Session not found');
    });

    it('logViolation locks a severe violation (FACE_MISMATCH) immediately', async () => {
        const { client } = makeClient();
        client.query.mockImplementation(async (sql) => {
            const upper = String(sql).toUpperCase();
            if (upper.includes('FROM EXAM_SESSIONS ES') && upper.includes('JOIN EXAMS E')) {
                return { rows: [{ id: 77, is_locked: false, warning_count: 0, violation_count: 0, max_warnings: 3, max_violations: 5, auto_lock_enabled: true }] };
            }
            if (upper.includes('UPDATE EXAM_SESSIONS') && upper.includes('IS_LOCKED')) {
                return { rows: [] };
            }
            return { rows: [] };
        });
        poolConnect.mockResolvedValue(client);
        const result = await logViolation(77, 5, 10, 'FACE_MISMATCH', 'not you');
        expect(result.locked).toBe(true);
        expect(result.isSevere).toBe(true);
        expect(result.violationCount).toBe(1);
    });

    it('logViolation only counts a warning-level violation', async () => {
        const { client } = makeClient();
        client.query.mockImplementation(async (sql) => {
            const upper = String(sql).toUpperCase();
            if (upper.includes('FROM EXAM_SESSIONS ES') && upper.includes('JOIN EXAMS E')) {
                return { rows: [{ id: 77, is_locked: false, warning_count: 0, violation_count: 0, max_warnings: 3, max_violations: 5, auto_lock_enabled: true }] };
            }
            if (upper.includes('UPDATE EXAM_SESSIONS') && upper.includes('WARNING_COUNT')) {
                return { rows: [] };
            }
            return { rows: [] };
        });
        poolConnect.mockResolvedValue(client);
        const result = await logViolation(77, 5, 10, 'RIGHT_CLICK', 'clicked');
        expect(result.locked).toBe(false);
        expect(result.warningCount).toBe(1);
        expect(result.violationCount).toBe(0);
    });

    it('requestAccess inserts a row via pool.query', async () => {
        poolQuery.mockResolvedValue({ rows: [{ id: 9 }] });
        const result = await requestAccess(5, 10, 'technical', 'camera broke');
        expect(poolQuery).toHaveBeenCalledTimes(1);
        expect(result).toBeDefined();
    });

    it('lockSession updates the session as locked via pool.query', async () => {
        poolQuery.mockResolvedValue({ rows: [{ id: 77, is_locked: true }] });
        const result = await lockSession(77, 'violations');
        expect(poolQuery).toHaveBeenCalled();
        expect(result.is_locked).toBe(true);
    });

    describe('unlockSession', () => {
        function makeUnlockClient(sessionRow) {
            const calls = [];
            const client = {
                query: vi.fn(async (sql, params) => {
                    calls.push({ sql: String(sql), params });
                    const upper = String(sql).toUpperCase();
                    if (upper.includes('FROM EXAM_SESSIONS ES')) {
                        return { rows: [sessionRow] };
                    }
                    if (upper.includes('FROM ATTEMPTS A')) {
                        return { rows: [sessionRow.status === 'TERMINATED' ? {
                            id: 500, exam_id: 10, student_id: 5, score: 40,
                            correct_count: 2, total_questions: 5,
                            answers_json: { 0: 'A' }, started_at: null, submitted_at: null,
                            blockchain_hash: '0xchainhash', blockchain_tx: '0xtx', session_id: 77,
                            student_name: 'Stu', student_identifier: 'S1', exam_title: 'Midterm',
                        } : []] };
                    }
                    if (upper.includes('INSERT INTO AUDIT_ATTEMPTS')) return { rows: [] };
                    if (upper.includes('UPDATE PROCTOR_LOGS SET ATTEMPT_ID = NULL')) return { rows: [] };
                    if (upper.includes('DELETE FROM ATTEMPTS')) return { rowCount: 1 };
                    if (upper.includes('SELECT * FROM EXAM_SESSIONS WHERE ID')) {
                        return { rows: [{ ...sessionRow, is_locked: false }] };
                    }
                    if (upper.includes('INSERT INTO PROCTOR_LOGS')) return { rows: [{ id: 9 }] };
                    return { rows: [] };
                }),
                release: vi.fn(),
            };
            return { client, calls };
        }

        it('clears only the flags for an IN_PROGRESS violation-lock (resume in place)', async () => {
            const { client, calls } = makeUnlockClient({
                id: 77, status: 'IN_PROGRESS', student_id: 5, exam_id: 10, duration_minutes: 30,
            });
            poolConnect.mockResolvedValue(client);

            const result = await unlockSession(77, 'false alarm');

            expect(result).toMatchObject({ id: 77, is_locked: false });
            const updates = calls.filter(c => c.sql.toUpperCase().includes('UPDATE EXAM_SESSIONS'));
            expect(updates).toHaveLength(1);
            // No status reset, no attempt archival for resume-in-place unlocks
            expect(updates[0].sql).not.toMatch(/NOT_STARTED/i);
            expect(calls.some(c => c.sql.toUpperCase().includes('AUDIT_ATTEMPTS'))).toBe(false);
            expect(calls.some(c => c.sql.toUpperCase().includes('DELETE FROM ATTEMPTS'))).toBe(false);
            expect(client.query).toHaveBeenCalledWith('COMMIT');
        });

        it('fully resets a TERMINATED session: archives the attempt and grants a fresh retake', async () => {
            const { client, calls } = makeUnlockClient({
                id: 77, status: 'TERMINATED', student_id: 5, exam_id: 10, duration_minutes: 30,
            });
            poolConnect.mockResolvedValue(client);

            const result = await unlockSession(77, 'verified technical issue');

            expect(result).toMatchObject({ id: 77, is_locked: false });

            // Session reset to NOT_STARTED with the full timer restored (30min -> 1800s)
            const reset = calls.find(c => c.sql.toUpperCase().includes("STATUS = 'NOT_STARTED'"));
            expect(reset).toBeDefined();
            expect(reset.params).toContain(1800);

            // Prior attempt archived WITH its blockchain references preserved...
            const audit = calls.find(c => c.sql.toUpperCase().includes('INSERT INTO AUDIT_ATTEMPTS'));
            expect(audit).toBeDefined();
            expect(audit.params).toContain('0xchainhash');
            expect(audit.params).toContain('0xtx');

            // ...logs detached from the doomed attempt id...
            expect(calls.some(c => c.sql.toUpperCase().includes('UPDATE PROCTOR_LOGS SET ATTEMPT_ID = NULL'))).toBe(true);
            // ...and the attempt deleted so the retake mints a NEW id.
            expect(calls.some(c => c.sql.toUpperCase().includes('DELETE FROM ATTEMPTS'))).toBe(true);

            expect(client.query).toHaveBeenCalledWith('COMMIT');
        });

        it('returns null (and rolls back) when the session does not exist', async () => {
            const { client, calls } = makeUnlockClient(null);
            // override: no session found
            client.query.mockImplementation(async (sql) => {
                calls.push({ sql: String(sql) });
                if (String(sql).toUpperCase().includes('FROM EXAM_SESSIONS ES')) return { rows: [] };
                return { rows: [] };
            });
            poolConnect.mockResolvedValue(client);

            const result = await unlockSession(999, 'x');
            expect(result).toBeNull();
            expect(client.query).toHaveBeenCalledWith('ROLLBACK');
        });
    });
});


describe('forceSubmitOnLock idempotency guard', () => {
    it('is a no-op when the attempt is already anchored on-chain', async () => {
        const calls = [];
        const client = {
            query: vi.fn(async (sql, params) => {
                calls.push({ sql: String(sql), params });
                const upper = String(sql).toUpperCase();
                if (upper.includes('FROM ATTEMPTS WHERE EXAM_ID')) {
                    return { rows: [{ id: 500, score: '40', blockchain_hash: '0xanchored' }] };
                }
                if (upper.includes('FROM EXAM_SESSIONS ES')) return { rows: [{ id: 77, status: 'TERMINATED' }] };
                return { rows: [] };
            }),
            release: vi.fn(),
        };
        poolConnect.mockResolvedValue(client);

        const result = await forceSubmitOnLock(77, 5, 10, ['A'], 'locked', 100);

        expect(result).toMatchObject({ success: true, alreadyFinalized: true, terminated: true, score: 40 });
        // No attempts mutation and no re-anchor for an already-anchored attempt
        expect(calls.some(c => c.sql.toUpperCase().includes('INSERT INTO ATTEMPTS'))).toBe(false);
        expect(calls.some(c => c.sql.toUpperCase().includes('UPDATE PROCTOR_LOGS SET ATTEMPT_ID'))).toBe(false);
        expect(recordOnChain).not.toHaveBeenCalled();
        expect(client.query).toHaveBeenCalledWith('COMMIT');
    });

    it('proceeds with the normal finalize when nothing is anchored yet', async () => {
        const client = {
            query: vi.fn(async (sql) => {
                const upper = String(sql).toUpperCase();
                if (upper.includes('FROM ATTEMPTS WHERE EXAM_ID')) return { rows: [] };
                if (upper.includes('FROM EXAM_SESSIONS ES')) return { rows: [{ id: 77, status: 'TERMINATED' }] };
                if (upper.includes('FROM EXAMS WHERE ID')) return { rows: [{ questions_json: [{ answer: 'A' }, { answer: 'B' }] }] };
                if (upper.includes('UPDATE EXAM_SESSIONS')) return { rows: [] };
                if (upper.includes('INSERT INTO ATTEMPTS')) return { rows: [{ id: 501, blockchain_hash: null }] };
                if (upper.includes('UPDATE PROCTOR_LOGS SET ATTEMPT_ID')) return { rows: [] };
                return { rows: [] };
            }),
            release: vi.fn(),
        };
        poolConnect.mockResolvedValue(client);

        const result = await forceSubmitOnLock(77, 5, 10, ['A', 'B'], 'locked', 100);
        expect(result.success).toBe(true);
        expect(result.alreadyFinalized).toBeUndefined();
        await vi.waitFor(() => expect(recordOnChain).toHaveBeenCalled());
    });
});
