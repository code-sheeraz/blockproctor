// test/routes/authRoutes.test.js
// Supertest coverage for the auth route (register + unified login).

import { vi, describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../config/db.js', () => ({ default: { query: vi.fn() } }));

process.env.JWT_SECRET = 'test-secret-for-unit-tests';

import pool from '../../config/db.js';
import authRoutes from '../../routes/authRoutes.js';

const query = vi.mocked(pool.query);

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
    return app;
}

const app = buildApp();

describe('POST /api/auth/register', () => {
    beforeEach(() => vi.clearAllMocks());

    it('registers a student with pending_admin status and returns a token', async () => {
        query.mockResolvedValue({
            rows: [{ id: 42, name: 'Jane', email: 'jane@uni.edu', role: 'student', enrollment_status: 'pending_admin' }]
        });
        const res = await request(app)
            .post('/api/auth/register')
            .send({ name: 'Jane', email: 'jane@uni.edu', password: 'secret1', student_id: 'STU001', department_id: 1, batch_id: 2 });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.user.enrollment_status).toBe('pending_admin');
        expect(res.body.token).toBeTruthy();
        const params = query.mock.calls[0][1];
        expect(params[7]).toBe('pending_admin');
        expect(params[2]).toMatch(/^\$2[aby]\$/); // bcrypt hash
    });

    it('returns 400 when required fields are missing', async () => {
        const res = await request(app).post('/api/auth/register').send({ name: 'X' });
        expect(res.status).toBe(400);
        expect(res.body.message).toContain('Missing required fields');
        expect(query).not.toHaveBeenCalled();
    });

    it('returns 400 for a duplicate email (23505)', async () => {
        query.mockRejectedValue({ code: '23505' });
        const res = await request(app)
            .post('/api/auth/register')
            .send({ name: 'X', email: 'dup@uni.edu', password: 'secret1' });
        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Email already exists');
    });
});

describe('POST /api/auth/login', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns 400 without a role', async () => {
        const res = await request(app).post('/api/auth/login').send({ email: 'a@b.c', password: 'x' });
        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Please select your role');
    });

    it('logs in an admin with a valid bcrypt hash', async () => {
        const { hash } = await import('bcrypt');
        const passwordHash = await hash('admin123', 4);
        query.mockResolvedValue({
            rows: [{ id: 1, name: 'Admin', email: 'admin@x.com', password_hash: passwordHash, is_super_admin: true }]
        });
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'admin@x.com', password: 'admin123', role: 'admin' });
        expect(res.status).toBe(200);
        expect(res.body.user.role).toBe('admin');
        expect(res.body.token).toBeTruthy();
    });

    it('rejects a wrong admin password', async () => {
        const { hash } = await import('bcrypt');
        const passwordHash = await hash('admin123', 4);
        query.mockResolvedValue({
            rows: [{ id: 1, name: 'Admin', email: 'admin@x.com', password_hash: passwordHash, is_super_admin: true }]
        });
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'admin@x.com', password: 'wrong', role: 'admin' });
        expect(res.status).toBe(401);
        expect(res.body.message).toContain('Invalid admin credentials');
    });

    it('logs in an instructor with department name', async () => {
        const { hash } = await import('bcrypt');
        const passwordHash = await hash('instructor123', 4);
        query.mockResolvedValue({
            rows: [{ id: 2, name: 'Dr. X', email: 'i@x.com', password_hash: passwordHash, department_name: 'CS' }]
        });
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'i@x.com', password: 'instructor123', role: 'instructor' });
        expect(res.status).toBe(200);
        expect(res.body.user.role).toBe('instructor');
        expect(res.body.user.password_hash).toBeUndefined();
    });

    it('logs in a student and returns enrollment data', async () => {
        const { hash } = await import('bcrypt');
        const passwordHash = await hash('student123', 4);
        query.mockResolvedValue({
            rows: [{
                id: 3, name: 'S', email: 's@x.com', password_hash: passwordHash,
                role: 'student', enrollment_status: 'enrolled', student_id: 'STU1'
            }]
        });
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 's@x.com', password: 'student123', role: 'student' });
        expect(res.status).toBe(200);
        expect(res.body.user.enrollment_status).toBe('enrolled');
    });

    it('rejects students without a password_hash', async () => {
        query.mockResolvedValue({ rows: [{ id: 3, email: 's@x.com', password_hash: null }] });
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 's@x.com', password: 'student123', role: 'student' });
        expect(res.status).toBe(401);
    });

    it('returns 400 for an unknown role', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'a@b.c', password: 'x', role: 'superuser' });
        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Invalid role selected');
    });
});

describe('GET /api/auth/registration-options', () => {
    it('returns departments and active batches', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ id: 1, name: 'IT' }] })
            .mockResolvedValueOnce({ rows: [{ id: 2, name: '2024', year: 2024 }] });
        const res = await request(app).get('/api/auth/registration-options');
        expect(res.status).toBe(200);
        expect(res.body.departments).toEqual([{ id: 1, name: 'IT' }]);
        expect(res.body.batches).toHaveLength(1);
    });
});

describe('GET /api/auth/enrollment-status/:userId', () => {
    it('returns the user enrollment status with face flag', async () => {
        query.mockResolvedValue({
            rows: [{ id: 3, name: 'S', email: 's@x.com', enrollment_status: 'pending_face', has_face: false }]
        });
        const res = await request(app).get('/api/auth/enrollment-status/3');
        expect(res.status).toBe(200);
        expect(res.body.user.has_face).toBe(false);
    });

    it('returns 404 for a missing user', async () => {
        query.mockResolvedValue({ rows: [] });
        const res = await request(app).get('/api/auth/enrollment-status/999');
        expect(res.status).toBe(404);
    });
});
