// test/chain-resilience.integration.mjs
// Integration test against the LIVE local blockchain (Anvil on :8545).
// Exercises the exact services the app uses: hash generation, on-chain
// recording, duplicate-record handling, verification, and tamper detection.
//
// NOT run by default `npm test` (CI has no chain). Run explicitly:
//   BLOCKCHAIN_RPC=http://127.0.0.1:8545 npm run test:integration
//
// Uses a synthetic attempt id (9_000_000) so it never collides with real data.
// Records one synthetic attempt on the dev chain (harmless; id is out of range
// of every real attempt). The id is randomized per run so re-runs against a
// persisted chain always record fresh.

import assert from 'assert';
import {
    generateAttemptHash,
    generateLogsHash,
    recordAttemptOnChain,
    verifyAttemptIntegrity,
    isBlockchainReady
} from '../services/blockchainService.js';

const ATTEMPT_ID = 9000000 + Math.floor(Math.random() * 900000);
const EXAM_ID = 9000000;
const STUDENT_ID = 9000000;

const baseAttempt = {
    id: ATTEMPT_ID,
    exam_id: EXAM_ID,
    student_id: STUDENT_ID,
    answers_json: JSON.stringify([{ q: 1, answer: 'a' }, { q: 2, answer: 'b' }]),
    score: 88,
    submitted_at: new Date('2026-01-01T00:00:00.000Z')
};

const baseLogs = [
    { type: 'absence', trust_score: 80, created_at: '2026-01-01T00:00:01.000Z' },
    { type: 'multi_face', trust_score: 60, created_at: '2026-01-01T00:00:02.000Z' }
];

describe('Chain resilience integration (live Anvil)', function () {
    this.timeout(60000);

    before(async function () {
        if (!isBlockchainReady()) {
            this.skip();
            return;
        }
        // sanity: node must be reachable
        const ready = await import('../config/blockchain.js');
        assert.ok(ready.provider, 'provider should exist');
    });

    it('blockchain is configured and ready', () => {
        assert.ok(isBlockchainReady(), 'expected a live blockchain (BLOCKCHAIN_RPC)');
    });

    it('hash generation is deterministic and matches the API pipeline', () => {
        const h1 = generateAttemptHash(baseAttempt);
        const h2 = generateAttemptHash({ ...baseAttempt, answers_json: baseAttempt.answers_json });
        assert.strictEqual(h1, h2);
        assert.match(h1, /^[0-9a-f]{64}$/);

        const lh1 = generateLogsHash(baseLogs);
        const lh2 = generateLogsHash([...baseLogs]);
        assert.strictEqual(lh1, lh2);
    });

    it('records an attempt on-chain', async () => {
        const result = await recordAttemptOnChain(baseAttempt, baseLogs);
        assert.ok(result.success, `record failed: ${result.error || result.reason}`);
        assert.ok(result.txHash, 'expected a tx hash for a fresh record');
        assert.match(result.txHash, /^0x[0-9a-f]{64}$/);
    });

    it('verifies the recorded attempt as VALID', async () => {
        const verification = await verifyAttemptIntegrity(ATTEMPT_ID, baseAttempt);
        assert.strictEqual(verification.exists, true);
        assert.strictEqual(verification.match, true);
        assert.strictEqual(verification.verified, true);
        assert.strictEqual(verification.trustScore, 60, 'trust = min of log trust scores');
        assert.strictEqual(verification.violationCount, 2);
    });

    it('duplicate record returns offChainOnly (no new tx)', async () => {
        const result = await recordAttemptOnChain(baseAttempt, baseLogs);
        assert.ok(result.success, `duplicate record failed: ${result.error}`);
        assert.strictEqual(result.offChainOnly, true, 'expected already-recorded path');
        assert.strictEqual(result.txHash, null);
    });

    it('detects tampered answers as INVALID', async () => {
        const tampered = {
            ...baseAttempt,
            answers_json: JSON.stringify([{ q: 1, answer: 'c' }, { q: 2, answer: 'd' }])
        };
        const verification = await verifyAttemptIntegrity(ATTEMPT_ID, tampered);
        assert.strictEqual(verification.exists, true);
        assert.strictEqual(verification.match, false, 'tampered data must not match');
        assert.strictEqual(verification.verified, false);
    });
});
