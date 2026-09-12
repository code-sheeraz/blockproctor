// test/routes/enrollRoutes.test.js
// Supertest coverage for face enrollment upload (ownership + validation).

import { vi, describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../config/db.js', () => ({ default: { query: vi.fn() } }));

process.env.JWT_SECRET = 'test-secret-for-unit-tests';

import pool from '../../config/db.js';
import { generateToken } from '../../middleware/auth.js';
import enrollRoutes from '../../routes/enrollRoutes.js';

const query = vi.mocked(pool.query);

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/enroll', enrollRoutes);
    return app;
}

const app = buildApp();
const studentToken = generateToken({ id: 5, role: 'student', email: 's@x.com' });
const otherStudentToken = generateToken({ id: 9, role: 'student', email: 'o@x.com' });

const validPayload = {
    faceDescriptor: [0.1, 0.2, 0.3],
    photoBase64: 'data:image/jpeg;base64,xxx',
};

describe('POST /api/enroll/upload', () => {
    beforeEach(() => vi.clearAllMocks());

    it('requires authentication', async () => {
        const res = await request(app).post('/api/enroll/upload').send(validPayload);
        expect(res.status).toBe(401);
        expect(query).not.toHaveBeenCalled();
    });

    it('requires faceDescriptor and photoBase64', async () => {
        const res = await request(app)
            .post('/api/enroll/upload')
            .set('Authorization', `Bearer ${studentToken}`)
            .send({ faceDescriptor: [1] });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/photoBase64/i);
        expect(query).not.toHaveBeenCalled();
    });

    it('stores face data against the TOKEN identity, ignoring body userId', async () => {
        query.mockResolvedValue({ rows: [{ id: 5, enrollment_status: 'pending_face' }] });
        const res = await request(app)
            .post('/api/enroll/upload')
            .set('Authorization', `Bearer ${studentToken}`)
            .send({ ...validPayload, userId: 999 }); // attacker-supplied id must be ignored
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);

        // call[0] = user existence check; call[1] = UPDATE users SET ... WHERE id=$3
        const updateParams = query.mock.calls[1][1];
        expect(updateParams[2]).toBe(5); // token identity
        expect(updateParams[0]).toBe(JSON.stringify([0.1, 0.2, 0.3]));
        expect(updateParams[1]).toBe(validPayload.photoBase64);
    });

    it('never lets one student overwrite another student’s biometric data', async () => {
        query.mockResolvedValue({ rows: [{ id: 5, enrollment_status: 'pending_face' }] });
        // Student 9 tries to write while claiming userId 5 in the URL-less body:
        const res = await request(app)
            .post('/api/enroll/upload')
            .set('Authorization', `Bearer ${otherStudentToken}`)
            .send({ ...validPayload, userId: 5 });
        expect(res.status).toBe(200);
        const updateParams = query.mock.calls[1][1]; // call[1] = UPDATE
        expect(updateParams[2]).toBe(9); // still the token owner, not 5
    });

    it('returns 404 when the user does not exist', async () => {
        query.mockResolvedValue({ rows: [] });
        const res = await request(app)
            .post('/api/enroll/upload')
            .set('Authorization', `Bearer ${studentToken}`)
            .send(validPayload);
        expect(res.status).toBe(404);
    });

    it('maps database errors to a 500 without leaking internals in success flag', async () => {
        query.mockRejectedValue(new Error('boom'));
        const res = await request(app)
            .post('/api/enroll/upload')
            .set('Authorization', `Bearer ${studentToken}`)
            .send(validPayload);
        expect(res.status).toBe(500);
        expect(res.body.success).toBe(false);
    });
});
