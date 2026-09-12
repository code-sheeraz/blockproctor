// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ProctorChain - Blockchain Integrity for Exam Proctoring
 * @notice Stores cryptographic hashes of exam data, student attempts, and proctor logs
 * @dev Used by BlockProctor system for tamper-proof audit trail
 */
contract ProctorChain {
    
    // ═══════════════════════════════════════════════════════════════════════════════
    // DATA STRUCTURES
    // ═══════════════════════════════════════════════════════════════════════════════
    
    struct ExamRecord {
        string dataHash;        // SHA-256 hash of exam content
        uint256 timestamp;      // When recorded on chain
        address recordedBy;     // Who submitted (backend wallet)
        bool exists;
    }
    
    struct AttemptRecord {
        string dataHash;        // SHA-256 hash of attempt data (answers + score)
        string proctorLogHash;  // SHA-256 hash of proctor violations log
        uint256 examId;
        uint256 studentId;
        uint256 timestamp;
        uint256 trustScore;     // Final trust score (0-100)
        uint256 violationCount; // Number of violations detected
        bool exists;
    }
    
    // ═══════════════════════════════════════════════════════════════════════════════
    // STATE VARIABLES
    // ═══════════════════════════════════════════════════════════════════════════════
    
    address public owner;
    address public pendingOwner;
    
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    
    // Exam ID => ExamRecord
    mapping(uint256 => ExamRecord) public examRecords;
    
    // Attempt ID => AttemptRecord  
    mapping(uint256 => AttemptRecord) public attemptRecords;
    
    // Student ID => Exam ID => Attempt ID (for lookups)
    mapping(uint256 => mapping(uint256 => uint256)) public studentAttempts;
    
    // Counters for statistics
    uint256 public totalExamsRecorded;
    uint256 public totalAttemptsRecorded;
    uint256 public totalViolationsRecorded;
    
    // ═══════════════════════════════════════════════════════════════════════════════
    // EVENTS (For research data extraction)
    // ═══════════════════════════════════════════════════════════════════════════════
    
    event ExamRecorded(
        uint256 indexed examId,
        string dataHash,
        uint256 timestamp
    );
    
    event AttemptRecorded(
        uint256 indexed attemptId,
        uint256 indexed examId,
        uint256 indexed studentId,
        string dataHash,
        string proctorLogHash,
        uint256 trustScore,
        uint256 violationCount,
        uint256 timestamp
    );
    
    event IntegrityVerified(
        uint256 indexed attemptId,
        bool isValid,
        uint256 timestamp
    );
    
    // ═══════════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════════
    
    constructor() {
        owner = msg.sender;
    }
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not authorized");
        _;
    }
    
    function transferOwnership(address newOwner) public onlyOwner {
        require(newOwner != address(0), "New owner cannot be zero");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
    
    // ═══════════════════════════════════════════════════════════════════════════════
    // WRITE FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════════
    
    /**
     * @notice Record exam content hash on blockchain
     * @param examId Unique exam identifier from database
     * @param dataHash SHA-256 hash of exam JSON
     */
    function recordExam(uint256 examId, string memory dataHash) public onlyOwner {
        require(!examRecords[examId].exists, "Exam already recorded");
        require(bytes(dataHash).length > 0, "Hash cannot be empty");
        
        examRecords[examId] = ExamRecord({
            dataHash: dataHash,
            timestamp: block.timestamp,
            recordedBy: msg.sender,
            exists: true
        });
        
        totalExamsRecorded++;
        
        emit ExamRecorded(examId, dataHash, block.timestamp);
    }
    
    /**
     * @notice Record student attempt with proctor log hash
     * @param attemptId Unique attempt identifier
     * @param examId Related exam ID
     * @param studentId Student who took the exam
     * @param dataHash SHA-256 of attempt data (answers, score)
     * @param proctorLogHash SHA-256 of proctor violation logs
     * @param trustScore Final integrity score (0-100)
     * @param violationCount Number of violations detected
     */
    function recordAttempt(
        uint256 attemptId,
        uint256 examId,
        uint256 studentId,
        string memory dataHash,
        string memory proctorLogHash,
        uint256 trustScore,
        uint256 violationCount
    ) public onlyOwner {
        require(!attemptRecords[attemptId].exists, "Attempt already recorded");
        require(bytes(dataHash).length > 0, "Data hash required");
        require(trustScore <= 100, "Trust score must be 0-100");
        require(violationCount < type(uint16).max, "Violation count too high");
        
        attemptRecords[attemptId] = AttemptRecord({
            dataHash: dataHash,
            proctorLogHash: proctorLogHash,
            examId: examId,
            studentId: studentId,
            timestamp: block.timestamp,
            trustScore: trustScore,
            violationCount: violationCount,
            exists: true
        });
        
        studentAttempts[studentId][examId] = attemptId;
        totalAttemptsRecorded++;
        totalViolationsRecorded += violationCount;
        
        emit AttemptRecorded(
            attemptId,
            examId,
            studentId,
            dataHash,
            proctorLogHash,
            trustScore,
            violationCount,
            block.timestamp
        );
    }
    
    // ═══════════════════════════════════════════════════════════════════════════════
    // READ FUNCTIONS (For Verification)
    // ═══════════════════════════════════════════════════════════════════════════════
    
    /**
     * @notice Verify exam integrity by comparing hashes
     * @param examId Exam to verify
     * @param providedHash Hash to compare against stored
     * @return isValid True if hashes match
     */
    function verifyExam(uint256 examId, string memory providedHash) public view returns (bool isValid) {
        if (!examRecords[examId].exists) return false;
        return keccak256(bytes(examRecords[examId].dataHash)) == keccak256(bytes(providedHash));
    }
    
    /**
     * @notice Verify attempt data integrity
     * @param attemptId Attempt to verify
     * @param providedDataHash Hash of attempt data to verify
     * @return isValid True if hashes match
     */
    function verifyAttempt(uint256 attemptId, string memory providedDataHash) public view returns (bool isValid) {
        if (!attemptRecords[attemptId].exists) return false;
        return keccak256(bytes(attemptRecords[attemptId].dataHash)) == keccak256(bytes(providedDataHash));
    }
    
    /**
     * @notice Verify proctor logs integrity
     * @param attemptId Attempt whose logs to verify
     * @param providedLogHash Hash of proctor logs to verify
     * @return isValid True if hashes match
     */
    function verifyProctorLogs(uint256 attemptId, string memory providedLogHash) public view returns (bool isValid) {
        if (!attemptRecords[attemptId].exists) return false;
        return keccak256(bytes(attemptRecords[attemptId].proctorLogHash)) == keccak256(bytes(providedLogHash));
    }
    
    /**
     * @notice Get exam record details
     */
    function getExamRecord(uint256 examId) public view returns (
        string memory dataHash,
        uint256 timestamp,
        address recordedBy,
        bool exists
    ) {
        ExamRecord memory record = examRecords[examId];
        return (record.dataHash, record.timestamp, record.recordedBy, record.exists);
    }
    
    /**
     * @notice Get attempt record details
     */
    function getAttemptRecord(uint256 attemptId) public view returns (
        string memory dataHash,
        string memory proctorLogHash,
        uint256 examId,
        uint256 studentId,
        uint256 timestamp,
        uint256 trustScore,
        uint256 violationCount,
        bool exists
    ) {
        AttemptRecord memory record = attemptRecords[attemptId];
        return (
            record.dataHash,
            record.proctorLogHash,
            record.examId,
            record.studentId,
            record.timestamp,
            record.trustScore,
            record.violationCount,
            record.exists
        );
    }
    
    /**
     * @notice Get statistics for research
     */
    function getStatistics() public view returns (
        uint256 exams,
        uint256 attempts,
        uint256 violations
    ) {
        return (totalExamsRecorded, totalAttemptsRecorded, totalViolationsRecorded);
    }
    
    /**
     * @notice Get attempt ID for a student's exam
     */
    function getStudentAttemptId(uint256 studentId, uint256 examId) public view returns (uint256) {
        return studentAttempts[studentId][examId];
    }
    
    /**
     * @notice Check if an exam record exists
     */
    function examExists(uint256 examId) public view returns (bool) {
        return examRecords[examId].exists;
    }
    
    /**
     * @notice Check if an attempt record exists
     */
    function attemptExists(uint256 attemptId) public view returns (bool) {
        return attemptRecords[attemptId].exists;
    }
}
