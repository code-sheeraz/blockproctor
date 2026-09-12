// test/blockchainService.test.js
// Unit tests for the blockchain service with a mocked contract + provider.

import { vi, describe, it, expect, beforeEach } from 'vitest';

const contractMock = {
    recordExam: vi.fn(),
    recordAttempt: vi.fn(),
    verifyExam: vi.fn(),
    verifyAttempt: vi.fn(),
    verifyProctorLogs: vi.fn(),
    getExamRecord: vi.fn(),
    getAttemptRecord: vi.fn(),
    getStatistics: vi.fn(),
    target: '0xContract',
};

vi.mock('../config/blockchain.js', () => ({
    getProctorChainContract: vi.fn(() => contractMock),
    getNextNonce: vi.fn(async () => 5),
    resetNonce: vi.fn(),
    provider: { getNetwork: vi.fn(async () => ({ name: 'anvil', chainId: 31337n })) },
    signer: { address: '0xSigner' },
    proctorChainAddress: '0xContract',
}));

import {
    generateExamHash,
    generateAttemptHash,
    generateLogsHash,
    recordExamOnChain,
    recordAttemptOnChain,
    verifyExamIntegrity,
    verifyAttemptIntegrity,
    verifyLogsIntegrity,
    getBlockchainStatistics,
    isBlockchainReady,
    deriveIntegrityState,
} from '../services/blockchainService.js';
import { getProctorChainContract, getNextNonce, resetNonce } from '../config/blockchain.js';

const getContract = vi.mocked(getProctorChainContract);
const nextNonce = vi.mocked(getNextNonce);
const nonceReset = vi.mocked(resetNonce);

const baseAttempt = {
    id: 1,
    exam_id: 10,
    student_id: 100,
    answers_json: JSON.stringify([{ q: 1, answer: 'a' }]),
    score: 88,
    submitted_at: '2026-01-01T00:00:00.000Z',
};

const txStub = (hash) => ({ hash, wait: async () => ({ blockNumber: 42 }) });

describe('hash generation', () => {
    it('generates deterministic 64-char hashes for attempts', () => {
        const h1 = generateAttemptHash(baseAttempt);
        const h2 = generateAttemptHash({ ...baseAttempt });
        expect(h1).toMatch(/^[0-9a-f]{64}$/);
        expect(h1).toBe(h2);
    });

    it('normalizes Date submitted_at to ISO string', () => {
        const withDate = { ...baseAttempt, submitted_at: new Date('2026-01-01T00:00:00.000Z') };
        expect(generateAttemptHash(withDate)).toBe(generateAttemptHash(baseAttempt));
    });

    it('generates deterministic exam and logs hashes', () => {
        const exam = { id: 1, title: 'T', questions_json: '[]', duration_minutes: 30, created_at: 'c' };
        expect(generateExamHash(exam)).toBe(generateExamHash({ ...exam }));
        expect(generateLogsHash([{ type: 'A' }])).toBe(generateLogsHash([{ type: 'A' }]));
    });
});

describe('recordAttemptOnChain', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getContract.mockReturnValue(contractMock);
        nextNonce.mockResolvedValue(5);
    });

    it('returns not_ready when no contract is configured', async () => {
        getContract.mockReturnValue(null);
        const result = await recordAttemptOnChain(baseAttempt, []);
        expect(result).toEqual({ success: false, reason: 'blockchain_not_ready' });
    });

    it('records on-chain with trust = min log trust and violation count', async () => {
        contractMock.recordAttempt.mockResolvedValue(txStub('0xtx1'));
        const logs = [
            { trust_score: 80 },
            { trustScore: 60 },
        ];
        const result = await recordAttemptOnChain(baseAttempt, logs);
        expect(contractMock.recordAttempt).toHaveBeenCalledWith(
            1, 10, 100, expect.stringMatching(/^[0-9a-f]{64}$/),
            expect.stringMatching(/^[0-9a-f]{64}$/), 60, 2, { nonce: 5 }
        );
        expect(result.success).toBe(true);
        expect(result.txHash).toBe('0xtx1');
        expect(result.trustScore).toBe(60);
        expect(result.blockNumber).toBe(42);
    });

    it('defaults trust to 100 with no logs', async () => {
        contractMock.recordAttempt.mockResolvedValue(txStub('0xtx2'));
        const result = await recordAttemptOnChain(baseAttempt, []);
        expect(contractMock.recordAttempt).toHaveBeenCalledWith(
            1, 10, 100, expect.any(String), expect.any(String), 100, 0, { nonce: 5 }
        );
        expect(result.trustScore).toBe(100);
    });

    it('returns offChainOnly on "already recorded" when on-chain hash matches', async () => {
        contractMock.recordAttempt.mockRejectedValue(new Error('execution reverted: Attempt already recorded'));
        contractMock.getAttemptRecord.mockResolvedValue([generateAttemptHash(baseAttempt), '0xlogs', 10, 100, '1', 60, 2, true]);
        const result = await recordAttemptOnChain(baseAttempt, []);
        expect(result.success).toBe(true);
        expect(result.offChainOnly).toBe(true);
        expect(result.txHash).toBeNull();
        expect(nonceReset).toHaveBeenCalled();
    });

    it('reports anchor_drift when the on-chain hash differs from current data', async () => {
        contractMock.recordAttempt.mockRejectedValue(new Error('execution reverted: Attempt already recorded'));
        contractMock.getAttemptRecord.mockResolvedValue(['0xdeadbeef' + '0'.repeat(56), '0xlogs', 10, 100, '1', 60, 2, true]);
        const result = await recordAttemptOnChain(baseAttempt, []);
        expect(result.success).toBe(false);
        expect(result.reason).toBe('anchor_drift');
        expect(result.onChainHash).toBe('0xdeadbeef' + '0'.repeat(56));
        expect(result.currentHash).toBe(generateAttemptHash(baseAttempt));
        expect(nonceReset).toHaveBeenCalled();
    });

    it('returns failure on other errors and resets nonce', async () => {
        contractMock.recordAttempt.mockRejectedValue(new Error('gas estimation failed'));
        const result = await recordAttemptOnChain(baseAttempt, []);
        expect(result.success).toBe(false);
        expect(result.error).toBe('gas estimation failed');
        expect(nonceReset).toHaveBeenCalled();
    });
});

describe('recordExamOnChain', () => {
    it('records an exam hash', async () => {
        contractMock.recordExam.mockResolvedValue(txStub('0xexam'));
        const result = await recordExamOnChain(7, { id: 7, title: 'T', questions_json: '[]', duration_minutes: 30, created_at: 'c' });
        expect(result.success).toBe(true);
        expect(result.txHash).toBe('0xexam');
        expect(result.blockNumber).toBe(42);
    });

    it('handles contract errors', async () => {
        contractMock.recordExam.mockRejectedValue(new Error('boom'));
        const result = await recordExamOnChain(7, {});
        expect(result.success).toBe(false);
        expect(result.error).toBe('boom');
    });
});

describe('verifyAttemptIntegrity', () => {
    it('returns verified=true when hash matches the chain', async () => {
        contractMock.verifyAttempt.mockResolvedValue(true);
        contractMock.getAttemptRecord.mockResolvedValue(['0xhash', '0xlogshash', 10, 100, '1700000000', 60, 2, true]);
        const result = await verifyAttemptIntegrity(1, baseAttempt);
        expect(result.verified).toBe(true);
        expect(result.exists).toBe(true);
        expect(result.trustScore).toBe(60);
        expect(result.recordedAt).toBe(new Date(1700000000 * 1000).toISOString());
    });

    it('returns verified=false for tampered data', async () => {
        contractMock.verifyAttempt.mockResolvedValue(false);
        contractMock.getAttemptRecord.mockResolvedValue(['0xhash', '0xlogshash', 10, 100, '1700000000', 60, 2, true]);
        const result = await verifyAttemptIntegrity(1, { ...baseAttempt, answers_json: '["tampered"]' });
        expect(result.verified).toBe(false);
        expect(result.match).toBe(false);
    });

    it('returns verified=false when record does not exist', async () => {
        contractMock.verifyAttempt.mockResolvedValue(false);
        contractMock.getAttemptRecord.mockResolvedValue(['', '', 0, 0, '0', 0, 0, false]);
        const result = await verifyAttemptIntegrity(1, baseAttempt);
        expect(result.exists).toBe(false);
        expect(result.verified).toBe(false);
    });
});

describe('verifyExamIntegrity / verifyLogsIntegrity', () => {
    it('verifies an exam', async () => {
        contractMock.verifyExam.mockResolvedValue(true);
        contractMock.getExamRecord.mockResolvedValue(['0xhash', '1700000000', '0xRec', true]);
        const result = await verifyExamIntegrity(1, { id: 1, title: 'T', questions_json: '[]', duration_minutes: 30, created_at: 'c' });
        expect(result.verified).toBe(true);
        expect(result.exists).toBe(true);
    });

    it('verifies proctor logs', async () => {
        contractMock.verifyProctorLogs.mockResolvedValue(true);
        const result = await verifyLogsIntegrity(1, [{ type: 'A' }]);
        expect(result.verified).toBe(true);
    });
});

describe('getBlockchainStatistics / isBlockchainReady', () => {
    it('reports chain + contract stats', async () => {
        contractMock.getStatistics.mockResolvedValue([5n, 9n, 3n]);
        const stats = await getBlockchainStatistics();
        expect(stats.networkConnected).toBe(true);
        expect(stats.contractDeployed).toBe(true);
        expect(stats.available).toBe(true);
        expect(stats.totalExamsRecorded).toBe(5);
        expect(stats.totalAttemptsRecorded).toBe(9);
    });

    it('is ready when a contract is configured', () => {
        getContract.mockReturnValue(contractMock);
        expect(isBlockchainReady()).toBe(true);
        getContract.mockReturnValue(null);
        expect(isBlockchainReady()).toBe(false);
    });
});

describe('deriveIntegrityState (four-state classification)', () => {
    const H = 'a'.repeat(64);
    it('VERIFIED when stored == chain == current', () => {
        expect(deriveIntegrityState({ exists: true, chainHash: H, storedHash: H, currentHash: H })).toBe('VERIFIED');
    });
    it('STALE_ANCHOR when chain matches the stored anchor but data moved on', () => {
        expect(deriveIntegrityState({ exists: true, chainHash: H, storedHash: H, currentHash: 'b'.repeat(64) })).toBe('STALE_ANCHOR');
        expect(deriveIntegrityState({ exists: true, chainHash: H, storedHash: null, currentHash: 'b'.repeat(64) })).toBe('STALE_ANCHOR');
    });
    it('TAMPERED when chain hash differs from the DB-stored anchor', () => {
        expect(deriveIntegrityState({ exists: true, chainHash: 'c'.repeat(64), storedHash: H, currentHash: H })).toBe('TAMPERED');
    });
    it('NOT_RECORDED when nothing exists on-chain', () => {
        expect(deriveIntegrityState({ exists: false, chainHash: null, storedHash: H, currentHash: H })).toBe('NOT_RECORDED');
    });
});
