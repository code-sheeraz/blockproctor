// src/utils/apiBase.test.js
import { describe, it, expect, vi, afterEach } from 'vitest';
import { getApiBase } from './apiBase.js';

describe('getApiBase', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('uses VITE_API_URL when configured', () => {
        vi.stubEnv('VITE_API_URL', 'http://192.168.1.99:8080/api');
        expect(getApiBase()).toBe('http://192.168.1.99:8080/api');
    });

    it('strips trailing slashes from VITE_API_URL', () => {
        vi.stubEnv('VITE_API_URL', 'http://192.168.1.99:8080/api///');
        expect(getApiBase()).toBe('http://192.168.1.99:8080/api');
    });

    it('falls back to the page hostname when VITE_API_URL is unset', () => {
        vi.stubEnv('VITE_API_URL', '');
        expect(getApiBase()).toBe(`http://${window.location.hostname}:8080/api`);
    });

    it('fallback tracks the current hostname (LAN IP changes)', () => {
        vi.stubEnv('VITE_API_URL', '');
        Object.defineProperty(window, 'location', {
            value: { hostname: '192.168.1.7' },
            writable: true,
            configurable: true
        });
        expect(getApiBase()).toBe('http://192.168.1.7:8080/api');
    });

    it('never returns a URL with a trailing slash', () => {
        const url = getApiBase();
        expect(url.endsWith('/')).toBe(false);
    });
});
