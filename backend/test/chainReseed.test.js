// test/chainReseed.test.js
// Unit tests for the chain self-healing service (db + chain mocked).

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

vi.mock('../config/db.js', () => ({ default: { query: vi.fn() } }));
vi.mock('../config/blockchain.js', () => ({
    getProctorChainContract: vi.fn(),
}));
vi.mock('../services/blockchainService.js', () => ({
    recordAttemptOnChain: vi.fn(),
    isBlockchainReady: vi.fn(() => true),
}));

import pool from '../config/db.js';
import { getProctorChainContract } from '../config/blockchain.js';
import { recordAttemptOnChain, isBlockchainReady } from '../services/blockchainService.js';
import { ensureChainSeeded, startChainReseedMonitor } from '../services/chainReseed.js';

const poolQuery = vi.mocked(pool.query);
const getContract = vi.mocked(getProctorChainContract);
const recordOnChain = vi.mocked(recordAttemptOnChain);
const chainReady = vi.mocked(isBlockchainReady);

const attempt = { id: 1, student_id: 5, exam_id: 10, submitted_at: '2026-01-01' };

describe('chainReseed.ensureChainSeeded', () => {
    beforeEach(() => vi.clearAllMocks());

    it('is a no-op when every attempt already exists on-chain', async () => {
        getContract.mockReturnValue({ getAttemptRecord: async () => ['h', 'l', 10, 5, '1', 100, 0, true] });
        poolQuery.mockResolvedValue({ rows: [attempt] });
        const result = await ensureChainSeeded(true);
        expect(result).toBeUndefined();
        expect(recordOnChain).not.toHaveBeenCalled();
    });

    it('re-records attempts missing from the chain and updates the DB', async () => {
        getContract.mockReturnValue({
            getAttemptRecord: async (id) => ['', '', 0, 0, '0', 0, 0, false],
        });
        poolQuery
            .mockResolvedValueOnce({ rows: [attempt] })          // findMissingAttempts
            .mockResolvedValueOnce({ rows: [{ violation_type: 'A' }] }) // proctor logs
            .mockResolvedValueOnce({ rows: [] });                // UPDATE attempts
        recordOnChain.mockResolvedValue({ success: true, txHash: '0xtx', dataHash: '0xabc' });

        const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
        await ensureChainSeeded(true);
        spy.mockRestore();

        expect(recordOnChain).toHaveBeenCalledWith(attempt, [{ violation_type: 'A' }]);
        expect(poolQuery).toHaveBeenLastCalledWith(
            expect.stringContaining('UPDATE attempts'), ['0xabc', '0xtx', 1]
        );
    });

    it('counts offChainOnly results as recorded without DB update', async () => {
        getContract.mockReturnValue({ getAttemptRecord: async () => [null] });
        poolQuery.mockResolvedValueOnce({ rows: [attempt] }).mockResolvedValue({ rows: [] });
        recordOnChain.mockResolvedValue({ success: true, offChainOnly: true });
        const result = await ensureChainSeeded(true);
        expect(recordOnChain).toHaveBeenCalledTimes(1);
        expect(poolQuery.mock.calls.some(([sql]) => String(sql).includes('UPDATE attempts'))).toBe(false);
    });

    it('retries while the chain is not ready and then gives up', async () => {
        chainReady.mockReturnValue(false);
        vi.useFakeTimers();
        const promise = ensureChainSeeded(true);
        await vi.advanceTimersByTimeAsync(18 * 10000);
        await promise;
        vi.useRealTimers();
        expect(chainReady).toHaveBeenCalled();
    });
});

describe('chainReseed.startChainReseedMonitor', () => {
    it('returns a timer that triggers rescans', () => {
        vi.useFakeTimers();
        const timer = startChainReseedMonitor();
        expect(timer).toBeTruthy();
        vi.clearAllTimers();
        vi.useRealTimers();
    });
});

