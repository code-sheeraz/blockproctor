// src/utils/trustEngine.test.js
// Trust-score rules (thesis §3.5): block below 35%, recover above 55%.

import { describe, it, expect } from 'vitest';
import {
    clampTrust,
    shouldBlock,
    shouldUnblock,
    TRUST_BLOCK_THRESHOLD,
    TRUST_UNBLOCK_THRESHOLD,
} from './trustEngine.js';

describe('clampTrust', () => {
    it('clamps to the [0, 100] range', () => {
        expect(clampTrust(-5)).toBe(0);
        expect(clampTrust(0)).toBe(0);
        expect(clampTrust(50)).toBe(50);
        expect(clampTrust(100)).toBe(100);
        expect(clampTrust(120)).toBe(100);
    });
});

describe('shouldBlock', () => {
    it('blocks strictly below 35%', () => {
        expect(shouldBlock(34.9)).toBe(true);
        expect(shouldBlock(34)).toBe(true);
        expect(shouldBlock(0)).toBe(true);
    });

    it('does not block at exactly 35% (strict less-than rule)', () => {
        expect(shouldBlock(35)).toBe(false);
        expect(shouldBlock(36)).toBe(false);
        expect(shouldBlock(100)).toBe(false);
    });
});

describe('shouldUnblock', () => {
    it('unblocks strictly above 55%', () => {
        expect(shouldUnblock(55.1)).toBe(true);
        expect(shouldUnblock(56)).toBe(true);
        expect(shouldUnblock(100)).toBe(true);
    });

    it('stays blocked at exactly 55% (hysteresis band 35-55)', () => {
        expect(shouldUnblock(55)).toBe(false);
        expect(shouldUnblock(40)).toBe(false);
        expect(shouldUnblock(0)).toBe(false);
    });
});

describe('threshold constants match thesis Table 3.3', () => {
    it('block=35, unblock=55', () => {
        expect(TRUST_BLOCK_THRESHOLD).toBe(35);
        expect(TRUST_UNBLOCK_THRESHOLD).toBe(55);
    });
});
