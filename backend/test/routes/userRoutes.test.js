// test/routes/userRoutes.test.js
// Supertest coverage for the user endpoints.

import { vi, describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../config/db.js', () => ({ default: { query: vi.fn() } }));

process.env.JWT_SECRET = 'test-secret-for-unit-tests';

import pool from '../../config/db.js';
import { generateToken } from '../../middleware/auth.js';
import userRoutes from '../../routes/userRoutes.js';

const query = vi.mocked(pool.query);

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/users', userRoutes);
    return app;
}

const app = buildApp();
const token = generateToken({ id: 5, role: 'student', email: 's@x.com' });

describe('userRoutes', () => {
    beforeEach(() => vi.clearAllMocks());

    it('requires authentication', async () => {
        const res = await request(app).get('/api/users/5/enrollment-status');
        expect(res.status).toBe(401);
    });

    it('GET /:userId/enrollment-status returns the status', async () => {
        query.mockResolvedValue({ rows: [{ enrollment_status: 'enrolled' }] });
        const res = await request(app)
            .get('/api/users/5/enrollment-status')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.enrollment_status).toBe('enrolled');
    });

    it('GET /:userId/enrollment-status returns 404 for unknown users', async () => {
        query.mockResolvedValue({ rows: [] });
        const res = await request(app)
            .get('/api/users/999/enrollment-status')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(404);
    });

    it('GET /:userId/face parses a JSON descriptor', async () => {
        query.mockResolvedValue({ rows: [{ face_descriptor: JSON.stringify([1, 2, 3]) }] });
        const res = await request(app)
            .get('/api/users/5/face')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.faceDescriptor).toEqual([1, 2, 3]);
    });

    it('GET /:userId/face returns 404 when not enrolled', async () => {
        query.mockResolvedValue({ rows: [{ face_descriptor: null }] });
        const res = await request(app)
            .get('/api/users/5/face')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(404);
    });

    it('POST /:userId/log rounds the trust score to an integer', async () => {
        query.mockResolvedValue({ rows: [{ id: 7 }] });
        const res = await request(app)
            .post('/api/users/5/log')
            .set('Authorization', `Bearer ${token}`)
            .send({ examId: 1, type: 'MULTI_FACE', description: 'two', trustScore: 80.299999, metadata: { a: 1 } });
        expect(res.status).toBe(200);
        expect(res.body.logId).toBe(7);
        const params = query.mock.calls[0][1];
        expect(params[4]).toBe(80);
    });

    it('PUT /:userId/photo requires photo data', async () => {
        const res = await request(app)
            .put('/api/users/5/photo')
            .set('Authorization', `Bearer ${token}`)
            .send({});
        expect(res.status).toBe(400);
    });

    it('PUT /:userId/photo saves the photo', async () => {
        query.mockResolvedValue({ rows: [] });
        const res = await request(app)
            .put('/api/users/5/photo')
            .set('Authorization', `Bearer ${token}`)
            .send({ photo: 'data:image/jpeg;base64,xxx' });
        expect(res.status).toBe(200);
        expect(query.mock.calls[0][1]).toEqual(['data:image/jpeg;base64,xxx', '5']);
    });

    it('GET /:userId/photo returns the saved photo', async () => {
        query.mockResolvedValue({ rows: [{ face_verification_photo: 'data:image/jpeg;base64,xxx' }] });
        const res = await request(app)
            .get('/api/users/5/photo')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.photo).toBe('data:image/jpeg;base64,xxx');
    });

    it('GET /:userId/photo returns 404 when missing', async () => {
        query.mockResolvedValue({ rows: [{ face_verification_photo: null }] });
        const res = await request(app)
            .get('/api/users/5/photo')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(404);
    });
});

describe('userRoutes ownership guards (IDOR)', () => {
    const adminToken = generateToken({ id: 1, role: 'admin', email: 'a@x.com' });

    beforeEach(() => vi.clearAllMocks());

    it('GET /:userId/face rejects another student’s descriptor with 403', async () => {
        const res = await request(app)
            .get('/api/users/9/face')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(403);
        expect(query).not.toHaveBeenCalled();
    });

    it('GET /:userId/face allows an admin to fetch any descriptor', async () => {
        query.mockResolvedValue({ rows: [{ face_descriptor: JSON.stringify([7, 8]) }] });
        const res = await request(app)
            .get('/api/users/9/face')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(res.body.faceDescriptor).toEqual([7, 8]);
    });

    it('POST /:userId/log rejects injecting logs for another student', async () => {
        const res = await request(app)
            .post('/api/users/9/log')
            .set('Authorization', `Bearer ${token}`)
            .send({ examId: 1, type: 'MULTI_FACE', description: 'fake' });
        expect(res.status).toBe(403);
        expect(query).not.toHaveBeenCalled();
    });

    it('POST /:userId/log still works for the owner', async () => {
        query.mockResolvedValue({ rows: [{ id: 11 }] });
        const res = await request(app)
            .post('/api/users/5/log')
            .set('Authorization', `Bearer ${token}`)
            .send({ examId: 1, type: 'MULTI_FACE', description: 'two' });
        expect(res.status).toBe(200);
        expect(res.body.logId).toBe(11);
    });

    it('PUT /:userId/photo rejects overwriting another student’s photo', async () => {
        const res = await request(app)
            .put('/api/users/9/photo')
            .set('Authorization', `Bearer ${token}`)
            .send({ photo: 'data:image/jpeg;base64,evil' });
        expect(res.status).toBe(403);
        expect(query).not.toHaveBeenCalled();
    });

    it('GET /:userId/photo rejects reading another student’s photo', async () => {
        const res = await request(app)
            .get('/api/users/9/photo')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(403);
        expect(query).not.toHaveBeenCalled();
    });

    it('rejects a non-numeric user id', async () => {
        const res = await request(app)
            .get('/api/users/abc/face')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(400);
    });
});
