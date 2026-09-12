// services/proctorService.js
// Handles proctor logging with blockchain integrity

import db from '../config/db.js';
import { sha256 } from '../utils/hash.js';

/**
 * Log a proctoring violation during exam
 */
export async function logViolation({ studentId, examId, attemptId, type, description, trustScore, metadata }) {
    // trust_score column is INTEGER — round float scores to avoid insert errors
    const trustScoreInt = trustScore != null
        ? Math.round(Number(trustScore))
        : 100;

    const query = `
        INSERT INTO proctor_logs 
            (student_id, exam_id, attempt_id, violation_type, description, trust_score, metadata, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        RETURNING *;
    `;
    
    const { rows } = await db.query(query, [
        studentId,
        examId,
        attemptId || null,
        type,
        description,
        trustScoreInt,
        JSON.stringify(metadata || {})
    ]);
    
    return rows[0];
}

/**
 * Get all violations for an attempt
 */
export async function getViolationsForAttempt(attemptId) {
    const { rows } = await db.query(
        `SELECT * FROM proctor_logs WHERE attempt_id = $1 ORDER BY created_at ASC`,
        [attemptId]
    );
    return rows;
}

/**
 * Get violations for a student's exam session
 */
export async function getViolationsForSession(studentId, examId) {
    const { rows } = await db.query(
        `SELECT * FROM proctor_logs 
         WHERE student_id = $1 AND exam_id = $2 
         ORDER BY created_at ASC`,
        [studentId, examId]
    );
    return rows;
}

/**
 * Generate hash of all violations for blockchain storage
 */
export async function generateViolationsHash(studentId, examId) {
    const violations = await getViolationsForSession(studentId, examId);
    
    if (violations.length === 0) {
        return {
            hash: sha256(JSON.stringify({ studentId, examId, violations: [], count: 0 })),
            count: 0,
            violations: []
        };
    }
    
    // Create deterministic data structure for hashing
    const hashData = {
        studentId,
        examId,
        violations: violations.map(v => ({
            type: v.violation_type,
            description: v.description,
            trustScore: v.trust_score,
            timestamp: v.created_at
        })),
        count: violations.length,
        generatedAt: new Date().toISOString()
    };
    
    return {
        hash: sha256(JSON.stringify(hashData)),
        count: violations.length,
        violations: hashData.violations
    };
}

/**
 * Get violation statistics for research
 */
export async function getViolationStatistics() {
    const stats = await db.query(`
        SELECT 
            violation_type,
            COUNT(*) as count,
            AVG(trust_score) as avg_trust_score
        FROM proctor_logs
        GROUP BY violation_type
        ORDER BY count DESC
    `);
    
    const totalResult = await db.query(`
        SELECT 
            COUNT(*) as total_violations,
            COUNT(DISTINCT student_id) as students_with_violations,
            COUNT(DISTINCT exam_id) as exams_with_violations,
            AVG(trust_score) as overall_avg_trust
        FROM proctor_logs
    `);
    
    return {
        byType: stats.rows,
        totals: totalResult.rows[0]
    };
}

/**
 * Get detailed proctor summary for an attempt (for admin view)
 */
export async function getProctorSummary(attemptId) {
    const violations = await getViolationsForAttempt(attemptId);
    
    // Group by type
    const byType = {};
    violations.forEach(v => {
        if (!byType[v.violation_type]) {
            byType[v.violation_type] = { count: 0, instances: [] };
        }
        byType[v.violation_type].count++;
        byType[v.violation_type].instances.push({
            description: v.description,
            trustScore: v.trust_score,
            timestamp: v.created_at
        });
    });
    
    // Calculate metrics
    const trustScores = violations.map(v => v.trust_score).filter(t => t !== null);
    const minTrust = trustScores.length > 0 ? Math.min(...trustScores) : 100;
    const avgTrust = trustScores.length > 0 
        ? trustScores.reduce((a, b) => a + b, 0) / trustScores.length 
        : 100;
    
    return {
        attemptId,
        totalViolations: violations.length,
        violationsByType: byType,
        minTrustScore: minTrust,
        avgTrustScore: Math.round(avgTrust),
        timeline: violations.map(v => ({
            type: v.violation_type,
            description: v.description,
            trust: v.trust_score,
            time: v.created_at
        }))
    };
}

export default {
    logViolation,
    getViolationsForAttempt,
    getViolationsForSession,
    generateViolationsHash,
    getViolationStatistics,
    getProctorSummary
};
