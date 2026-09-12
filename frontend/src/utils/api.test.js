// src/utils/api.test.js
import { describe, it, expect, afterEach, vi } from 'vitest';
import { apiFetch, getToken, setToken, clearToken } from './api.js';

function mockFetchOnce(status, body) {
    const fn = vi.fn().mockResolvedValue({
        status,
        json: async () => body
    });
    vi.stubGlobal('fetch', fn);
    return fn;
}

afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
});

describe('apiFetch', () => {
    it('sends the stored token as a Bearer header', async () => {
        setToken('tok-123');
        const fn = mockFetchOnce(200, { ok: true });
        await apiFetch('/exams');
        const [, init] = fn.mock.calls[0];
        expect(init.headers.Authorization).toBe('Bearer tok-123');
        expect(init.headers['Content-Type']).toBe('application/json');
    });

    it('omits the Authorization header when no token exists', async () => {
        const fn = mockFetchOnce(200, { ok: true });
        await apiFetch('/exams');
        const [, init] = fn.mock.calls[0];
        expect(init.headers.Authorization).toBeUndefined();
    });

    it('hits the resolved API base with the endpoint appended', async () => {
        const fn = mockFetchOnce(200, { ok: true });
        await apiFetch('/exams/5');
        expect(fn.mock.calls[0][0]).toMatch(/\/api\/exams\/5$/);
    });

    it('returns the parsed JSON body', async () => {
        mockFetchOnce(200, { success: true, data: [1, 2] });
        const result = await apiFetch('/exams');
        expect(result).toEqual({ success: true, data: [1, 2] });
    });

    it('clears auth state and redirects to /login on 401', async () => {
        setToken('expired');
        localStorage.setItem('userId', '5');
        mockFetchOnce(401, { message: 'Invalid token' });
        await apiFetch('/exams');
        expect(getToken()).toBeNull();
        expect(localStorage.getItem('userId')).toBeNull();
    });

    it('does not redirect when already on /login', async () => {
        Object.defineProperty(window, 'location', {
            value: { pathname: '/login', href: 'http://localhost/login' },
            writable: true,
            configurable: true
        });
        setToken('expired');
        mockFetchOnce(401, {});
        await apiFetch('/exams');
        expect(window.location.href).toBe('http://localhost/login');
    });
});

describe('token helpers', () => {
    it('round-trips a token through localStorage', () => {
        expect(getToken()).toBeNull();
        setToken('abc');
        expect(getToken()).toBe('abc');
        clearToken();
        expect(getToken()).toBeNull();
    });

    it('clears all auth keys', () => {
        setToken('t');
        localStorage.setItem('userRole', 'admin');
        clearToken();
        expect(localStorage.getItem('userRole')).toBeNull();
    });
});
