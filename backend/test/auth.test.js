// test/auth.test.js
// Unit tests for the JWT auth middleware (no DB/network required).

import assert from 'assert';
import { authenticate, authorize, generateToken } from '../middleware/auth.js';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'test-secret-for-auth-tests-only-1234567890';
process.env.JWT_EXPIRES_IN = '1h';

function mockRes() {
    const res = {};
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (body) => { res.body = body; return res; };
    return res;
}

describe('authenticate middleware', () => {
    it('rejects requests without an Authorization header', () => {
        const req = { headers: {} };
        const res = mockRes();
        let nextCalled = false;
        authenticate(req, res, () => { nextCalled = true; });
        assert.strictEqual(res.statusCode, 401);
        assert.strictEqual(nextCalled, false);
    });

    it('rejects non-Bearer schemes', () => {
        const req = { headers: { authorization: 'Basic abc123' } };
        const res = mockRes();
        authenticate(req, res, () => {});
        assert.strictEqual(res.statusCode, 401);
    });

    it('rejects invalid/expired tokens', () => {
        const req = { headers: { authorization: 'Bearer not-a-real-token' } };
        const res = mockRes();
        authenticate(req, res, () => {});
        assert.strictEqual(res.statusCode, 401);
    });

    it('accepts a valid token and attaches the decoded user', () => {
        const token = generateToken({ id: 1, role: 'admin', email: 'a@b.c' });
        const req = { headers: { authorization: `Bearer ${token}` } };
        const res = mockRes();
        let nextCalled = false;
        authenticate(req, res, () => { nextCalled = true; });
        assert.strictEqual(nextCalled, true);
        assert.strictEqual(req.user.role, 'admin');
        assert.strictEqual(req.user.userId, 1);
    });

    it('rejects an expired token', () => {
        const expired = jwt.sign(
            { userId: 1, role: 'admin', email: 'a@b.c' },
            process.env.JWT_SECRET,
            { expiresIn: '-10s' }
        );
        const req = { headers: { authorization: `Bearer ${expired}` } };
        const res = mockRes();
        let nextCalled = false;
        authenticate(req, res, () => { nextCalled = true; });
        assert.strictEqual(res.statusCode, 401);
        assert.strictEqual(nextCalled, false);
    });
});

describe('authorize middleware', () => {
    it('rejects when no user is attached', () => {
        const res = mockRes();
        authorize('admin')({}, res, () => {});
        assert.strictEqual(res.statusCode, 401);
    });

    it('rejects when the role is not allowed', () => {
        const req = { user: { role: 'student' } };
        const res = mockRes();
        authorize('admin')(req, res, () => {});
        assert.strictEqual(res.statusCode, 403);
    });

    it('accepts a matching role', () => {
        const req = { user: { role: 'admin' } };
        const res = mockRes();
        let nextCalled = false;
        authorize('admin')(req, res, () => { nextCalled = true; });
        assert.strictEqual(nextCalled, true);
    });

    it('accepts any of the listed roles', () => {
        const req = { user: { role: 'instructor' } };
        const res = mockRes();
        let nextCalled = false;
        authorize('admin', 'instructor')(req, res, () => { nextCalled = true; });
        assert.strictEqual(nextCalled, true);
    });
});

describe('generateToken', () => {
    it('signs a token containing the expected payload', () => {
        const token = generateToken({ id: 42, role: 'student', email: 's@t.d' });
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        assert.strictEqual(decoded.userId, 42);
        assert.strictEqual(decoded.role, 'student');
        assert.strictEqual(decoded.email, 's@t.d');
    });
});
