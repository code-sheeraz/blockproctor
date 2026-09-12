import { ethers } from "ethers";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

// Provider setup - use BLOCKCHAIN_RPC from .env (Docker container name)
const blockchainUrl = process.env.BLOCKCHAIN_RPC || process.env.BLOCKCHAIN_URL || 'http://blockproctor-blockchain:8545';
console.log(`🔗 Connecting to blockchain at: ${blockchainUrl}`);
const provider = new ethers.JsonRpcProvider(blockchainUrl);

// Addresses are resolved lazily from the shared deployment file (written by the
// blockchain container's auto-deploy step) with .env values as fallback.
const ADDRESS_FILE = process.env.BLOCKCHAIN_ADDRESS_FILE || '/blockchain/artifacts/blockchain-addresses.env';

// Private key for signing transactions (Hardhat default account #0)
const privateKey = process.env.PRIVATE_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const signer = new ethers.Wallet(privateKey, provider);

// Nonce manager to prevent race conditions
let currentNonce = null;
let nonceLock = Promise.resolve();

export async function getNextNonce() {
    // Chain promises to ensure sequential nonce handling
    nonceLock = nonceLock.then(async () => {
        if (currentNonce === null) {
            currentNonce = await provider.getTransactionCount(signer.address, 'pending');
        } else {
            currentNonce++;
        }
        return currentNonce;
    });
    return nonceLock;
}

export function resetNonce() {
    currentNonce = null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DYNAMIC ADDRESS RESOLUTION
// The blockchain container auto-deploys ProctorChain only when the chain is
// genuinely fresh (Anvil state is persisted across restarts). We re-read the
// address file (detecting changes via mtime) so the backend always talks to a
// live deployment, and reset the nonce cache whenever the chain state changed.
// ═══════════════════════════════════════════════════════════════════════════════

let cachedFileMtime = null;
let cachedFileContent = null;
let cachedParsed = {};
let cachedInstance = null;

function readAddressFile() {
    try {
        if (fs.existsSync(ADDRESS_FILE)) {
            const stat = fs.statSync(ADDRESS_FILE);
            const content = fs.readFileSync(ADDRESS_FILE, 'utf8');
            // Detect changes by mtime AND raw content — Windows/Docker bind
            // mounts can report stale mtimes, which previously left the
            // backend pinned to a dead contract after a chain rebuild.
            if (
                cachedFileMtime === null ||
                stat.mtimeMs !== cachedFileMtime ||
                content !== cachedFileContent
            ) {
                const parsed = {};
                for (const line of content.split('\n')) {
                    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(\S+)/);
                    if (m) parsed[m[1]] = m[2].trim();
                }
                const changed =
                    cachedFileMtime !== null &&
                    (parsed.PROCTOR_CHAIN_ADDRESS !== cachedParsed.PROCTOR_CHAIN_ADDRESS);
                cachedParsed = parsed;
                cachedFileMtime = stat.mtimeMs;
                cachedFileContent = content;
                return { parsed, changed };
            }
            return { parsed: cachedParsed, changed: false };
        }
    } catch (err) {
        console.warn(`⚠️ Could not read blockchain addresses file: ${err.message}`);
    }
    return { parsed: {}, changed: false };
}

export function getContractAddresses() {
    const { parsed, changed } = readAddressFile();
    if (changed) {
        resetNonce();
        cachedInstance = null;
    }
    return {
        proctorChainAddress: parsed.PROCTOR_CHAIN_ADDRESS || process.env.PROCTOR_CHAIN_ADDRESS
    };
}

// ProctorChain ABI - uses string hashes
const proctorChainAbi = [
  "function recordExam(uint256 examId, string memory dataHash) external",
  "function recordAttempt(uint256 attemptId, uint256 examId, uint256 studentId, string memory dataHash, string memory proctorLogHash, uint256 trustScore, uint256 violationCount) external",
  "function verifyExam(uint256 examId, string memory providedHash) external view returns (bool)",
  "function verifyAttempt(uint256 attemptId, string memory providedDataHash) external view returns (bool)",
  "function verifyProctorLogs(uint256 attemptId, string memory providedLogHash) external view returns (bool)",
  "function getExamRecord(uint256 examId) external view returns (string memory dataHash, uint256 timestamp, address recordedBy, bool exists)",
  "function getAttemptRecord(uint256 attemptId) external view returns (string memory dataHash, string memory proctorLogHash, uint256 examId, uint256 studentId, uint256 timestamp, uint256 trustScore, uint256 violationCount, bool exists)",
  "function getStatistics() external view returns (uint256 exams, uint256 attempts, uint256 violations)",
  "event ExamRecorded(uint256 indexed examId, string dataHash, uint256 timestamp)",
  "event AttemptRecorded(uint256 indexed attemptId, uint256 indexed examId, uint256 indexed studentId, string dataHash, string proctorLogHash, uint256 trustScore, uint256 violationCount, uint256 timestamp)"
];

export function getProctorChainContract() {
    const { proctorChainAddress } = getContractAddresses();
    if (!proctorChainAddress) return null;
    if (cachedInstance && cachedInstance.target === proctorChainAddress) {
        return cachedInstance;
    }
    cachedInstance = new ethers.Contract(proctorChainAddress, proctorChainAbi, signer);
    return cachedInstance;
}

const { proctorChainAddress } = getContractAddresses();
export { provider, signer, proctorChainAddress };
export default provider;
