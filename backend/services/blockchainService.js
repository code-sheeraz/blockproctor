// services/blockchainService.js
// Enhanced blockchain integration with ProctorChain contract

import { ethers } from "ethers";
import { getProctorChainContract, signer, provider, getNextNonce, resetNonce } from "../config/blockchain.js";
import { sha256 } from "../utils/hash.js";
import { stableStringify } from "../utils/stableStringify.js";

// ═══════════════════════════════════════════════════════════════════════════════
// CONTRACT STATE
// ═══════════════════════════════════════════════════════════════════════════════

function getContract() {
    return getProctorChainContract();
}

function logBlockchainStatus() {
    const contract = getContract();
    if (contract) {
        console.log(`✅ ProctorChain contract ready at ${contract.target}`);
    } else {
        console.log("⚠️ ProctorChain not configured - blockchain features disabled");
        console.log("   Set PROCTOR_CHAIN_ADDRESS in .env after deployment");
    }
}

// Log status on load
setTimeout(logBlockchainStatus, 100);

// ═══════════════════════════════════════════════════════════════════════════════
// HASH GENERATION UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

export function generateExamHash(examData) {
    const normalized = {
        id: examData.id,
        title: examData.title,
        questions: examData.questions_json,
        duration: examData.duration_minutes,
        createdAt: examData.created_at
    };
    return sha256(stableStringify(normalized));
}

export function generateAttemptHash(attemptData) {
    const normalized = {
        id: attemptData.id,
        examId: attemptData.exam_id,
        studentId: attemptData.student_id,
        answers: attemptData.answers_json,
        score: Number(attemptData.score),
        submittedAt: attemptData.submitted_at instanceof Date
            ? attemptData.submitted_at.toISOString()
            : String(attemptData.submitted_at)
    };
    return sha256(stableStringify(normalized));
}

export function generateLogsHash(logs) {
    return sha256(stableStringify(logs));
}

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCKCHAIN WRITE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

export async function recordExamOnChain(examId, examData) {
    const contract = getContract();
    if (!contract) {
        console.warn("Blockchain not ready - skipping exam recording");
        return { success: false, reason: "blockchain_not_ready" };
    }
    
    try {
        const hash = generateExamHash(examData);
        const nonce = await getNextNonce();
        
        const tx = await contract.recordExam(examId, hash, { nonce });
        const receipt = await tx.wait();
        
        return { 
            success: true, 
            txHash: tx.hash, 
            dataHash: hash,
            blockNumber: receipt.blockNumber
        };
    } catch (err) {
        console.error("Record exam error:", err.message);
        resetNonce(); // Reset nonce on error to resync
        return { success: false, error: err.message };
    }
}

export async function recordAttemptOnChain(attemptData, proctorLogs = []) {
    const contract = getContract();
    if (!contract) {
        console.warn("Blockchain not ready - skipping attempt recording");
        return { success: false, reason: "blockchain_not_ready" };
    }
    
    try {
        const dataHash = generateAttemptHash(attemptData);
        const logsHash = generateLogsHash(proctorLogs);
        
        // Calculate trust score
        const trustScores = proctorLogs.map(l => l.trust_score || l.trustScore).filter(t => t !== null && t !== undefined);
        const finalTrust = trustScores.length > 0 ? Math.min(...trustScores) : 100;
        
        const nonce = await getNextNonce();

        const tx = await contract.recordAttempt(
            attemptData.id,
            attemptData.exam_id,
            attemptData.student_id,
            dataHash,
            logsHash,
            finalTrust,
            proctorLogs.length,
            { nonce }
        );
        const receipt = await tx.wait();

        return {
            success: true,
            txHash: tx.hash,
            dataHash,
            logsHash,
            trustScore: finalTrust,
            violationCount: proctorLogs.length,
            blockNumber: receipt.blockNumber
        };
    } catch (err) {
        console.error("Record attempt error:", err.message);
        resetNonce();

        // If attempt was already recorded on-chain, determine whether the
        // stored anchor still matches the current data.
        if (err.message && err.message.includes("already recorded")) {
            const currentHash = generateAttemptHash(attemptData);
            const logsHash = generateLogsHash(proctorLogs);
            try {
                const record = await getContract().getAttemptRecord(attemptData.id);
                const onChainHash = Array.isArray(record) ? record[0] : record?.dataHash;
                if (onChainHash === currentHash) {
                    // Idempotent re-record of unchanged data — consistent.
                    return {
                        success: true,
                        txHash: null,
                        dataHash: currentHash,
                        logsHash,
                        trustScore: 0,
                        violationCount: 0,
                        blockNumber: 0,
                        offChainOnly: true
                    };
                }
                // Anchor drift: the DB row changed after it was anchored.
                console.error(
                    `⚠️ Anchor drift on attempt ${attemptData.id}: ` +
                    `on-chain=${onChainHash} vs current=${currentHash}`
                );
                return {
                    success: false,
                    reason: "anchor_drift",
                    error: "Attempt already anchored with a different hash",
                    onChainHash,
                    currentHash
                };
            } catch (e) {
                return { success: false, reason: "anchor_drift_check_failed", error: e.message };
            }
        }

        return { success: false, error: err.message };
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCKCHAIN VERIFICATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

export async function verifyExamIntegrity(examId, examData) {
    const contract = getContract();
    if (!contract) {
        return { verified: false, reason: "blockchain_not_ready" };
    }
    
    try {
        const currentHash = generateExamHash(examData);
        
        const isValid = await contract.verifyExam(examId, currentHash);
        const [storedHash, timestamp, recordedBy, exists] = await contract.getExamRecord(examId);
        
        return {
            verified: isValid,
            currentHash,
            storedHash,
            recordedAt: exists ? new Date(Number(timestamp) * 1000).toISOString() : null,
            recordedBy,
            exists,
            match: isValid
        };
    } catch (err) {
        return { verified: false, error: err.message };
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTEGRITY STATE DERIVATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Four-state integrity classification for an anchored attempt.
 *  - VERIFIED      stored == chain && current == stored (untouched since anchor)
 *  - STALE_ANCHOR  stored == chain && current != stored (data re-finalized after
 *                  anchoring; needs re-anchor on a fresh chain)
 *  - TAMPERED      chain hash != DB-stored anchor hash (chain record replaced or
 *                  anchor row edited)
 *  - NOT_RECORDED  no usable on-chain record
 */
export function deriveIntegrityState({ exists, chainHash, storedHash, currentHash }) {
    if (!exists || !chainHash) return "NOT_RECORDED";
    if (storedHash && chainHash !== storedHash) return "TAMPERED";
    if (!storedHash || currentHash !== storedHash) return "STALE_ANCHOR";
    return "VERIFIED";
}

/** Fetch just the on-chain anchor hash/exists flag for an attempt. */
export async function fetchOnChainAttemptHash(attemptId) {
    const contract = getContract();
    if (!contract) return null;
    const record = await contract.getAttemptRecord(attemptId);
    const onChainHash = Array.isArray(record) ? record[0] : record?.dataHash;
    const exists = Array.isArray(record) ? !!record[record.length - 1] : !!record?.exists;
    return { onChainHash, exists };
}

export async function verifyAttemptIntegrity(attemptId, attemptData) {
    const contract = getContract();
    if (!contract) {
        return { verified: false, reason: "blockchain_not_ready" };
    }

    try {
        const currentHash = generateAttemptHash(attemptData);

        const isValid = await contract.verifyAttempt(attemptId, currentHash);
        const [storedOnChain, proctorLogHash, examId, studentId, timestamp, trustScore, violationCount, exists] =
            await contract.getAttemptRecord(attemptId);

        const storedHash = attemptData.blockchain_hash || null;
        const state = deriveIntegrityState({
            exists,
            chainHash: exists ? storedOnChain : null,
            storedHash,
            currentHash,
        });

        return {
            verified: isValid,               // legacy: current data vs chain
            match: isValid,                  // legacy alias
            state,                           // canonical four-state result
            integrityState: state,           // alias
            chainMatchesStored: exists ? storedOnChain === storedHash : false,
            currentMatchesStored: storedHash ? currentHash === storedHash : null,
            currentHash,
            storedHash,
            onChainHash: exists ? storedOnChain : null,
            storedLogsHash: proctorLogHash,
            trustScore: Number(trustScore),
            violationCount: Number(violationCount),
            recordedAt: exists ? new Date(Number(timestamp) * 1000).toISOString() : null,
            exists,
        };
    } catch (err) {
        return { verified: false, error: err.message };
    }
}

export async function verifyLogsIntegrity(attemptId, proctorLogs) {
    const contract = getContract();
    if (!contract) {
        return { verified: false, reason: "blockchain_not_ready" };
    }
    
    try {
        const currentHash = generateLogsHash(proctorLogs);
        
        const isValid = await contract.verifyProctorLogs(attemptId, currentHash);
        return { verified: isValid, currentHash, match: isValid };
    } catch (err) {
        return { verified: false, error: err.message };
    }
}

export async function getBlockchainStatistics() {
    // Return basic info even if contract is not ready
    const baseStats = {
        available: false,
        networkConnected: false,
        contractDeployed: false,
        totalExamsRecorded: 0,
        totalAttemptsRecorded: 0,
        totalVerifications: 0
    };

    // Check if provider is connected
    if (provider) {
        try {
            const network = await provider.getNetwork();
            baseStats.networkConnected = true;
            baseStats.networkName = network.name || 'hardhat';
            baseStats.chainId = Number(network.chainId);
        } catch (e) {
            baseStats.networkError = 'Cannot connect to blockchain network';
        }
    }

    // Check contract
    const contract = getContract();
    if (!contract) {
        baseStats.reason = "Contract not deployed or address not configured";
        return baseStats;
    }
    
    baseStats.contractDeployed = true;
    baseStats.contractAddress = contract.target || contract.address;

    try {
        // Try to get statistics from contract
        const stats = await contract.getStatistics();
        return {
            ...baseStats,
            available: true,
            totalExamsRecorded: Number(stats[0] || stats.totalExams || 0),
            totalAttemptsRecorded: Number(stats[1] || stats.totalAttempts || 0),
            totalVerifications: Number(stats[2] || stats.totalVerifications || 0)
        };
    } catch (err) {
        // Contract deployed but getStatistics might not exist
        // Try alternative methods
        try {
            // Try to call simpler view functions if they exist
            const examCount = await contract.examCount?.() || 0;
            const attemptCount = await contract.attemptCount?.() || 0;
            return {
                ...baseStats,
                available: true,
                totalExamsRecorded: Number(examCount),
                totalAttemptsRecorded: Number(attemptCount),
                totalVerifications: 0,
                note: "Statistics function not available, using fallback"
            };
        } catch (fallbackErr) {
            // Contract exists but statistics aren't available
            return {
                ...baseStats,
                available: true,
                note: "Contract connected but statistics unavailable",
                contractFunctionError: err.shortMessage || err.message
            };
        }
    }
}

// Check if blockchain is available
export function isBlockchainReady() {
    return !!getContract();
}

// Get provider for external use
export { provider };

export default {
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
    deriveIntegrityState
};
