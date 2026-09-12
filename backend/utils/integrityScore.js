// utils/integrityScore.js
// Integrity score calculation shared by the admin audit endpoints.
// When the blockchain is ready, on-chain verification is weighted most heavily;
// otherwise fall back to hash/tx presence.

export function calculateIntegrityScore(attempts, chainReady = false) {
    if (attempts.length === 0) return 100;

    const withHash = attempts.filter(a => a.blockchain_hash).length;
    const withTx = attempts.filter(a => a.blockchain_tx).length;
    const verified = attempts.filter(a => a.onChainVerified === true).length;

    const hashRatio = withHash / attempts.length;
    const txRatio = withTx / attempts.length;

    if (chainReady) {
        const verifiedRatio = verified / attempts.length;
        return Math.round((hashRatio * 25) + (txRatio * 25) + (verifiedRatio * 50));
    }

    return Math.round((hashRatio * 50) + (txRatio * 50));
}

export default calculateIntegrityScore;
