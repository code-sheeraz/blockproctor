// services/chainReseed.js
// Self-healing: the blockchain node (Anvil) persists its state, but a wiped
// volume or a fresh deployment would leave every previously recorded hash off
// the chain (all attempts show UNVERIFIED). On backend startup this module
// re-records DB attempts that are missing from the chain, so verification
// keeps working without manual intervention.

import pool from "../config/db.js";
import { getProctorChainContract } from "../config/blockchain.js";
import { recordAttemptOnChain, isBlockchainReady } from "./blockchainService.js";

const RETRY_ATTEMPTS = 18;
const RETRY_DELAY_MS = 10000;

function recordExists(record) {
    if (Array.isArray(record)) return !!record[record.length - 1];
    return !!record?.exists;
}

async function findMissingAttempts(contract) {
    const { rows: attempts } = await pool.query(
        `SELECT * FROM attempts
         WHERE submitted_at IS NOT NULL
         ORDER BY submitted_at ASC`
    );

    const missing = [];
    for (const attempt of attempts) {
        try {
            const record = await contract.getAttemptRecord(attempt.id);
            if (!recordExists(record)) missing.push(attempt);
        } catch (err) {
            // Chain unreachable mid-loop - leave for the record step to retry
            missing.push(attempt);
        }
    }
    return missing;
}

async function recordMissing(attempts) {
    const results = { total: attempts.length, recorded: 0, failed: 0, errors: [] };

    for (const attempt of attempts) {
        try {
            const logsResult = await pool.query(
                'SELECT * FROM proctor_logs WHERE student_id = $1 AND exam_id = $2 ORDER BY created_at',
                [attempt.student_id, attempt.exam_id]
            );

            const result = await recordAttemptOnChain(attempt, logsResult.rows);
            if (result.success && result.txHash) {
                await pool.query(
                    `UPDATE attempts
                     SET blockchain_hash = $1, blockchain_tx = $2
                     WHERE id = $3`,
                    [result.dataHash, result.txHash, attempt.id]
                );
                results.recorded++;
            } else if (result.success && result.offChainOnly) {
                // Already on-chain with matching hash - DB values stay as-is
                results.recorded++;
            } else {
                results.failed++;
                results.errors.push({ attemptId: attempt.id, reason: result.reason || result.error || 'Unknown error' });
            }
        } catch (err) {
            results.failed++;
            results.errors.push({ attemptId: attempt.id, reason: err.message });
        }
    }

    console.log(
        `✅ Chain reseed complete: ${results.recorded}/${results.total} recorded, ${results.failed} failed`
    );
    if (results.errors.length > 0) {
        console.warn("Chain reseed errors:", JSON.stringify(results.errors.slice(0, 5)));
    }
    return results;
}

export async function ensureChainSeeded(quiet = false) {
    let attempt = 0;
    while (attempt < RETRY_ATTEMPTS) {
        attempt++;
        try {
            if (!isBlockchainReady()) {
                if (!quiet) console.warn(`⚠️ Chain reseed: blockchain not ready (attempt ${attempt}/${RETRY_ATTEMPTS})`);
                await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
                continue;
            }

            const contract = getProctorChainContract();
            const missing = await findMissingAttempts(contract);

            if (missing.length === 0) {
                if (!quiet) console.log("✅ Chain reseed: all attempts already on-chain");
                return;
            }

            console.log(`🔁 Chain reseed: recording ${missing.length} missing attempts onto chain...`);
            await recordMissing(missing);
            return;
        } catch (err) {
            if (!quiet) console.warn(`⚠️ Chain reseed attempt ${attempt} failed: ${err.message}`);
            await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        }
    }
    console.warn("⚠️ Chain reseed: gave up after retries (chain may be down)");
}

// Periodic self-healing: the chain is in-memory and can be wiped at any time,
// so every minute check whether attempts are missing from it and re-record.
const MONITOR_INTERVAL_MS = 60000;

export function startChainReseedMonitor() {
    console.log(`⏱️ Chain reseed monitor started (every ${MONITOR_INTERVAL_MS / 1000}s)`);
    return setInterval(() => ensureChainSeeded(true), MONITOR_INTERVAL_MS);
}

export default ensureChainSeeded;
