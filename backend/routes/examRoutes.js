import express from 'express';
import dotenv from 'dotenv';
import { recordAttemptOnChain, generateAttemptHash } from '../services/blockchainService.js';
import { generateViolationsHash } from '../services/proctorService.js';
import { authenticate } from '../middleware/auth.js';
import { calculateScore } from '../utils/scoring.js';
import pool from '../config/db.js';
const router = express.Router();

// All exam endpoints require an authenticated user
router.use(authenticate);

/** List all exams with optional score and status for a student. */
router.get('/', async (req, res) => {
    try {
        const { studentId } = req.query;

        const query = `
            SELECT e.*, 
            (SELECT score FROM attempts a WHERE a.exam_id = e.id AND a.student_id = $1 LIMIT 1) as score,
            (SELECT status FROM exam_sessions s WHERE s.exam_id = e.id AND s.student_id = $1 LIMIT 1) as status
            FROM exams e
            ORDER BY e.id ASC
        `;
        
        const { rows } = await pool.query(query, [studentId || -1]);
        
        // Strip sensitive fields: question banks must never leak through the
        // list endpoint, and blockchain internals stay server-side.
        const exams = rows.map(({ questions_json, blockchain_hash, blockchain_tx, ...exam }) => ({
            ...exam,
            question_count: Array.isArray(questions_json) ? questions_json.length : null,
            is_completed: exam.status === 'COMPLETED' || exam.score != null,
            score: exam.score 
        }));

        res.json({ success: true, exams });
    } catch (err) {
        console.error("List Exams Error:", err);
        res.status(500).json({ error: err.message });
    }
});

/** Get a single exam by ID. */
router.get('/:id', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM exams WHERE id = $1', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ success: false });
        res.json({ success: true, exam: rows[0] });
    } catch (err) {
        console.error("Get Exam Error:", err);
        res.status(500).json({ error: err.message });
    }
});

/** Submit exam answers, calculate score, and record on blockchain. */
router.post('/submit', async (req, res) => {
    let client; // <--- FIX: Declared outside try block
    
    try {
        const { examId, studentId, answers } = req.body;

        // Session-state guard: a locked, completed or terminated session can
        // never be resubmitted through the legacy endpoint. No session row
        // (legacy clients) still proceeds as before.
        const existing = await pool.query(
            'SELECT status, is_locked FROM exam_sessions WHERE exam_id = $1 AND student_id = $2 LIMIT 1',
            [examId, studentId]
        );
        const session = existing.rows[0];
        if (session?.is_locked) {
            return res.status(403).json({
                success: false,
                locked: true,
                message: 'This exam has been locked due to violations'
            });
        }
        const TERMINAL = ['COMPLETED', 'SUBMITTED', 'EXPIRED', 'TERMINATED'];
        if (session && TERMINAL.includes(session.status)) {
            return res.status(400).json({
                success: false,
                completed: session.status === 'COMPLETED' || session.status === 'SUBMITTED',
                expired: session.status === 'EXPIRED',
                terminated: session.status === 'TERMINATED',
                message: `Exam session already ${String(session.status).toLowerCase()}`
            });
        }

        client = await pool.connect();
        // Start Transaction
        await client.query('BEGIN');

        // A. Calculate Score (format-agnostic, unified percentage scale)
        const examResult = await client.query('SELECT questions_json FROM exams WHERE id = $1', [examId]);
        if (examResult.rows.length === 0) throw new Error("Exam not found");

        const questions = examResult.rows[0].questions_json || [];
        const { score, correct: correctCount } = calculateScore(questions, answers);

        // B. Update 'exam_sessions'
        await client.query(
            `INSERT INTO exam_sessions (exam_id, student_id, status, finished_at, ended_at, result)
             VALUES ($1, $2, 'COMPLETED', NOW(), NOW(), $3)
             ON CONFLICT (exam_id, student_id) 
             DO UPDATE SET status = 'COMPLETED', finished_at = NOW(), ended_at = NOW(), result = $3`,
            [examId, studentId, score.toString()]
        );

        // C. Update 'attempts'
        const attemptResult = await client.query(
            `INSERT INTO attempts 
            (exam_id, student_id, answers_json, score, correct_count, total_questions, submitted_at)
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
            ON CONFLICT (exam_id, student_id)
            DO UPDATE SET 
                answers_json = EXCLUDED.answers_json,
                score = EXCLUDED.score,
                correct_count = EXCLUDED.correct_count,
                total_questions = EXCLUDED.total_questions,
                submitted_at = NOW()
            RETURNING *`,
            [examId, studentId, JSON.stringify(answers), score, correctCount, questions.length]
        );

        const attempt = attemptResult.rows[0];

        // Commit Transaction
        await client.query('COMMIT');

        // D. Record on Blockchain (async, don't block response)
        try {
            // Get proctor logs for this session
            const logsResult = await pool.query(
                'SELECT * FROM proctor_logs WHERE student_id = $1 AND exam_id = $2 ORDER BY created_at',
                [studentId, examId]
            );
            const proctorLogs = logsResult.rows;

            // Record attempt + logs on blockchain
            const blockchainResult = await recordAttemptOnChain(attempt, proctorLogs);
            
            console.log('📦 Blockchain record:', blockchainResult.success ? 'SUCCESS' : 'SKIPPED');
            
            // Store blockchain hash and tx in database if successful
            if (blockchainResult.success) {
                await pool.query(
                    `UPDATE attempts 
                     SET blockchain_hash = $1, blockchain_tx = $2 
                     WHERE id = $3`,
                    [blockchainResult.dataHash, blockchainResult.txHash, attempt.id]
                );
                console.log('✅ Blockchain hash stored in DB:', blockchainResult.dataHash?.substring(0, 16) + '...');
            }
        } catch (bcErr) {
            console.error('Blockchain recording failed (non-blocking):', bcErr.message);
        }

        res.json({ 
            success: true, 
            score, 
            attemptId: attempt.id,
            correctCount,
            totalQuestions: questions.length
        });

    } catch (err) {
        if (client) await client.query('ROLLBACK'); // Only rollback if connected
        console.error("Submission Transaction Error:", err);
        res.status(500).json({ success: false, message: err.message });
    } finally {
        if (client) client.release(); // Only release if connected
    }
});

export default router;