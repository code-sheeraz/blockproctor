// test/routes/instructorRoutes.test.js
// Supertest coverage for key instructor endpoints (db + chain mocked).

import { vi, describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../config/db.js', () => ({ default: { query: vi.fn(), connect: vi.fn() } }));
vi.mock('../../services/blockchainService.js', () => ({
    recordExamOnChain: vi.fn(async () => ({ success: true, txHash: '0xexam' })),
    generateExamHash: vi.fn(() => '0xhash'),
}));

process.env.JWT_SECRET = 'test-secret-for-unit-tests';

import pool from '../../config/db.js';
import { generateToken } from '../../middleware/auth.js';
import instructorRoutes from '../../routes/instructorRoutes.js';

const query = vi.mocked(pool.query);

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/instructors', instructorRoutes);
    return app;
}

const app = buildApp();
const instructorToken = generateToken({ id: 2, role: 'instructor', email: 'i@x.com' });
const studentToken = generateToken({ id: 5, role: 'student', email: 's@x.com' });

describe('instructorRoutes', () => {
    beforeEach(() => vi.clearAllMocks());

    it('POST /login rejects bad credentials', async () => {
        query.mockResolvedValue({ rows: [] });
        const res = await request(app)
            .post('/api/instructors/login')
            .send({ email: 'i@x.com', password: 'nope' });
        expect(res.status).toBe(401);
    });

    it('POST /login succeeds with a valid bcrypt hash', async () => {
        const { hash } = await import('bcrypt');
        const passwordHash = await hash('instructor123', 4);
        query.mockResolvedValue({ rows: [{ id: 2, name: 'Dr. X', email: 'i@x.com', password_hash: passwordHash }] });
        const res = await request(app)
            .post('/api/instructors/login')
            .send({ email: 'i@x.com', password: 'instructor123' });
        expect(res.status).toBe(200);
        expect(res.body.role).toBe('instructor');
    });

    it('rejects students on protected routes', async () => {
        const res = await request(app)
            .get('/api/instructors/2/dashboard')
            .set('Authorization', `Bearer ${studentToken}`);
        expect(res.status).toBe(403);
    });

    it('GET /:instructorId/dashboard aggregates instructor data', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ id: 2, name: 'Dr. X' }] })
            .mockResolvedValueOnce({ rows: [{ count: '3' }] })
            .mockResolvedValueOnce({ rows: [{ id: 1, name: 'CS101' }] })
            .mockResolvedValueOnce({ rows: [{ id: 10, title: 'Midterm' }] })
            .mockResolvedValueOnce({ rows: [{ id: 77, score: 80 }] });
        const res = await request(app)
            .get('/api/instructors/2/dashboard')
            .set('Authorization', `Bearer ${instructorToken}`);
        expect(res.status).toBe(200);
        expect(res.body.instructor.id).toBe(2);
    });

    it('GET /:instructorId/classes lists classes', async () => {
        query.mockResolvedValue({ rows: [{ id: 1, name: 'CS101' }] });
        const res = await request(app)
            .get('/api/instructors/2/classes')
            .set('Authorization', `Bearer ${instructorToken}`);
        expect(res.status).toBe(200);
    });

    it('POST /:instructorId/classes creates a class', async () => {
        query.mockResolvedValue({ rows: [{ id: 9, name: 'CS202' }] });
        const res = await request(app)
            .post('/api/instructors/2/classes')
            .set('Authorization', `Bearer ${instructorToken}`)
            .send({ name: 'CS202', code: 'CS202', year: 2026, semester: 'Fall' });
        expect(res.status).toBe(200);
    });

    it('POST /:instructorId/exams creates an exam', async () => {
        query.mockResolvedValue({ rows: [{ id: 10 }] });
        const res = await request(app)
            .post('/api/instructors/2/exams')
            .set('Authorization', `Bearer ${instructorToken}`)
            .send({ title: 'Midterm', duration_minutes: 60, class_id: 1, questions_json: [] });
        expect(res.status).toBe(200);
        expect(res.body.exam).toBeDefined();
    });

    it('POST /:instructorId/exams/:examId/publish publishes the exam', async () => {
        query.mockResolvedValueOnce({ rows: [{ id: 10, title: 'Midterm' }] });
        query.mockResolvedValueOnce({ rows: [{ id: 10, is_published: true }] });
        const res = await request(app)
            .post('/api/instructors/2/exams/10/publish')
            .set('Authorization', `Bearer ${instructorToken}`);
        expect(res.status).toBe(200);
    });

    describe('POST /:instructorId/exams/:examId/duplicate', () => {
        const sourceExam = {
            id: 10,
            title: 'Midterm',
            description: 'Old description',
            class_id: 3,
            instructor_id: 2,
            questions_json: [{ question: 'Q1' }, { question: 'Q2' }],
            duration_minutes: 45,
            randomize_questions: true,
            is_published: true,
            start_time: '2026-01-01T00:00:00Z',
        };

        it('creates a draft copy with the same questions', async () => {
            query
                .mockResolvedValueOnce({ rows: [sourceExam] })                       // source fetch
                .mockResolvedValueOnce({ rows: [{ id: 11, title: 'Midterm (Copy)' }] }); // insert

            const res = await request(app)
                .post('/api/instructors/2/exams/10/duplicate')
                .set('Authorization', `Bearer ${instructorToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.exam.title).toBe('Midterm (Copy)');
            expect(res.body.questionCount).toBe(2);

            // INSERT params: title, description, class_id, instructor_id,
            // questions (deep copy), duration, randomize — published forced false
            const params = query.mock.calls[1][1];
            expect(params[0]).toBe('Midterm (Copy)');
            expect(params[1]).toBe('Old description');
            expect(params[2]).toBe(3);
            expect(params[3]).toBe('2'); // req.params values are strings
            expect(JSON.parse(params[4])).toEqual([{ question: 'Q1' }, { question: 'Q2' }]);
            expect(params[5]).toBe(45);
            expect(params[6]).toBe(true);
            expect(query.mock.calls[1][0]).toContain('false');
            expect(query.mock.calls[1][0]).not.toMatch(/start_time|blockchain/);
        });

        it('parses string questions_json and survives malformed JSON', async () => {
            query
                .mockResolvedValueOnce({
                    rows: [{ ...sourceExam, questions_json: 'not-json{' }]
                })
                .mockResolvedValueOnce({ rows: [{ id: 12 }] });

            const res = await request(app)
                .post('/api/instructors/2/exams/10/duplicate')
                .set('Authorization', `Bearer ${instructorToken}`);

            expect(res.status).toBe(200);
            const params = query.mock.calls[1][1];
            expect(JSON.parse(params[4])).toEqual([]);
            expect(res.body.questionCount).toBe(0);
        });

        it('returns 404 when the exam does not belong to the instructor', async () => {
            query.mockResolvedValueOnce({ rows: [] });
            const res = await request(app)
                .post('/api/instructors/2/exams/999/duplicate')
                .set('Authorization', `Bearer ${instructorToken}`);
            expect(res.status).toBe(404);
            expect(query).toHaveBeenCalledTimes(1); // no INSERT attempted
        });

        it('rejects students with 403 before any query', async () => {
            const res = await request(app)
                .post('/api/instructors/2/exams/10/duplicate')
                .set('Authorization', `Bearer ${studentToken}`);
            expect(res.status).toBe(403);
            expect(query).not.toHaveBeenCalled();
        });
    });

    describe('DELETE /:instructorId/exams/:examId', () => {
        it('does not crash when the request has no JSON body', async () => {
            // Express 5 leaves req.body undefined without a payload.
            const client = {
                query: vi.fn(async (sql) => {
                    const upper = String(sql).toUpperCase();
                    if (upper.includes('COUNT(*)')) return { rows: [{ count: '0' }] };
                    if (upper.includes('FROM EXAMS')) return { rows: [{ id: 10 }] };
                    if (upper.includes('AUDIT')) return { rows: [] };
                    if (upper.includes('DELETE FROM')) return { rows: [] };
                    if (upper.startsWith('BEGIN') || upper.startsWith('COMMIT')) return { rows: [] };
                    return { rows: [] };
                }),
                release: vi.fn(),
            };
            vi.mocked(pool.connect).mockResolvedValue(client);

            const res = await request(app)
                .delete('/api/instructors/2/exams/10')
                .set('Authorization', `Bearer ${instructorToken}`); // deliberately no .send()

            expect(res.status).toBe(200);
            expect(client.query).toHaveBeenCalledWith('COMMIT');
        });
    });

    it('GET /:instructorId/exams/:examId/results returns results', async () => {
        query.mockResolvedValue({ rows: [{ attempt_id: 77, score: 80 }] });
        const res = await request(app)
            .get('/api/instructors/2/exams/10/results')
            .set('Authorization', `Bearer ${instructorToken}`);
        expect(res.status).toBe(200);
    });
});
