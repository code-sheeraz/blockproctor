import dotenv from 'dotenv';
import pool from '../config/db.js';
import { recordAttemptOnChain } from './blockchainService.js';
import { calculateScore } from '../utils/scoring.js';

// ═══════════════════════════════════════════════════════════════════════════════
// EXAM SESSION SERVICE - Handles session state, heartbeats, and violations
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fisher-Yates shuffle algorithm for randomizing questions
 */
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

/**
 * Prepare exam for student - randomize if enabled
 */
function prepareExamForStudent(exam, sessionResult = null) {
    // Parse questions_json if it's a string
    let questions = exam.questions_json;
    if (typeof questions === 'string') {
        try {
            questions = JSON.parse(questions);
        } catch (e) {
            questions = [];
        }
    }
    
    // If session has saved question order, use it (for resume)
    if (sessionResult?.questionOrder && Array.isArray(sessionResult.questionOrder)) {
        const orderedQuestions = sessionResult.questionOrder.map(idx => questions[idx]).filter(Boolean);
        if (orderedQuestions.length === questions.length) {
            return {
                ...exam,
                questions_json: orderedQuestions,
                questionOrder: sessionResult.questionOrder
            };
        }
    }
    
    // Randomize if enabled
    if (exam.randomize_questions && questions.length > 0) {
        // Create index array and shuffle
        const indices = questions.map((_, idx) => idx);
        const shuffledIndices = shuffleArray(indices);
        const shuffledQuestions = shuffledIndices.map(idx => questions[idx]);
        
        return {
            ...exam,
            questions_json: shuffledQuestions,
            questionOrder: shuffledIndices // Save order for session
        };
    }
    
    return {
        ...exam,
        questions_json: questions,
        questionOrder: questions.map((_, idx) => idx)
    };
}

const VIOLATION_WEIGHTS = {
    'TAB_SWITCH': 10,
    'TAB_HIDDEN': 5,
    'NO_FACE': 15,
    'MULTIPLE_FACES': 20,
    'FACE_MISMATCH': 25,
    'COPY_ATTEMPT': 5,
    'RIGHT_CLICK': 3,
    'KEYBOARD_SHORTCUT': 5,
    'FULLSCREEN_EXIT': 8,
    'DEVTOOLS_OPEN': 15,
    'SCREENSHOT_ATTEMPT': 10,
    'NETWORK_DISCONNECTION': 0, // Don't penalize network issues
    'SESSION_TIMEOUT': 0,
    'RECONNECTION': -5 // Bonus for legitimate reconnection
};

const SEVERITY_MAP = {
    'TAB_SWITCH': 'critical',
    'TAB_HIDDEN': 'warning',
    'NO_FACE': 'critical',
    'MULTIPLE_FACES': 'critical',
    'FACE_MISMATCH': 'critical',
    'COPY_ATTEMPT': 'warning',
    'RIGHT_CLICK': 'info',
    'KEYBOARD_SHORTCUT': 'warning',
    'FULLSCREEN_EXIT': 'warning',
    'DEVTOOLS_OPEN': 'critical',
    'SCREENSHOT_ATTEMPT': 'warning',
    'NETWORK_DISCONNECTION': 'info',
    'SESSION_TIMEOUT': 'info',
    'RECONNECTION': 'info'
};

/**
 * Start or resume an exam session
 */
export async function startSession(studentId, examId, clientInfo = {}) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // Check if exam exists and is published
        const examResult = await client.query(
            `SELECT e.*, c.id as class_id FROM exams e 
             JOIN classes c ON e.class_id = c.id 
             WHERE e.id = $1 AND e.is_published = true`,
            [examId]
        );
        
        if (examResult.rows.length === 0) {
            throw new Error('Exam not found or not published');
        }
        const exam = examResult.rows[0];
        
        // Check if student is enrolled in the class
        const enrollmentCheck = await client.query(
            `SELECT 1 FROM class_enrollments WHERE student_id = $1 AND class_id = $2 AND status = 'active'`,
            [studentId, exam.class_id]
        );
        
        if (enrollmentCheck.rows.length === 0) {
            throw new Error('Student not enrolled in this class');
        }
        
        // Check for existing session
        const existingSession = await client.query(
            `SELECT * FROM exam_sessions WHERE student_id = $1 AND exam_id = $2`,
            [studentId, examId]
        );
        
        if (existingSession.rows.length > 0) {
            const session = existingSession.rows[0];
            
            // If session is locked, deny access
            if (session.is_locked) {
                throw new Error(`LOCKED: ${session.lock_reason || 'This exam has been locked due to violations'}`);
            }
            
            // If session is completed, deny access
            if (session.status === 'COMPLETED' || session.status === 'SUBMITTED') {
                throw new Error('COMPLETED: You have already submitted this exam');
            }
            
            // Resume existing session
            const timeElapsed = Math.floor((Date.now() - new Date(session.started_at).getTime()) / 1000);
            const totalTime = exam.duration_minutes * 60;
            let timeRemaining = session.time_remaining || (totalTime - timeElapsed);
            
            // Check if time has expired
            if (timeRemaining <= 0) {
                await client.query(
                    `UPDATE exam_sessions SET status = 'EXPIRED', is_locked = true, lock_reason = 'Time expired' WHERE id = $1`,
                    [session.id]
                );
                throw new Error('EXPIRED: Exam time has expired');
            }
            
            // ANTI-CHEAT: Check how long student was away
            const GRACE_PERIOD_SECONDS = 10; // Only 10 seconds allowed for accidental disconnects
            const lastHeartbeat = session.last_heartbeat;
            if (lastHeartbeat) {
                const secondsAway = Math.floor((Date.now() - new Date(lastHeartbeat).getTime()) / 1000);
                
                if (secondsAway > GRACE_PERIOD_SECONDS) {
                    // Student was away too long - TERMINATE exam
                    await client.query(
                        `UPDATE exam_sessions 
                         SET status = 'TERMINATED', 
                             is_locked = true, 
                             lock_reason = $2,
                             locked_at = NOW(),
                             finished_at = NOW()
                         WHERE id = $1`,
                        [session.id, `Session terminated: Left exam for ${secondsAway} seconds (max allowed: ${GRACE_PERIOD_SECONDS}s)`]
                    );
                    
                    // Log the violation
                    await client.query(
                        `INSERT INTO proctor_logs (session_id, student_id, exam_id, violation_type, description, severity)
                         VALUES ($1, $2, $3, 'SESSION_ABANDONED', $4, 'critical')`,
                        [session.id, studentId, examId, `Student left exam for ${secondsAway} seconds and attempted to resume`]
                    );
                    
                    await client.query('COMMIT');
                    
                    throw new Error(`TERMINATED: You left the exam for ${secondsAway} seconds. Maximum allowed is ${GRACE_PERIOD_SECONDS} seconds. Your progress has been saved.`);
                }
            }
            
            // Update heartbeat and resume (within grace period)
            await client.query(
                `UPDATE exam_sessions SET last_heartbeat = NOW(), time_remaining = $2 WHERE id = $1`,
                [session.id, timeRemaining]
            );
            
            // Log reconnection
            await logHeartbeat(client, session.id, studentId, examId, 'reconnected', clientInfo);
            
            await client.query('COMMIT');
            
            // Parse session result for question order
            const sessionResult = session.result ? 
                (typeof session.result === 'string' ? JSON.parse(session.result) : session.result) 
                : null;
            
            return {
                success: true,
                session: { ...session, time_remaining: timeRemaining },
                exam: prepareExamForStudent(exam, sessionResult),
                resumed: true,
                message: 'Session resumed successfully'
            };
        }
        
        // Create new session
        const newSession = await client.query(
            `INSERT INTO exam_sessions (exam_id, student_id, status, started_at, last_heartbeat, time_remaining)
             VALUES ($1, $2, 'IN_PROGRESS', NOW(), NOW(), $3)
             RETURNING *`,
            [examId, studentId, exam.duration_minutes * 60]
        );
        
        // Prepare exam with randomization if enabled
        const preparedExam = prepareExamForStudent(exam);
        
        // Save question order in session result for consistency
        await client.query(
            `UPDATE exam_sessions SET result = $2 WHERE id = $1`,
            [newSession.rows[0].id, JSON.stringify({ questionOrder: preparedExam.questionOrder })]
        );
        
        // Log session start
        await logHeartbeat(client, newSession.rows[0].id, studentId, examId, 'active', clientInfo);
        
        await client.query('COMMIT');
        
        return {
            success: true,
            session: newSession.rows[0],
            exam: preparedExam,
            resumed: false,
            message: 'Exam session started'
        };
        
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Record heartbeat from client
 */
export async function recordHeartbeat(sessionId, studentId, examId, timeRemaining, clientInfo = {}, partialAnswers = null) {
    const client = await pool.connect();
    try {
        // Check session status
        const session = await client.query(
            `SELECT * FROM exam_sessions WHERE id = $1 AND student_id = $2`,
            [sessionId, studentId]
        );
        
        if (session.rows.length === 0) {
            return { success: false, error: 'Session not found' };
        }
        
        if (session.rows[0].is_locked) {
            return { 
                success: false, 
                locked: true, 
                lockReason: session.rows[0].lock_reason 
            };
        }
        
        // Calculate time since last heartbeat
        const lastHeartbeat = session.rows[0].last_heartbeat;
        const timeSinceLastHeartbeat = lastHeartbeat ? 
            Math.floor((Date.now() - new Date(lastHeartbeat).getTime()) / 1000) : 0;
        
        // Update session with time and partial answers
        if (partialAnswers !== null) {
            await client.query(
                `UPDATE exam_sessions 
                 SET last_heartbeat = NOW(), time_remaining = $2, result = $3
                 WHERE id = $1`,
                [sessionId, timeRemaining, JSON.stringify({ partialAnswers })]
            );
        } else {
            await client.query(
                `UPDATE exam_sessions 
                 SET last_heartbeat = NOW(), time_remaining = $2 
                 WHERE id = $1`,
                [sessionId, timeRemaining]
            );
        }
        
        // Log heartbeat (every 5th heartbeat to reduce DB writes)
        if (Math.random() < 0.2) {
            await logHeartbeat(client, sessionId, studentId, examId, 'active', clientInfo);
        }
        
        return { 
            success: true, 
            timeSinceLastHeartbeat,
            session: session.rows[0]
        };
        
    } finally {
        client.release();
    }
}

/**
 * Log a proctor violation
 */
export async function logViolation(sessionId, studentId, examId, violationType, description, metadata = {}, isSevere = false) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // Get session
        const session = await client.query(
            `SELECT es.*, e.max_warnings, e.max_violations, e.auto_lock_enabled 
             FROM exam_sessions es 
             JOIN exams e ON es.exam_id = e.id 
             WHERE es.id = $1`,
            [sessionId]
        );
        
        if (session.rows.length === 0) {
            throw new Error('Session not found');
        }
        
        if (session.rows[0].is_locked) {
            // Already locked, just log but don't process
            await insertViolationLog(client, sessionId, studentId, examId, violationType, description, metadata);
            await client.query('COMMIT');
            return { success: true, alreadyLocked: true };
        }
        
        const currentSession = session.rows[0];
        // NOTE: VIOLATION_WEIGHTS is exported for research/reporting only — the
        // auto-lock decision below is driven by severity counts, not weights.
        const severity = SEVERITY_MAP[violationType] || 'warning';
        
        // Insert violation log
        await insertViolationLog(client, sessionId, studentId, examId, violationType, description, metadata, severity);
        
        // Update violation counts
        let newWarningCount = currentSession.warning_count || 0;
        let newViolationCount = currentSession.violation_count || 0;
        
        if (severity === 'warning' || severity === 'info') {
            newWarningCount += 1;
        } else if (severity === 'critical') {
            newViolationCount += 1;
        }
        
        // SEVERE VIOLATIONS = IMMEDIATE LOCK (face mismatch, impersonation)
        const SEVERE_TYPES = ['FACE_MISMATCH', 'IMPERSONATION', 'MULTIPLE_FACES'];
        const isSevereViolation = isSevere || SEVERE_TYPES.includes(violationType);
        
        // Check if should auto-lock
        const maxWarnings = currentSession.max_warnings || 3;
        const maxViolations = currentSession.max_violations || 5;
        const shouldLock = isSevereViolation || (currentSession.auto_lock_enabled && (
            newViolationCount >= maxViolations ||
            newWarningCount >= maxWarnings * 2
        ));
        
        if (shouldLock) {
            const lockReason = isSevereViolation 
                ? `SEVERE: ${violationType} - ${description}`
                : `Auto-locked: ${newViolationCount} critical violations, ${newWarningCount} warnings`;
            
            await client.query(
                `UPDATE exam_sessions 
                 SET is_locked = true, 
                     lock_reason = $2, 
                     locked_at = NOW(),
                     warning_count = $3,
                     violation_count = $4
                 WHERE id = $1`,
                [sessionId, lockReason, newWarningCount, newViolationCount]
            );
            
            await client.query('COMMIT');
            return {
                success: true,
                locked: true,
                lockReason: isSevereViolation 
                    ? `Exam terminated: ${violationType.replace('_', ' ')}. Admin review required.`
                    : 'Too many violations detected. This exam has been locked.',
                warningCount: newWarningCount,
                violationCount: newViolationCount,
                isSevere: isSevereViolation
            };
        }
        
        // Just update counts
        await client.query(
            `UPDATE exam_sessions 
             SET warning_count = $2, violation_count = $3 
             WHERE id = $1`,
            [sessionId, newWarningCount, newViolationCount]
        );
        
        await client.query('COMMIT');
        
        return {
            success: true,
            locked: false,
            warningCount: newWarningCount,
            violationCount: newViolationCount,
            maxWarnings,
            maxViolations
        };
        
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Force submit on lock (saves partial progress as proof)
 */
export async function forceSubmitOnLock(sessionId, studentId, examId, answers, lockReason, timeRemaining) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // IDEMPOTENCY GUARD: severe locks can trigger force-submit from more
        // than one code path (violation handler + exam-block handler). Once an
        // attempt is anchored on-chain, re-finalizing it would mutate
        // submitted_at/answers and permanently break hash verification.
        const priorAttempt = await client.query(
            `SELECT id, score, blockchain_hash FROM attempts WHERE exam_id = $1 AND student_id = $2`,
            [examId, studentId]
        );
        if (
            priorAttempt.rows.length > 0 &&
            priorAttempt.rows[0].blockchain_hash
        ) {
            await client.query(
                `UPDATE exam_sessions
                 SET status = 'TERMINATED', finished_at = COALESCE(finished_at, NOW())
                 WHERE id = $1 AND status NOT IN ('COMPLETED','SUBMITTED')`,
                [sessionId]
            );
            await client.query('COMMIT');
            return {
                success: true,
                alreadyFinalized: true,
                score: Number(priorAttempt.rows[0].score) || 0,
                terminated: true,
                message: 'Progress already finalized and anchored — no changes made'
            };
        }

        // Calculate partial score (format-agnostic)
        const examResult = await client.query('SELECT questions_json FROM exams WHERE id = $1', [examId]);
        const questions = examResult.rows[0]?.questions_json || [];

        const { score, correct: correctCount } = calculateScore(questions, answers);

        // Update session status to TERMINATED (not COMPLETED)
        await client.query(
            `UPDATE exam_sessions 
             SET status = 'TERMINATED', 
                 finished_at = NOW(), 
                 result = $2,
                 time_remaining = $3
             WHERE id = $1`,
            [sessionId, score.toString(), timeRemaining]
        );
        
        // Create attempt record (marked as terminated)
        const attemptResult = await client.query(
            `INSERT INTO attempts 
             (exam_id, student_id, answers_json, score, correct_count, total_questions, submitted_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())
             ON CONFLICT (exam_id, student_id)
             DO UPDATE SET 
                 answers_json = EXCLUDED.answers_json,
                 score = EXCLUDED.score,
                 correct_count = EXCLUDED.correct_count,
                 submitted_at = NOW()
             RETURNING *`,
            [examId, studentId, JSON.stringify(answers), score, correctCount, questions.length]
        );
        
        // Link proctor logs to attempt
        if (attemptResult.rows.length > 0) {
            await client.query(
                `UPDATE proctor_logs SET attempt_id = $1 WHERE session_id = $2`,
                [attemptResult.rows[0].id, sessionId]
            );
        }
        
        await client.query('COMMIT');
        
        // Record on blockchain (async, non-blocking)
        const attemptId = attemptResult.rows[0]?.id;
        if (attemptId) {
            recordAttemptOnChainAsync(attemptId, studentId, examId);
        }
        
        return {
            success: true,
            score,
            correctCount,
            totalQuestions: questions.length,
            terminated: true,
            message: 'Progress saved on termination'
        };
        
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Submit exam (finalize session)
 */
export async function submitExam(sessionId, studentId, examId, answers) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // Verify session
        const session = await client.query(
            `SELECT * FROM exam_sessions WHERE id = $1 AND student_id = $2 AND exam_id = $3`,
            [sessionId, studentId, examId]
        );
        
        if (session.rows.length === 0) {
            throw new Error('Session not found');
        }
        
        if (session.rows[0].status === 'COMPLETED' || session.rows[0].status === 'SUBMITTED') {
            throw new Error('Exam already submitted');
        }
        
        // Calculate score (format-agnostic: numeric index or text keys)
        const examResult = await client.query('SELECT questions_json FROM exams WHERE id = $1', [examId]);
        const questions = examResult.rows[0]?.questions_json || [];

        const { score, correct: correctCount } = calculateScore(questions, answers);

        // Update session
        await client.query(
            `UPDATE exam_sessions
             SET status = 'COMPLETED', finished_at = NOW(), result = $2
             WHERE id = $1`,
            [sessionId, score.toString()]
        );
        
        // Create/update attempt record
        const attemptResult = await client.query(
            `INSERT INTO attempts 
             (exam_id, student_id, answers_json, score, correct_count, total_questions, submitted_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())
             ON CONFLICT (exam_id, student_id)
             DO UPDATE SET 
                 answers_json = EXCLUDED.answers_json,
                 score = EXCLUDED.score,
                 correct_count = EXCLUDED.correct_count,
                 submitted_at = NOW()
             RETURNING *`,
            [examId, studentId, JSON.stringify(answers), score, correctCount, questions.length]
        );
        
        // Link proctor logs to attempt
        await client.query(
            `UPDATE proctor_logs SET attempt_id = $1 WHERE session_id = $2`,
            [attemptResult.rows[0].id, sessionId]
        );
        
        await client.query('COMMIT');
        
        // Record on blockchain (async, non-blocking)
        const attemptId = attemptResult.rows[0].id;
        recordAttemptOnChainAsync(attemptId, studentId, examId);
        
        return {
            success: true,
            score,
            correctCount,
            totalQuestions: questions.length,
            attemptId
        };
        
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Request access for locked exam (technical issues)
 */
export async function requestAccess(studentId, examId, requestType, reason, evidenceData = {}) {
    const result = await pool.query(
        `INSERT INTO exam_access_requests (student_id, exam_id, request_type, reason, evidence_data)
         SELECT $1, $2, $3, $4, $5
         FROM exam_sessions es WHERE es.student_id = $1 AND es.exam_id = $2
         RETURNING *, (SELECT id FROM exam_sessions WHERE student_id = $1 AND exam_id = $2) as session_id`,
        [studentId, examId, requestType, reason, JSON.stringify(evidenceData)]
    );
    
    return result.rows[0];
}

/**
 * Admin: Get session details with all violations
 */
export async function getSessionDetails(sessionId) {
    const session = await pool.query(
        `SELECT es.*, 
                u.full_name as student_name, u.email as student_email,
                e.title as exam_title, e.duration_minutes,
                e.max_warnings, e.max_violations
         FROM exam_sessions es
         JOIN users u ON es.student_id = u.id
         JOIN exams e ON es.exam_id = e.id
         WHERE es.id = $1`,
        [sessionId]
    );
    
    if (session.rows.length === 0) return null;
    
    const violations = await pool.query(
        `SELECT * FROM proctor_logs WHERE session_id = $1 ORDER BY created_at`,
        [sessionId]
    );
    
    const heartbeats = await pool.query(
        `SELECT * FROM heartbeat_logs WHERE session_id = $1 ORDER BY timestamp DESC LIMIT 50`,
        [sessionId]
    );
    
    return {
        session: session.rows[0],
        violations: violations.rows,
        heartbeats: heartbeats.rows
    };
}

/**
 * Admin: Unlock session.
 * - IN_PROGRESS violation-lock: clears lock flags only (resume in place).
 * - TERMINATED/EXPIRED: archives any prior attempt (preserving its blockchain
 *   hash/tx in audit_attempts) and fully resets the row so the student gets a
 *   fresh retake whose new attempt id keeps on-chain verification VALID.
 */
export async function unlockSession(sessionId, adminNotes) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const sessionResult = await client.query(
            `SELECT es.*, e.duration_minutes
             FROM exam_sessions es
             JOIN exams e ON es.exam_id = e.id
             WHERE es.id = $1`,
            [sessionId]
        );

        if (sessionResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return null;
        }

        const session = sessionResult.rows[0];
        const TERMINAL_STATUSES = ['TERMINATED', 'EXPIRED'];
        const isTerminal = TERMINAL_STATUSES.includes(session.status);

        if (isTerminal) {
            await archiveAttemptsForRetake(client, {
                studentId: session.student_id,
                examId: session.exam_id,
                reason: `Unlock of ${session.status} session: ${adminNotes || 're-attempt granted by admin'}`,
            });

            await client.query(
                `UPDATE exam_sessions
                 SET is_locked = false,
                     lock_reason = NULL,
                     locked_at = NULL,
                     warning_count = 0,
                     violation_count = 0,
                     status = 'NOT_STARTED',
                     started_at = NULL,
                     finished_at = NULL,
                     ended_at = NULL,
                     submitted_at = NULL,
                     result = NULL,
                     question_order = NULL,
                     last_heartbeat = NULL,
                     time_remaining = $2
                 WHERE id = $1`,
                [sessionId, (session.duration_minutes || 60) * 60]
            );
        } else {
            await client.query(
                `UPDATE exam_sessions
                 SET is_locked = false, lock_reason = NULL, locked_at = NULL,
                     warning_count = 0, violation_count = 0
                 WHERE id = $1`,
                [sessionId]
            );
        }

        const updated = await client.query('SELECT * FROM exam_sessions WHERE id = $1', [sessionId]);

        await client.query(
            `INSERT INTO proctor_logs (session_id, student_id, exam_id, violation_type, description, severity)
             VALUES ($1, $2, $3, 'ADMIN_UNLOCK', $4, 'info')`,
            [
                sessionId,
                updated.rows[0]?.student_id ?? null,
                updated.rows[0]?.exam_id ?? null,
                adminNotes || (isTerminal ? 'Unlocked with full retake reset' : 'Admin unlocked session'),
            ]
        );

        await client.query('COMMIT');
        return updated.rows[0];
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Archive prior attempts for a retake: copy them into audit_attempts with
 * their blockchain references preserved, detach proctor logs from the doomed
 * attempt ids (FK safety — logs stay tied to the session), then delete the
 * attempts so the next submission inserts a NEW attempt id and records a
 * fresh on-chain hash. Must be called inside an open transaction.
 *
 * Note: ai_events rows cascade-delete with the attempt; they duplicate data
 * already captured in proctor_logs.
 */
export async function archiveAttemptsForRetake(client, { studentId, examId, reason }) {
    const attemptsResult = await client.query(
        `SELECT a.*, u.full_name AS student_name, u.student_id AS student_identifier,
                e.title AS exam_title
         FROM attempts a
         LEFT JOIN users u ON a.student_id = u.id
         LEFT JOIN exams e ON a.exam_id = e.id
         WHERE a.student_id = $1 AND a.exam_id = $2`,
        [studentId, examId]
    );

    let archived = 0;
    for (const att of attemptsResult.rows) {
        await client.query(
            `INSERT INTO audit_attempts (original_id, exam_id, exam_title, student_id, student_name,
                                        student_identifier, score, total_questions, correct_answers,
                                        answers, started_at, submitted_at, blockchain_hash, blockchain_tx,
                                        session_id, deleted_by, deleted_by_name, deletion_reason)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
            [att.id, att.exam_id, att.exam_title, att.student_id, att.student_name,
             att.student_identifier, att.score, att.total_questions, att.correct_count,
             JSON.stringify(att.answers_json ?? {}), att.started_at, att.submitted_at,
             att.blockchain_hash, att.blockchain_tx, att.session_id,
             null, 'admin', reason || 'Re-attempt granted']
        );
        archived++;
    }

    if (archived === 0) {
        return { archived: 0, deleted: 0 };
    }

    await client.query(
        `UPDATE proctor_logs SET attempt_id = NULL
         WHERE attempt_id IN (SELECT id FROM attempts WHERE student_id = $1 AND exam_id = $2)`,
        [studentId, examId]
    );

    const del = await client.query(
        'DELETE FROM attempts WHERE student_id = $1 AND exam_id = $2',
        [studentId, examId]
    );

    return { archived, deleted: del.rowCount ?? archived };
}

/**
 * Admin: Lock session manually
 */
export async function lockSession(sessionId, reason) {
    const result = await pool.query(
        `UPDATE exam_sessions 
         SET is_locked = true, lock_reason = $2, locked_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [sessionId, reason]
    );
    
    return result.rows[0];
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Inserts a heartbeat record for the given session. Called on every heartbeat
 * tick from the frontend to confirm the student's connection is alive.
 */
async function logHeartbeat(client, sessionId, studentId, examId, status, clientInfo) {
    await client.query(
        `INSERT INTO heartbeat_logs (session_id, student_id, exam_id, status, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [sessionId, studentId, examId, status, clientInfo.ip || null, clientInfo.userAgent || null]
    );
}

/**
 * Inserts a proctor-violation record into the proctor_logs table.
 * Coerces float metadata fields (trust_score, face_count) to integers to
 * match the INTEGER column types and avoid insert errors.
 */
async function insertViolationLog(client, sessionId, studentId, examId, violationType, description, metadata, severity = 'warning') {
    // trust_score/face_count columns are INTEGER — round float values to avoid insert errors
    const trustScore = metadata?.trustScore ?? metadata?.trust_score ?? null;
    const faceCount = metadata?.faceCount ?? metadata?.face_count ?? null;
    const confidenceScore = metadata?.confidenceScore ?? metadata?.confidence_score ?? null;

    await client.query(
        `INSERT INTO proctor_logs (
            session_id, student_id, exam_id, violation_type, description,
            metadata, severity, tab_title, trust_score, face_count, confidence_score
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
            sessionId,
            studentId,
            examId,
            violationType,
            description,
            JSON.stringify(metadata),
            severity,
            metadata?.tabTitle || null,
            trustScore != null ? Math.round(Number(trustScore)) : null,
            faceCount != null ? Math.round(Number(faceCount)) : null,
            confidenceScore != null ? Number(confidenceScore) : null
        ]
    );
}

/**
 * Async blockchain recording — non-blocking, never throws
 */
async function recordAttemptOnChainAsync(attemptId, studentId, examId) {
    try {
        const logsResult = await pool.query(
            'SELECT * FROM proctor_logs WHERE student_id = $1 AND exam_id = $2 ORDER BY created_at',
            [studentId, examId]
        );
        
        const attemptResult = await pool.query(
            'SELECT * FROM attempts WHERE id = $1',
            [attemptId]
        );
        
        if (attemptResult.rows.length === 0) return;

        // Choke point: never re-anchor an attempt that already carries an
        // on-chain anchor from this service's submit/force-submit flows.
        if (attemptResult.rows[0].blockchain_hash) {
            console.log(`⏭️ Attempt ${attemptId} already anchored — skipping duplicate anchor`);
            return;
        }

        const blockchainResult = await recordAttemptOnChain(attemptResult.rows[0], logsResult.rows);
        
        if (blockchainResult.success) {
            await pool.query(
                `UPDATE attempts SET blockchain_hash = $1, blockchain_tx = $2 WHERE id = $3`,
                [blockchainResult.dataHash, blockchainResult.txHash, attemptId]
            );
            console.log(`✅ Blockchain hash stored for attempt ${attemptId}:`, blockchainResult.dataHash?.substring(0, 16) + '...');
        }
    } catch (err) {
        console.error(`Blockchain recording failed for attempt ${attemptId}:`, err.message);
    }
}

export default {
    startSession,
    recordHeartbeat,
    logViolation,
    submitExam,
    forceSubmitOnLock,
    requestAccess,
    getSessionDetails,
    unlockSession,
    lockSession,
    archiveAttemptsForRetake,
    VIOLATION_WEIGHTS,
    SEVERITY_MAP
};
