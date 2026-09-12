// routes/researchRoutes.js
// API endpoints for extracting research data and metrics

import express from 'express';
import dotenv from 'dotenv';
import { getViolationStatistics, getProctorSummary } from '../services/proctorService.js';
import { 
    getBlockchainStatistics, 
    verifyExamIntegrity, 
    verifyAttemptIntegrity,
    generateAttemptHash,
    generateLogsHash
} from '../services/blockchainService.js';
import { authenticate, authorize } from '../middleware/auth.js';
import pool from '../config/db.js';
import { evaluateDetection, fromProctorLogs, DEFAULT_TOLERANCE_MS } from '../utils/detectionMetrics.js';
import { deriveIntegrityState, fetchOnChainAttemptHash } from '../services/blockchainService.js';

const router = express.Router();

// All research/analytics endpoints require an authenticated admin
router.use(authenticate, authorize('admin'));

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER: Convert JSON to CSV
// ═══════════════════════════════════════════════════════════════════════════════
function jsonToCSV(data) {
    if (!data || data.length === 0) return '';
    const headers = Object.keys(data[0]);
    const csvRows = [headers.join(',')];
    for (const row of data) {
        const values = headers.map(h => {
            const val = row[h];
            if (val === null || val === undefined) return '';
            const str = String(val).replace(/"/g, '""');
            return `"${str}"`;
        });
        csvRows.push(values.join(','));
    }
    return csvRows.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
// AI/ML DETECTION METRICS (For Research Paper)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/research/ai-metrics
 * Comprehensive AI detection performance metrics
 */
router.get('/ai-metrics', async (req, res) => {
    try {
        // Real detector vocabulary (see proctor_logs.violation_type comment in
        // migration 002 + client ExamProctor/ExamSession emitters).
        const FACE_FAMILY = "('ABSENCE_CRITICAL','ABSENCE_MINOR','MULTI_FACE','IMPERSONATION','FACE_MISMATCH')";
        const HEAD_FAMILY = "('HEAD_TURN_LEFT','HEAD_TURN_RIGHT','HEAD_TURN_UP','HEAD_TURN_DOWN')";

        // Face/presence detection accuracy
        const faceMetrics = await pool.query(`
            SELECT
                COUNT(*) FILTER (WHERE violation_type LIKE 'ABSENCE%') as no_face_detections,
                COUNT(*) FILTER (WHERE violation_type = 'MULTI_FACE') as multiple_faces_detections,
                COUNT(*) FILTER (WHERE violation_type IN ('IMPERSONATION','FACE_MISMATCH')) as different_face_detections,
                COUNT(*) FILTER (WHERE violation_type LIKE 'HEAD_TURN%') as gaze_violations,
                AVG(confidence_score) FILTER (WHERE violation_type IN ${FACE_FAMILY}) as avg_face_confidence,
                MIN(confidence_score) FILTER (WHERE violation_type IN ${FACE_FAMILY}) as min_face_confidence,
                MAX(confidence_score) FILTER (WHERE violation_type IN ${FACE_FAMILY}) as max_face_confidence
            FROM proctor_logs
        `);

        // Detection latency approximation (time between consecutive events)
        const detectionEvents = await pool.query(`
            SELECT
                violation_type,
                COUNT(*) as total_detections,
                AVG(trust_score) as avg_trust_at_detection,
                STDDEV(trust_score) as trust_score_stddev
            FROM proctor_logs
            WHERE violation_type IN ${FACE_FAMILY} OR violation_type LIKE 'HEAD_TURN%'
            GROUP BY violation_type
        `);

        // Session-level AI performance
        const sessionAI = await pool.query(`
            SELECT
                es.id as session_id,
                COUNT(pl.id) as ai_events_count,
                COUNT(DISTINCT pl.violation_type) as unique_violation_types,
                MIN(pl.trust_score) as min_trust,
                AVG(pl.trust_score) as avg_trust,
                es.status as session_outcome
            FROM exam_sessions es
            LEFT JOIN proctor_logs pl ON pl.session_id = es.id
            WHERE pl.violation_type IN ${FACE_FAMILY} OR pl.violation_type LIKE 'HEAD_TURN%'
            GROUP BY es.id, es.status
            ORDER BY ai_events_count DESC
            LIMIT 50
        `);

        // True/False positive estimation based on session outcomes
        const outcomeAnalysis = await pool.query(`
            SELECT
                es.status,
                COUNT(DISTINCT es.id) as session_count,
                COUNT(pl.id) as total_ai_flags,
                AVG(a.score) as avg_final_score
            FROM exam_sessions es
            LEFT JOIN proctor_logs pl ON pl.session_id = es.id AND (pl.violation_type IN ${FACE_FAMILY} OR pl.violation_type LIKE 'HEAD_TURN%')
            LEFT JOIN attempts a ON a.session_id = es.id
            GROUP BY es.status
        `);

        res.json({
            success: true,
            aiMetrics: {
                faceDetection: faceMetrics.rows[0],
                detectionBreakdown: detectionEvents.rows,
                sessionAnalysis: sessionAI.rows,
                outcomeCorrelation: outcomeAnalysis.rows,
                summary: {
                    totalAIDetections: parseInt(faceMetrics.rows[0]?.no_face_detections || 0) +
                                      parseInt(faceMetrics.rows[0]?.multiple_faces_detections || 0) +
                                      parseInt(faceMetrics.rows[0]?.different_face_detections || 0) +
                                      parseInt(faceMetrics.rows[0]?.gaze_violations || 0),
                    avgConfidence: parseFloat(faceMetrics.rows[0]?.avg_face_confidence || 0).toFixed(2)
                }
            }
        });
    } catch (err) {
        console.error("AI metrics error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/research/detection-timeline
 * Timeline of detection events for pattern analysis
 */
router.get('/detection-timeline', async (req, res) => {
    try {
        // Detection events over time (hourly buckets)
        const timeline = await pool.query(`
            SELECT 
                DATE_TRUNC('hour', created_at) as time_bucket,
                violation_type,
                COUNT(*) as event_count,
                AVG(trust_score) as avg_trust
            FROM proctor_logs
            WHERE created_at > NOW() - INTERVAL '7 days'
            GROUP BY time_bucket, violation_type
            ORDER BY time_bucket DESC
        `);

        // Detection sequence patterns (what violations occur together)
        const patterns = await pool.query(`
            SELECT 
                session_id,
                ARRAY_AGG(violation_type ORDER BY created_at) as violation_sequence,
                COUNT(*) as sequence_length
            FROM proctor_logs
            WHERE session_id IS NOT NULL
            GROUP BY session_id
            HAVING COUNT(*) >= 2
            ORDER BY sequence_length DESC
            LIMIT 100
        `);

        // Peak detection hours
        const peakHours = await pool.query(`
            SELECT 
                EXTRACT(HOUR FROM created_at) as hour_of_day,
                COUNT(*) as detection_count,
                AVG(trust_score) as avg_trust
            FROM proctor_logs
            GROUP BY hour_of_day
            ORDER BY detection_count DESC
        `);

        res.json({
            success: true,
            timeline: {
                hourlyEvents: timeline.rows,
                violationPatterns: patterns.rows.slice(0, 20),
                peakDetectionHours: peakHours.rows
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM PERFORMANCE METRICS (For Research Paper)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/research/system-metrics
 * System performance and load metrics
 */
router.get('/system-metrics', async (req, res) => {
    try {
        // Exam completion statistics (real session status vocabulary)
        const completionStats = await pool.query(`
            SELECT
                COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed_sessions,
                COUNT(*) FILTER (WHERE status = 'SUBMITTED') as submitted_sessions,
                COUNT(*) FILTER (WHERE status = 'TERMINATED') as terminated_sessions,
                COUNT(*) FILTER (WHERE status = 'IN_PROGRESS') as active_sessions,
                COUNT(*) FILTER (WHERE is_locked = true) as blocked_sessions,
                COUNT(*) FILTER (WHERE status = 'NOT_STARTED') as not_started_sessions,
                COUNT(*) FILTER (WHERE status = 'EXPIRED') as expired_sessions,
                COUNT(*) as total_sessions
            FROM exam_sessions
        `);

        // Average session duration
        const durationStats = await pool.query(`
            SELECT 
                AVG(EXTRACT(EPOCH FROM (COALESCE(finished_at, ended_at, NOW()) - started_at))) as avg_duration_seconds,
                MIN(EXTRACT(EPOCH FROM (COALESCE(finished_at, ended_at, NOW()) - started_at))) FILTER (WHERE finished_at IS NOT NULL) as min_duration_seconds,
                MAX(EXTRACT(EPOCH FROM (COALESCE(finished_at, ended_at, NOW()) - started_at))) FILTER (WHERE finished_at IS NOT NULL) as max_duration_seconds,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (COALESCE(finished_at, ended_at, NOW()) - started_at))) as median_duration_seconds
            FROM exam_sessions
            WHERE started_at IS NOT NULL
        `);

        // Load distribution by day
        const loadByDay = await pool.query(`
            SELECT 
                DATE_TRUNC('day', started_at) as day,
                COUNT(*) as sessions_started,
                COUNT(DISTINCT student_id) as unique_students
            FROM exam_sessions
            WHERE started_at > NOW() - INTERVAL '30 days'
            GROUP BY day
            ORDER BY day
        `);

        // Concurrent session peaks
        const concurrentPeaks = await pool.query(`
            SELECT 
                DATE_TRUNC('hour', started_at) as hour,
                COUNT(*) as sessions_started
            FROM exam_sessions
            WHERE started_at > NOW() - INTERVAL '7 days'
            GROUP BY hour
            ORDER BY sessions_started DESC
            LIMIT 10
        `);

        // Error/termination analysis
        const terminationReasons = await pool.query(`
            SELECT 
                es.status,
                COUNT(*) as count,
                AVG(COALESCE(
                    (SELECT MIN(trust_score) FROM proctor_logs WHERE session_id = es.id), 
                    100
                )) as avg_min_trust_at_termination
            FROM exam_sessions es
            WHERE es.status = 'TERMINATED' OR es.is_locked = true
            GROUP BY es.status
        `);

        res.json({
            success: true,
            systemMetrics: {
                sessionStatistics: {
                    ...completionStats.rows[0],
                    completionRate: completionStats.rows[0]?.total_sessions > 0
                        ? ((parseInt(completionStats.rows[0]?.completed_sessions || 0) + parseInt(completionStats.rows[0]?.submitted_sessions || 0)) / 
                           parseInt(completionStats.rows[0]?.total_sessions) * 100).toFixed(2) + '%'
                        : '0%'
                },
                durationAnalysis: {
                    avgDurationMinutes: (parseFloat(durationStats.rows[0]?.avg_duration_seconds || 0) / 60).toFixed(2),
                    minDurationMinutes: (parseFloat(durationStats.rows[0]?.min_duration_seconds || 0) / 60).toFixed(2),
                    maxDurationMinutes: (parseFloat(durationStats.rows[0]?.max_duration_seconds || 0) / 60).toFixed(2),
                    medianDurationMinutes: (parseFloat(durationStats.rows[0]?.median_duration_seconds || 0) / 60).toFixed(2)
                },
                loadDistribution: loadByDay.rows,
                peakConcurrency: concurrentPeaks.rows,
                terminationAnalysis: terminationReasons.rows
            }
        });
    } catch (err) {
        console.error("System metrics error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/research/exam-analysis
 * Detailed exam-level analysis
 */
router.get('/exam-analysis', async (req, res) => {
    try {
        // Per-exam statistics
        const examStats = await pool.query(`
            SELECT 
                e.id as exam_id,
                e.title,
                e.duration_minutes,
                COUNT(DISTINCT a.id) as total_attempts,
                COUNT(DISTINCT a.student_id) as unique_students,
                AVG(a.score) as avg_score,
                MIN(a.score) as min_score,
                MAX(a.score) as max_score,
                STDDEV(a.score) as score_stddev,
                COUNT(pl.id) as total_violations,
                COUNT(DISTINCT CASE WHEN pl.id IS NOT NULL THEN a.id END) as attempts_with_violations
            FROM exams e
            LEFT JOIN attempts a ON a.exam_id = e.id
            LEFT JOIN proctor_logs pl ON pl.attempt_id = a.id
            GROUP BY e.id, e.title, e.duration_minutes
            ORDER BY total_attempts DESC
        `);

        // Score distribution buckets
        const scoreDistribution = await pool.query(`
            SELECT 
                CASE 
                    WHEN score >= 90 THEN 'A (90-100)'
                    WHEN score >= 80 THEN 'B (80-89)'
                    WHEN score >= 70 THEN 'C (70-79)'
                    WHEN score >= 60 THEN 'D (60-69)'
                    ELSE 'F (0-59)'
                END as grade_bucket,
                COUNT(*) as count,
                AVG((SELECT COUNT(*) FROM proctor_logs WHERE attempt_id = a.id)) as avg_violations
            FROM attempts a
            GROUP BY grade_bucket
            ORDER BY grade_bucket
        `);

        // Correlation: violations vs score
        const violationScoreCorrelation = await pool.query(`
            SELECT 
                a.id,
                a.score,
                COUNT(pl.id) as violation_count,
                MIN(pl.trust_score) as min_trust
            FROM attempts a
            LEFT JOIN proctor_logs pl ON pl.attempt_id = a.id
            GROUP BY a.id, a.score
        `);

        // Calculate correlation coefficient
        const scores = violationScoreCorrelation.rows.map(r => parseFloat(r.score) || 0);
        const violations = violationScoreCorrelation.rows.map(r => parseInt(r.violation_count) || 0);
        const correlation = calculateCorrelation(scores, violations);

        res.json({
            success: true,
            examAnalysis: {
                perExamStats: examStats.rows,
                scoreDistribution: scoreDistribution.rows,
                violationScoreCorrelation: {
                    dataPoints: violationScoreCorrelation.rows.length,
                    correlationCoefficient: correlation.toFixed(4),
                    interpretation: correlation < -0.3 ? 'Moderate negative correlation (more violations = lower scores)' :
                                   correlation < 0 ? 'Weak negative correlation' :
                                   correlation < 0.3 ? 'Weak positive or no correlation' :
                                   'Positive correlation (unusual pattern)'
                }
            }
        });
    } catch (err) {
        console.error("Exam analysis error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Helper function to calculate Pearson correlation
function calculateCorrelation(arr1, arr2) {
    if (arr1.length !== arr2.length || arr1.length === 0) return 0;
    
    const n = arr1.length;
    const mean1 = arr1.reduce((a, b) => a + b, 0) / n;
    const mean2 = arr2.reduce((a, b) => a + b, 0) / n;
    
    let numerator = 0;
    let denom1 = 0;
    let denom2 = 0;
    
    for (let i = 0; i < n; i++) {
        const diff1 = arr1[i] - mean1;
        const diff2 = arr2[i] - mean2;
        numerator += diff1 * diff2;
        denom1 += diff1 * diff1;
        denom2 += diff2 * diff2;
    }
    
    const denominator = Math.sqrt(denom1) * Math.sqrt(denom2);
    return denominator === 0 ? 0 : numerator / denominator;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROCTORING METRICS (For Research Paper)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/research/proctor-metrics
 * Returns violation statistics for research analysis
 */
router.get('/proctor-metrics', async (req, res) => {
    try {
        const stats = await getViolationStatistics();
        
        // Get additional metrics from DB
        const examStats = await pool.query(`
            SELECT 
                COUNT(DISTINCT e.id) as total_exams,
                COUNT(DISTINCT a.id) as total_attempts,
                COUNT(DISTINCT a.student_id) as unique_students,
                AVG(a.score) as avg_score,
                MIN(a.score) as min_score,
                MAX(a.score) as max_score
            FROM exams e
            LEFT JOIN attempts a ON a.exam_id = e.id
        `);
        
        // Get attempts with violations vs clean attempts
        const integrityStats = await pool.query(`
            SELECT 
                a.id as attempt_id,
                a.score,
                COUNT(p.id) as violation_count,
                MIN(p.trust_score) as min_trust
            FROM attempts a
            LEFT JOIN proctor_logs p ON p.attempt_id = a.id
            GROUP BY a.id, a.score
        `);
        
        const attemptsWithViolations = integrityStats.rows.filter(r => r.violation_count > 0).length;
        const cleanAttempts = integrityStats.rows.filter(r => r.violation_count === 0).length;
        
        res.json({
            success: true,
            metrics: {
                violations: stats,
                examStatistics: examStats.rows[0],
                integrityAnalysis: {
                    totalAttempts: integrityStats.rows.length,
                    attemptsWithViolations,
                    cleanAttempts,
                    violationRate: integrityStats.rows.length > 0 
                        ? ((attemptsWithViolations / integrityStats.rows.length) * 100).toFixed(2) + '%'
                        : '0%'
                }
            }
        });
    } catch (err) {
        console.error("Research metrics error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/research/violation-breakdown
 * Detailed breakdown of violation types for charts
 */
router.get('/violation-breakdown', async (req, res) => {
    try {
        // By type
        const byType = await pool.query(`
            SELECT 
                violation_type,
                COUNT(*) as count,
                AVG(trust_score) as avg_trust_at_violation
            FROM proctor_logs
            GROUP BY violation_type
            ORDER BY count DESC
        `);
        
        // By hour of day (to see patterns)
        const byHour = await pool.query(`
            SELECT 
                EXTRACT(HOUR FROM created_at) as hour,
                COUNT(*) as count
            FROM proctor_logs
            GROUP BY hour
            ORDER BY hour
        `);
        
        // By exam
        const byExam = await pool.query(`
            SELECT 
                e.title as exam_title,
                COUNT(p.id) as violation_count,
                COUNT(DISTINCT p.student_id) as students_with_violations
            FROM proctor_logs p
            JOIN exams e ON e.id = p.exam_id
            GROUP BY e.id, e.title
            ORDER BY violation_count DESC
        `);
        
        res.json({
            success: true,
            breakdown: {
                byType: byType.rows,
                byHour: byHour.rows,
                byExam: byExam.rows
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/research/detection-accuracy
 * Metrics for evaluating detection system accuracy
 */
router.get('/detection-accuracy', async (req, res) => {
    try {
        // Get detection events with outcomes
        const detectionEvents = await pool.query(`
            SELECT 
                violation_type,
                COUNT(*) as detections,
                COUNT(CASE WHEN trust_score < 50 THEN 1 END) as led_to_block,
                AVG(trust_score) as avg_trust_after
            FROM proctor_logs
            GROUP BY violation_type
        `);
        
        // Get blocked sessions (real signal: lock flag or terminated by violations)
        const blockedSessions = await pool.query(`
            SELECT COUNT(*) as count
            FROM exam_sessions
            WHERE is_locked = true OR status = 'TERMINATED'
        `);
        
        // Get completed sessions
        const completedSessions = await pool.query(`
            SELECT COUNT(*) as count 
            FROM exam_sessions 
            WHERE status IN ('COMPLETED', 'SUBMITTED')
        `);
        
        res.json({
            success: true,
            accuracy: {
                detectionEvents: detectionEvents.rows,
                blockedCount: parseInt(blockedSessions.rows[0]?.count || 0),
                completedCount: parseInt(completedSessions.rows[0]?.count || 0),
                blockRate: completedSessions.rows[0]?.count > 0
                    ? ((blockedSessions.rows[0]?.count / completedSessions.rows[0]?.count) * 100).toFixed(2) + '%'
                    : '0%'
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCKCHAIN METRICS (For Research Paper)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/research/blockchain-metrics
 * Comprehensive blockchain integrity verification statistics
 */
router.get('/blockchain-metrics', async (req, res) => {
    try {
        const chainStats = await getBlockchainStatistics();
        
        // Get attempt counts - recorded vs pending
        const countResult = await pool.query(`
            SELECT 
                COUNT(*) as total_attempts,
                COUNT(blockchain_hash) as recorded_attempts,
                COUNT(*) - COUNT(blockchain_hash) as pending_attempts
            FROM attempts
            WHERE submitted_at IS NOT NULL
        `);
        
        const counts = countResult.rows[0];
        
        // Get attempts with blockchain hashes for verification
        const { rows: recordedAttempts } = await pool.query(`
            SELECT a.id, a.blockchain_hash, a.blockchain_tx, a.exam_id, a.student_id, 
                   a.score, a.submitted_at, a.answers_json
            FROM attempts a
            WHERE a.blockchain_hash IS NOT NULL
            ORDER BY a.submitted_at DESC
            LIMIT 50
        `);

        // Verify hashes by regenerating and comparing (not on-chain check)
        let verifiedCount = 0;
        let hashMismatches = 0;
        const stateCounts = { VERIFIED: 0, STALE_ANCHOR: 0, TAMPERED: 0 };

        for (const attempt of recordedAttempts) {
            try {
                const currentHash = generateAttemptHash(attempt);
                if (attempt.blockchain_hash === currentHash) {
                    verifiedCount++;
                    stateCounts.VERIFIED++;
                } else {
                    hashMismatches++;
                    // Distinguish honest drift from tampering using the chain
                    // record when reachable.
                    let state = 'STALE_ANCHOR';
                    try {
                        const rec = await fetchOnChainAttemptHash(attempt.id);
                        if (rec?.exists && rec.onChainHash && rec.onChainHash !== attempt.blockchain_hash) {
                            state = 'TAMPERED';
                        }
                    } catch (_) { /* chain unreachable — default to drift */ }
                    stateCounts[state]++;
                }
            } catch (e) {
                // Skip verification errors
            }
        }

        // Blockchain recording timeline
        const recordingTimeline = await pool.query(`
            SELECT
                DATE_TRUNC('day', submitted_at) as day,
                COUNT(*) as attempts_submitted,
                COUNT(blockchain_hash) as blockchain_recorded
            FROM attempts
            WHERE submitted_at > NOW() - INTERVAL '30 days'
            GROUP BY day
            ORDER BY day
        `);

        res.json({
            success: true,
            blockchain: {
                networkStatistics: chainStats,
                attemptCounts: {
                    total: parseInt(counts.total_attempts) || 0,
                    recorded: parseInt(counts.recorded_attempts) || 0,
                    pending: parseInt(counts.pending_attempts) || 0
                },
                verificationSummary: {
                    sampleSize: recordedAttempts.length,
                    verified: verifiedCount,
                    hashMismatches,
                    verificationRate: recordedAttempts.length > 0
                        ? ((verifiedCount / recordedAttempts.length) * 100).toFixed(2) + '%'
                        : 'N/A',
                    states: stateCounts
                },
                recordingTimeline: recordingTimeline.rows,
                integrityStatus: hashMismatches === 0 ? "HEALTHY" : "INTEGRITY_WARNINGS",
                totalRecordedAttempts: parseInt(counts.recorded_attempts) || 0
            }
        });
    } catch (err) {
        console.error("Blockchain metrics error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/research/blockchain-audit
 * Full blockchain audit trail for research
 */
router.get('/blockchain-audit', async (req, res) => {
    try {
        // Get all blockchain-recorded attempts with their verification status
        const { rows: recordedAttempts } = await pool.query(`
            SELECT 
                a.id as attempt_id,
                a.exam_id,
                a.student_id,
                a.score,
                a.blockchain_hash,
                a.blockchain_tx,
                a.submitted_at,
                e.title as exam_title,
                u.full_name as student_name,
                (SELECT COUNT(*) FROM proctor_logs WHERE attempt_id = a.id) as violation_count
            FROM attempts a
            JOIN exams e ON e.id = a.exam_id
            JOIN users u ON u.id = a.student_id
            WHERE a.blockchain_hash IS NOT NULL
            ORDER BY a.submitted_at DESC
        `);

        // Hash distribution analysis
        const hashStats = await pool.query(`
            SELECT 
                CASE 
                    WHEN blockchain_hash IS NOT NULL THEN 'recorded'
                    ELSE 'pending'
                END as status,
                COUNT(*) as count
            FROM attempts
            GROUP BY status
        `);

        // Verify a sample of hashes
        const sampleVerifications = [];
        for (const attempt of recordedAttempts.slice(0, 10)) {
            const currentHash = generateAttemptHash(attempt);
            let state = 'STALE_ANCHOR';
            try {
                const rec = await fetchOnChainAttemptHash(attempt.attempt_id);
                state = deriveIntegrityState({
                    exists: rec?.exists,
                    chainHash: rec?.onChainHash || null,
                    storedHash: attempt.blockchain_hash,
                    currentHash,
                });
            } catch (_) { /* chain unreachable */ }
            sampleVerifications.push({
                attemptId: attempt.attempt_id,
                storedHash: attempt.blockchain_hash?.substring(0, 16) + '...',
                currentHash: currentHash.substring(0, 16) + '...',
                hashMatch: attempt.blockchain_hash === currentHash,
                state,
                score: attempt.score,
                violations: attempt.violation_count
            });
        }

        res.json({
            success: true,
            audit: {
                totalRecorded: recordedAttempts.length,
                hashDistribution: hashStats.rows,
                sampleVerifications: sampleVerifications,
                auditTimestamp: new Date().toISOString(),
                integrityReport: {
                    sampledRecords: sampleVerifications.length,
                    passedVerification: sampleVerifications.filter(s => s.state === 'VERIFIED').length,
                    failedVerification: sampleVerifications.filter(s => s.hashMatch === false).length
                }
            }
        });
    } catch (err) {
        console.error("Blockchain audit error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/research/verify-integrity
 * Verify integrity of a specific attempt
 */
router.post('/verify-integrity', async (req, res) => {
    try {
        const { attemptId } = req.body;
        
        // Get attempt data
        const { rows: attemptRows } = await pool.query(
            'SELECT * FROM attempts WHERE id = $1',
            [attemptId]
        );
        
        if (attemptRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Attempt not found' });
        }
        
        const attempt = attemptRows[0];
        
        // Get proctor logs
        const { rows: logs } = await pool.query(
            'SELECT * FROM proctor_logs WHERE attempt_id = $1 ORDER BY created_at',
            [attemptId]
        );
        
        // Verify against blockchain (four-state result)
        const attemptVerification = await verifyAttemptIntegrity(attemptId, attempt);

        res.json({
            success: true,
            verification: {
                attemptId,
                attemptData: attemptVerification,
                logsCount: logs.length,
                currentDataHash: generateAttemptHash(attempt),
                currentLogsHash: generateLogsHash(logs),
                integrityStatus: attemptVerification.state || (attemptVerification.verified ? 'VALID' : 'UNVERIFIED'),
                state: attemptVerification.state || null
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORT DATA (For Research Paper Charts)
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// DETECTION QUALITY (TPR / FPR / Precision / Recall / F1 — thesis §4.1.2)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/research/detection-quality
 * Computes confusion-matrix metrics by comparing a session's proctor logs
 * (or an inline log array) against ground-truth annotated events.
 *
 * Body: {
 *   sessionId?: number,                  // load proctor_logs for this session, OR
 *   logs?: [{ violation_type, created_at }],
 *   groundTruth: [{ type, timestamp }],  // required annotated events
 *   toleranceMs?: number,                // default 3000
 *   negativeWindows?: number             // enables FPR/accuracy
 * }
 */
router.post('/detection-quality', async (req, res) => {
    try {
        const { sessionId, logs, groundTruth, toleranceMs, negativeWindows } = req.body || {};

        if (!Array.isArray(groundTruth) || groundTruth.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'groundTruth must be a non-empty array of { type, timestamp } events'
            });
        }

        let detected;
        if (Array.isArray(logs)) {
            detected = fromProctorLogs(logs);
        } else if (sessionId !== undefined && sessionId !== null) {
            const { rows } = await pool.query(
                'SELECT violation_type, created_at FROM proctor_logs WHERE session_id = $1 ORDER BY created_at',
                [sessionId]
            );
            detected = fromProctorLogs(rows);
        } else {
            return res.status(400).json({
                success: false,
                message: 'Provide either `logs` (array of proctor-log rows) or `sessionId`'
            });
        }

        const evaluation = evaluateDetection(groundTruth, detected, {
            toleranceMs: Number.isFinite(Number(toleranceMs)) && Number(toleranceMs) > 0
                ? Number(toleranceMs)
                : DEFAULT_TOLERANCE_MS,
            negativeWindows: Number.isFinite(Number(negativeWindows)) && negativeWindows !== null && negativeWindows !== ''
                ? Number(negativeWindows)
                : null,
        });

        res.json({
            success: true,
            evaluation: {
                ...evaluation,
                detectedEventCount: detected.length,
                groundTruthEventCount: groundTruth.length,
                generatedAt: new Date().toISOString()
            }
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/research/export/violations
 * Export all violation data as JSON for analysis
 */
router.get('/export/violations', async (req, res) => {
    try {
        const format = req.query.format || 'json';
        const { rows } = await pool.query(`
            SELECT 
                p.id,
                p.session_id,
                p.student_id,
                p.exam_id,
                p.violation_type,
                p.description,
                p.severity,
                p.trust_score,
                p.tab_title,
                p.metadata,
                p.created_at,
                u.full_name as student_name,
                e.title as exam_title
            FROM proctor_logs p
            LEFT JOIN users u ON u.id = p.student_id
            LEFT JOIN exams e ON e.id = p.exam_id
            ORDER BY p.created_at DESC
        `);
        
        if (format === 'csv') {
            const csv = jsonToCSV(rows);
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=violations.csv');
            return res.send(csv);
        }
        
        res.json({
            success: true,
            exportedAt: new Date().toISOString(),
            count: rows.length,
            data: rows
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/research/export/attempts
 * Export all attempt data with scores and violations
 */
router.get('/export/attempts', async (req, res) => {
    try {
        const format = req.query.format || 'json';
        const { rows } = await pool.query(`
            SELECT 
                a.id,
                a.exam_id,
                a.student_id,
                a.score,
                a.correct_count,
                a.total_questions,
                a.blockchain_hash,
                a.submitted_at,
                u.full_name as student_name,
                u.student_id as student_roll,
                e.title as exam_title,
                (SELECT COUNT(*) FROM proctor_logs WHERE attempt_id = a.id) as violation_count,
                (SELECT MIN(trust_score) FROM proctor_logs WHERE attempt_id = a.id) as min_trust_score
            FROM attempts a
            JOIN users u ON u.id = a.student_id
            JOIN exams e ON e.id = a.exam_id
            ORDER BY a.submitted_at DESC
        `);
        
        if (format === 'csv') {
            const csv = jsonToCSV(rows);
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=attempts.csv');
            return res.send(csv);
        }
        
        res.json({
            success: true,
            exportedAt: new Date().toISOString(),
            count: rows.length,
            data: rows
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/research/summary
 * Complete summary for research paper - comprehensive dataset
 */
router.get('/summary', async (req, res) => {
    try {
        // System overview
        const overview = await pool.query(`
            SELECT 
                (SELECT COUNT(*) FROM users) as total_users,
                (SELECT COUNT(*) FROM users WHERE role = 'student') as total_students,
                (SELECT COUNT(*) FROM users WHERE role = 'instructor') as total_instructors,
                (SELECT COUNT(*) FROM exams) as total_exams,
                (SELECT COUNT(*) FROM exams WHERE is_published = true) as published_exams,
                (SELECT COUNT(*) FROM attempts) as total_attempts,
                (SELECT COUNT(*) FROM proctor_logs) as total_violations,
                (SELECT COUNT(DISTINCT student_id) FROM attempts) as students_attempted,
                (SELECT AVG(score) FROM attempts) as average_score,
                (SELECT STDDEV(score) FROM attempts) as score_stddev,
                (SELECT COUNT(*) FROM exam_sessions) as total_sessions,
                (SELECT COUNT(*) FROM exam_sessions WHERE status = 'COMPLETED') as completed_sessions,
                (SELECT COUNT(*) FROM exam_sessions WHERE status = 'TERMINATED') as terminated_sessions,
                (SELECT COUNT(*) FROM classes) as total_classes
        `);
        
        // AI Detection performance breakdown
        const aiDetection = await pool.query(`
            SELECT 
                violation_type,
                COUNT(*) as occurrences,
                AVG(trust_score) as avg_trust_after,
                AVG(confidence_score) as avg_confidence,
                COUNT(DISTINCT student_id) as affected_students,
                COUNT(DISTINCT session_id) as affected_sessions
            FROM proctor_logs
            GROUP BY violation_type
            ORDER BY occurrences DESC
        `);

        // Session outcome statistics
        const sessionOutcomes = await pool.query(`
            SELECT 
                status,
                COUNT(*) as count,
                AVG(EXTRACT(EPOCH FROM (COALESCE(finished_at, ended_at, NOW()) - started_at))/60) as avg_duration_minutes
            FROM exam_sessions
            WHERE started_at IS NOT NULL
            GROUP BY status
        `);

        // Score distribution
        const scoreDistribution = await pool.query(`
            SELECT 
                CASE 
                    WHEN score >= 90 THEN '90-100 (A)'
                    WHEN score >= 80 THEN '80-89 (B)'
                    WHEN score >= 70 THEN '70-79 (C)'
                    WHEN score >= 60 THEN '60-69 (D)'
                    ELSE '0-59 (F)'
                END as grade_range,
                COUNT(*) as count,
                ROUND(COUNT(*) * 100.0 / NULLIF((SELECT COUNT(*) FROM attempts), 0), 2) as percentage
            FROM attempts
            GROUP BY grade_range
            ORDER BY grade_range DESC
        `);

        // Trust score distribution
        const trustDistribution = await pool.query(`
            SELECT 
                CASE 
                    WHEN trust_score >= 80 THEN 'High (80-100)'
                    WHEN trust_score >= 60 THEN 'Medium (60-79)'
                    WHEN trust_score >= 40 THEN 'Low (40-59)'
                    ELSE 'Critical (0-39)'
                END as trust_level,
                COUNT(*) as count
            FROM proctor_logs
            GROUP BY trust_level
            ORDER BY trust_level
        `);

        // Violation rate by hour
        const violationsByHour = await pool.query(`
            SELECT 
                EXTRACT(HOUR FROM created_at) as hour,
                COUNT(*) as violations
            FROM proctor_logs
            GROUP BY hour
            ORDER BY hour
        `);
        
        // Blockchain stats
        const chainStats = await getBlockchainStatistics();

        // Calculate key research metrics
        const totalAttempts = parseInt(overview.rows[0]?.total_attempts || 0);
        const totalViolations = parseInt(overview.rows[0]?.total_violations || 0);
        const completedSessions = parseInt(overview.rows[0]?.completed_sessions || 0);
        const terminatedSessions = parseInt(overview.rows[0]?.terminated_sessions || 0);
        const totalSessions = parseInt(overview.rows[0]?.total_sessions || 0);
        
        res.json({
            success: true,
            summary: {
                systemOverview: overview.rows[0],
                aiDetectionMetrics: {
                    breakdown: aiDetection.rows,
                    totalDetections: totalViolations,
                    avgDetectionsPerAttempt: totalAttempts > 0 ? (totalViolations / totalAttempts).toFixed(2) : 0
                },
                sessionMetrics: {
                    outcomes: sessionOutcomes.rows,
                    completionRate: totalSessions > 0 ? ((completedSessions / totalSessions) * 100).toFixed(2) + '%' : '0%',
                    terminationRate: totalSessions > 0 ? ((terminatedSessions / totalSessions) * 100).toFixed(2) + '%' : '0%'
                },
                scoreAnalysis: {
                    distribution: scoreDistribution.rows,
                    average: parseFloat(overview.rows[0]?.average_score || 0).toFixed(2),
                    standardDeviation: parseFloat(overview.rows[0]?.score_stddev || 0).toFixed(2)
                },
                trustAnalysis: {
                    distribution: trustDistribution.rows,
                    violationsByTimeOfDay: violationsByHour.rows
                },
                blockchainIntegrity: chainStats,
                researchNotes: {
                    dataCollectionPeriod: 'All time',
                    sampleSize: {
                        students: parseInt(overview.rows[0]?.total_students || 0),
                        exams: parseInt(overview.rows[0]?.total_exams || 0),
                        attempts: totalAttempts,
                        proctorEvents: totalViolations
                    }
                },
                generatedAt: new Date().toISOString()
            }
        });
    } catch (err) {
        console.error("Research summary error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/research/full-export
 * Export complete research dataset for external analysis
 */
router.get('/full-export', async (req, res) => {
    try {
        const format = req.query.format || 'json';
        
        // All attempts with complete data
        const attempts = await pool.query(`
            SELECT 
                a.id as attempt_id,
                a.exam_id,
                a.student_id,
                a.score,
                a.correct_count,
                a.total_questions,
                a.answers_json,
                a.blockchain_hash,
                a.submitted_at,
                e.title as exam_title,
                e.duration_minutes,
                e.randomize_questions,
                b.name as student_batch,
                es.status as session_status,
                es.started_at as session_started,
                es.ended_at as session_ended,
                EXTRACT(EPOCH FROM (es.ended_at - es.started_at))/60 as actual_duration_minutes
            FROM attempts a
            JOIN exams e ON e.id = a.exam_id
            JOIN users u ON u.id = a.student_id
            LEFT JOIN batches b ON b.id = u.batch_id
            LEFT JOIN exam_sessions es ON es.id = a.session_id
            ORDER BY a.submitted_at DESC
        `);

        // All proctor events
        const proctorEvents = await pool.query(`
            SELECT 
                id,
                student_id,
                exam_id,
                session_id,
                attempt_id,
                violation_type,
                severity,
                trust_score,
                confidence_score,
                face_count,
                description,
                tab_title,
                created_at
            FROM proctor_logs
            ORDER BY created_at DESC
        `);

        // Session data
        const sessions = await pool.query(`
            SELECT 
                es.id,
                es.student_id,
                es.exam_id,
                es.status,
                es.started_at,
                es.ended_at,
                es.warning_count,
                es.violation_count,
                EXTRACT(EPOCH FROM (COALESCE(es.finished_at, es.ended_at, NOW()) - es.started_at))/60 as duration_minutes,
                u.full_name as student_name,
                e.title as exam_title
            FROM exam_sessions es
            LEFT JOIN users u ON u.id = es.student_id
            LEFT JOIN exams e ON e.id = es.exam_id
            WHERE es.started_at IS NOT NULL
            ORDER BY es.started_at DESC
        `);

        const exportData = {
            metadata: {
                exportedAt: new Date().toISOString(),
                version: '1.0',
                totalAttempts: attempts.rows.length,
                totalProctorEvents: proctorEvents.rows.length,
                totalSessions: sessions.rows.length
            },
            attempts: attempts.rows,
            proctorEvents: proctorEvents.rows,
            sessions: sessions.rows
        };

        if (format === 'csv') {
            // Generate CSV with all data combined into sheets
            let csv = '=== METADATA ===\n';
            csv += `Exported At,${exportData.metadata.exportedAt}\n`;
            csv += `Total Attempts,${exportData.metadata.totalAttempts}\n`;
            csv += `Total Proctor Events,${exportData.metadata.totalProctorEvents}\n`;
            csv += `Total Sessions,${exportData.metadata.totalSessions}\n\n`;
            
            csv += '=== ATTEMPTS ===\n';
            if (attempts.rows.length > 0) {
                const attemptKeys = ['attempt_id', 'exam_id', 'exam_title', 'student_id', 'score', 'correct_count', 'total_questions', 'student_batch', 'session_status', 'submitted_at', 'blockchain_hash'];
                csv += attemptKeys.join(',') + '\n';
                attempts.rows.forEach(row => {
                    csv += attemptKeys.map(k => `"${(row[k] ?? '').toString().replace(/"/g, '""')}"`).join(',') + '\n';
                });
            }
            
            csv += '\n=== PROCTOR EVENTS ===\n';
            if (proctorEvents.rows.length > 0) {
                const eventKeys = ['id', 'student_id', 'exam_id', 'session_id', 'attempt_id', 'violation_type', 'severity', 'trust_score', 'confidence_score', 'face_count', 'description', 'tab_title', 'created_at'];
                csv += eventKeys.join(',') + '\n';
                proctorEvents.rows.forEach(row => {
                    csv += eventKeys.map(k => `"${(row[k] ?? '').toString().replace(/"/g, '""')}"`).join(',') + '\n';
                });
            }
            
            csv += '\n=== SESSIONS ===\n';
            if (sessions.rows.length > 0) {
                const sessionKeys = ['id', 'student_id', 'student_name', 'exam_id', 'exam_title', 'status', 'warning_count', 'violation_count', 'duration_minutes', 'started_at', 'ended_at'];
                csv += sessionKeys.join(',') + '\n';
                sessions.rows.forEach(row => {
                    csv += sessionKeys.map(k => `"${(row[k] ?? '').toString().replace(/"/g, '""')}"`).join(',') + '\n';
                });
            }
            
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=blockproctor-full-export-${new Date().toISOString().split('T')[0]}.csv`);
            return res.send(csv);
        }

        res.json({
            success: true,
            export: exportData
        });
    } catch (err) {
        console.error("Full export error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/research/export/sessions
 * Export all session data with detailed status
 */
router.get('/export/sessions', async (req, res) => {
    try {
        const format = req.query.format || 'json';
        const { rows } = await pool.query(`
            SELECT 
                es.id as session_id,
                es.student_id,
                es.exam_id,
                es.status,
                es.started_at,
                es.ended_at,
                es.is_locked,
                es.lock_reason,
                es.warning_count,
                es.violation_count,
                es.time_remaining,
                u.full_name as student_name,
                u.student_id as student_roll,
                e.title as exam_title,
                e.duration_minutes,
                EXTRACT(EPOCH FROM (COALESCE(es.finished_at, es.ended_at, NOW()) - es.started_at))/60 as actual_duration_minutes,
                (SELECT COUNT(*) FROM proctor_logs WHERE session_id = es.id) as total_logs
            FROM exam_sessions es
            LEFT JOIN users u ON u.id = es.student_id
            LEFT JOIN exams e ON e.id = es.exam_id
            WHERE es.started_at IS NOT NULL
            ORDER BY es.started_at DESC
        `);
        
        if (format === 'csv') {
            const csv = jsonToCSV(rows);
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=sessions.csv');
            return res.send(csv);
        }
        
        res.json({
            success: true,
            exportedAt: new Date().toISOString(),
            count: rows.length,
            data: rows
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/research/export/students
 * Export all student data with attempt stats
 */
router.get('/export/students', async (req, res) => {
    try {
        const format = req.query.format || 'json';
        const { rows } = await pool.query(`
            SELECT 
                u.id,
                u.full_name as name,
                u.email,
                u.student_id as roll_number,
                u.enrollment_status,
                d.name as department,
                b.name as batch,
                u.created_at as registered_at,
                (SELECT COUNT(*) FROM attempts WHERE student_id = u.id) as total_attempts,
                (SELECT AVG(score) FROM attempts WHERE student_id = u.id) as avg_score,
                (SELECT COUNT(*) FROM proctor_logs WHERE student_id = u.id) as total_violations,
                (SELECT COUNT(*) FROM class_enrollments WHERE student_id = u.id) as enrolled_classes
            FROM users u
            LEFT JOIN departments d ON d.id = u.department_id
            LEFT JOIN batches b ON b.id = u.batch_id
            WHERE u.role = 'student' OR u.role IS NULL
            ORDER BY u.created_at DESC
        `);
        
        if (format === 'csv') {
            const csv = jsonToCSV(rows);
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=students.csv');
            return res.send(csv);
        }
        
        res.json({
            success: true,
            exportedAt: new Date().toISOString(),
            count: rows.length,
            data: rows
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/research/export/exams
 * Export all exam data with attempt stats
 */
router.get('/export/exams', async (req, res) => {
    try {
        const format = req.query.format || 'json';
        const { rows } = await pool.query(`
            SELECT 
                e.id,
                e.title,
                e.description,
                e.duration_minutes,
                e.is_published,
                e.randomize_questions,
                e.created_at,
                c.name as class_name,
                i.name as instructor_name,
                (SELECT COUNT(*) FROM attempts WHERE exam_id = e.id) as total_attempts,
                (SELECT AVG(score) FROM attempts WHERE exam_id = e.id) as avg_score,
                (SELECT MIN(score) FROM attempts WHERE exam_id = e.id) as min_score,
                (SELECT MAX(score) FROM attempts WHERE exam_id = e.id) as max_score,
                (SELECT STDDEV(score) FROM attempts WHERE exam_id = e.id) as score_stddev,
                (SELECT COUNT(*) FROM proctor_logs p JOIN attempts a ON a.id = p.attempt_id WHERE a.exam_id = e.id) as total_violations
            FROM exams e
            LEFT JOIN classes c ON c.id = e.class_id
            LEFT JOIN instructors i ON i.id = e.instructor_id
            ORDER BY e.created_at DESC
        `);
        
        if (format === 'csv') {
            const csv = jsonToCSV(rows);
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=exams.csv');
            return res.send(csv);
        }
        
        res.json({
            success: true,
            exportedAt: new Date().toISOString(),
            count: rows.length,
            data: rows
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/research/export/violation-summary
 * Export violation statistics grouped by type
 */
router.get('/export/violation-summary', async (req, res) => {
    try {
        const format = req.query.format || 'json';
        const { rows } = await pool.query(`
            SELECT 
                violation_type,
                severity,
                COUNT(*) as count,
                AVG(trust_score) as avg_trust_score,
                MIN(trust_score) as min_trust_score,
                MAX(trust_score) as max_trust_score,
                COUNT(DISTINCT student_id) as unique_students,
                COUNT(DISTINCT exam_id) as unique_exams
            FROM proctor_logs
            GROUP BY violation_type, severity
            ORDER BY count DESC
        `);
        
        if (format === 'csv') {
            const csv = jsonToCSV(rows);
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=violation_summary.csv');
            return res.send(csv);
        }
        
        res.json({
            success: true,
            exportedAt: new Date().toISOString(),
            count: rows.length,
            data: rows
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

export default router;
