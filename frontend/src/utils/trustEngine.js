// Trust-score engine rules for the AI proctor, extracted from ExamProctor.jsx
// so the block/unblock thresholds (thesis §3.5) are unit-testable.

export const TRUST_BLOCK_THRESHOLD = 35;   // below this the exam pauses
export const TRUST_UNBLOCK_THRESHOLD = 55; // recovery releases the pause

export function clampTrust(value) {
    return Math.max(0, Math.min(100, value));
}

export function shouldBlock(trustScore) {
    return trustScore < TRUST_BLOCK_THRESHOLD;
}

export function shouldUnblock(trustScore) {
    return trustScore > TRUST_UNBLOCK_THRESHOLD;
}
