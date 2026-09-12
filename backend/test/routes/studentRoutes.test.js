// test/routes/studentRoutes.test.js
// Supertest coverage for the student dashboard endpoints.

import { vi, describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../config/db.js', () => ({ default: { query: vi.fn() } }));

process.env.JWT_SECRET = 'test-secret-for-unit-tests';

import pool from '../../config/db.js';
import { generateToken } from '../../middleware/auth.js';
import studentRoutes from '../../routes/studentRoutes.js';

const query = vi.mocked(pool.query);

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/students', studentRoutes);
    return app;
}

const app = buildApp();
const studentToken = generateToken({ id: 5, role: 'student', email: 's@x.com' });
const adminToken = generateToken({ id: 1, role: 'admin', email: 'a@x.com' });
const instructorToken = generateToken({ id: 2, role: 'instructor', email: 'i@x.com' });

describe('studentRoutes', () => {
    beforeEach(() => vi.clearAllMocks());

    it('rejects instructors', async () => {
        const res = await request(app)
            .get('/api/students/5/dashboard')
            .set('Authorization', `Bearer ${instructorToken}`);
        expect(res.status).toBe(403);
    });

    it('GET /:studentId/dashboard aggregates student data', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ id: 5, name: 'S', has_face: true, enrollment_status: 'enrolled' }] })
            .mockResolvedValueOnce({ rows: [{ id: 1, name: 'CS101' }] })
            .mockResolvedValueOnce({ rows: [{ id: 10, title: 'Midterm' }] })
            .mockResolvedValueOnce({ rows: [{ id: 77, score: 80 }] });
        const res = await request(app)
            .get('/api/students/5/dashboard')
            .set('Authorization', `Bearer ${studentToken}`);
        expect(res.status).toBe(200);
        expect(res.body.student.id).toBe(5);
        expect(res.body.classes).toHaveLength(1);
        expect(res.body.exams).toHaveLength(1);
        expect(res.body.recentAttempts).toHaveLength(1);
        expect(query).toHaveBeenCalledTimes(4);
    });

    it('GET /:studentId/dashboard returns 404 for missing students', async () => {
        query.mockResolvedValueOnce({ rows: [] });
        const res = await request(app)
            .get('/api/students/999/dashboard')
            .set('Authorization', `Bearer ${studentToken}`);
        expect(res.status).toBe(404);
    });

    it('GET /:studentId/exams/available only lists published exams', async () => {
        query.mockResolvedValueOnce({ rows: [{ id: 5, enrollment_status: 'enrolled' }] });
        query.mockResolvedValueOnce({ rows: [{ id: 10, title: 'Midterm', is_published: true }] });
        const res = await request(app)
            .get('/api/students/5/exams/available')
            .set('Authorization', `Bearer ${studentToken}`);
        expect(res.status).toBe(200);
        expect(res.body.exams).toHaveLength(1);
    });

    it('GET /:studentId/attempts lists attempts', async () => {
        query.mockResolvedValueOnce({ rows: [{ id: 77, score: 80 }] });
        const res = await request(app)
            .get('/api/students/5/attempts')
            .set('Authorization', `Bearer ${studentToken}`);
        expect(res.status).toBe(200);
        expect(res.body.attempts[0].score).toBe(80);
    });

    it('GET /:studentId/classes lists classes', async () => {
        query.mockResolvedValue({ rows: [{ id: 1, name: 'CS101' }] });
        const res = await request(app)
            .get('/api/students/5/classes')
            .set('Authorization', `Bearer ${studentToken}`);
        expect(res.status).toBe(200);
    });
});
