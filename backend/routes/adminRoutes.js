import express from 'express';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const router = express.Router();

// Middleware placeholder
const isAdmin = async (req, res, next) => next();

// 1. GET PENDING ENROLLMENTS
router.get('/pending-enrollments', isAdmin, async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT id, full_name, email, profile_photo_url, enrollment_status, created_at
             FROM users 
             WHERE enrollment_status = 'PENDING'
             ORDER BY created_at DESC`
        );
        res.json({ success: true, enrollments: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// 2. APPROVE ENROLLMENT
router.post('/approve/:userId', isAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const result = await pool.query(
            `UPDATE users SET enrollment_status = 'APPROVED' WHERE id = $1 RETURNING id, full_name`,
            [userId]
        );
        if (result.rowCount === 0) return res.status(404).json({ success: false });
        res.json({ success: true, message: "User Approved", user: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 3. REJECT ENROLLMENT
router.post('/reject/:userId', isAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const result = await pool.query(
            `UPDATE users SET enrollment_status = 'REJECTED', face_descriptor = NULL, profile_photo_url = NULL 
             WHERE id = $1 RETURNING id, full_name`,
            [userId]
        );
        if (result.rowCount === 0) return res.status(404).json({ success: false });
        res.json({ success: true, message: "User Rejected", user: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 4. GET SUBMITTED EXAMS
router.get('/submitted-exams', isAdmin, async (req, res) => {
    try {
        // We join users and exams to get names. We use 'finished_at' for the date.
        const query = `
            SELECT es.id as session_id, es.student_id, es.exam_id, 
                   es.status, es.result as score, es.finished_at,
                   u.full_name, u.email, e.title as exam_title
            FROM exam_sessions es
            JOIN users u ON es.student_id = u.id
            JOIN exams e ON es.exam_id = e.id
            WHERE es.status IN ('SUBMITTED', 'COMPLETED')
            ORDER BY es.finished_at DESC
        `;
        const { rows } = await pool.query(query);
        res.json({ success: true, sessions: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// 5. RESET EXAM
router.post('/reset-exam/:sessionId', isAdmin, async (req, res) => {
    try {
        const { sessionId } = req.params;

        // Find details first
        const sessionCheck = await pool.query('SELECT exam_id, student_id FROM exam_sessions WHERE id = $1', [sessionId]);
        if (sessionCheck.rows.length === 0) return res.status(404).json({ success: false, message: "Session not found" });

        const { exam_id, student_id } = sessionCheck.rows[0];

        // Delete from both tables
        await pool.query('DELETE FROM attempts WHERE exam_id = $1 AND student_id = $2', [exam_id, student_id]);
        await pool.query('DELETE FROM exam_sessions WHERE id = $1', [sessionId]);

        res.json({ success: true, message: "Exam reset successfully." });
    } catch (err) {
        console.error("Reset Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

export default router;