// routes/studentRoutes.js
import express from 'express';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import { authenticate, authorize } from '../middleware/auth.js';
import pool from '../config/db.js';
const router = express.Router();

// All student endpoints require an authenticated student or admin
router.use(authenticate, authorize('student', 'admin'));

// ═══════════════════════════════════════════════════════════════════════════════
// STUDENT DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/:studentId/dashboard', async (req, res) => {
    try {
        const { studentId } = req.params;
        
        // Get student info (include whether they have a face photo for UI logic)
        const studentResult = await pool.query(
            `SELECT u.id, u.full_name as name, u.full_name as full_name, u.email, u.student_id, u.enrollment_status,
                    u.face_descriptor IS NOT NULL as has_face,
                    u.face_verification_photo IS NOT NULL as face_verification_photo,
                    d.name as department_name, d.code as department_code,
                    b.name as batch_name, b.year as batch_year
             FROM users u
             LEFT JOIN departments d ON u.department_id = d.id
             LEFT JOIN batches b ON u.batch_id = b.id
             WHERE u.id = $1`,
            [studentId]
        );
        
        if (studentResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }
        
        const student = studentResult.rows[0];
        
        // Get enrolled classes
        const classes = await pool.query(`
            SELECT c.id, c.name, c.code, 
                   i.name as instructor_name,
                   ce.enrolled_at
            FROM class_enrollments ce
            JOIN classes c ON ce.class_id = c.id
            LEFT JOIN instructors i ON c.instructor_id = i.id
            WHERE ce.student_id = $1 AND ce.status = 'active'
            ORDER BY c.name
        `, [studentId]);
        
        // Get available exams (only from enrolled classes)
        const exams = await pool.query(`
            SELECT e.id, e.title, e.duration_minutes, e.is_published, e.start_time, e.end_time,
                   c.name as class_name, c.code as class_code,
                   i.name as instructor_name,
                   a.id as attempt_id, a.score as attempt_score, a.submitted_at
            FROM exams e
            JOIN classes c ON e.class_id = c.id
            JOIN class_enrollments ce ON ce.class_id = c.id
            LEFT JOIN instructors i ON e.instructor_id = i.id
            LEFT JOIN attempts a ON a.exam_id = e.id AND a.student_id = $1
            WHERE ce.student_id = $1 
            AND ce.status = 'active'
            AND e.is_published = true
            ORDER BY e.created_at DESC
        `, [studentId]);
        
        // Get recent attempts
        const recentAttempts = await pool.query(`
            SELECT a.*, e.title as exam_title,
                   (SELECT COUNT(*) FROM proctor_logs WHERE attempt_id = a.id) as violation_count
            FROM attempts a
            JOIN exams e ON a.exam_id = e.id
            WHERE a.student_id = $1
            ORDER BY a.submitted_at DESC
            LIMIT 5
        `, [studentId]);
        
        res.json({
            success: true,
            student,
            classes: classes.rows,
            exams: exams.rows,
            recentAttempts: recentAttempts.rows
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET AVAILABLE EXAMS (Only from enrolled classes)
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/:studentId/exams/available', async (req, res) => {
    try {
        const { studentId } = req.params;
        
        // Check student enrollment status
        const studentCheck = await pool.query(
            'SELECT enrollment_status FROM users WHERE id = $1',
            [studentId]
        );
        
        if (studentCheck.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }
        
        if (studentCheck.rows[0].enrollment_status !== 'enrolled') {
            return res.json({ 
                success: true, 
                exams: [],
                message: `Student status: ${studentCheck.rows[0].enrollment_status}. Must be enrolled to see exams.`
            });
        }
        
        const result = await pool.query(`
            SELECT e.id, e.title, e.duration_minutes, e.is_published, e.start_time, e.end_time,
                   e.created_at,
                   c.name as class_name, c.code as class_code,
                   i.name as instructor_name,
                   a.id as attempt_id, a.score, a.submitted_at,
                   es.status as session_status,
                   es.is_locked,
                   es.lock_reason,
                   CASE 
                       WHEN es.is_locked THEN 'locked'
                       WHEN es.status = 'TERMINATED' THEN 'terminated'
                       WHEN es.status = 'COMPLETED' THEN 'completed'
                       WHEN es.status = 'IN_PROGRESS' THEN 'in_progress'
                       WHEN es.status = 'NOT_STARTED' OR es.status IS NULL THEN 
                           CASE 
                               WHEN e.end_time < NOW() THEN 'expired'
                               WHEN e.start_time > NOW() THEN 'upcoming'
                               ELSE 'available'
                           END
                       WHEN e.end_time < NOW() THEN 'expired'
                       WHEN e.start_time > NOW() THEN 'upcoming'
                       ELSE 'available'
                   END as status
            FROM exams e
            JOIN classes c ON e.class_id = c.id
            JOIN class_enrollments ce ON ce.class_id = c.id
            LEFT JOIN instructors i ON e.instructor_id = i.id
            LEFT JOIN attempts a ON a.exam_id = e.id AND a.student_id = $1
            LEFT JOIN exam_sessions es ON es.exam_id = e.id AND es.student_id = $1
            WHERE ce.student_id = $1 
            AND ce.status = 'active'
            AND e.is_published = true
            ORDER BY 
                CASE WHEN a.id IS NULL AND es.id IS NULL AND e.start_time <= NOW() AND (e.end_time IS NULL OR e.end_time >= NOW()) THEN 0 ELSE 1 END,
                e.created_at DESC
        `, [studentId]);
        
        res.json({ success: true, exams: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET EXAM DETAILS (Verify student has access)
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/:studentId/exams/:examId', async (req, res) => {
    try {
        const { studentId, examId } = req.params;
        
        // Verify student is enrolled in the exam's class
        const accessCheck = await pool.query(`
            SELECT e.*, c.name as class_name
            FROM exams e
            JOIN classes c ON e.class_id = c.id
            JOIN class_enrollments ce ON ce.class_id = c.id
            WHERE e.id = $1 AND ce.student_id = $2 AND ce.status = 'active'
        `, [examId, studentId]);
        
        if (accessCheck.rows.length === 0) {
            return res.status(403).json({ success: false, message: 'Not authorized to access this exam' });
        }
        
        const exam = accessCheck.rows[0];
        
        // Check for existing attempt
        const attemptResult = await pool.query(
            'SELECT * FROM attempts WHERE exam_id = $1 AND student_id = $2',
            [examId, studentId]
        );
        
        res.json({
            success: true,
            exam,
            attempt: attemptResult.rows[0] || null,
            hasAttempted: attemptResult.rows.length > 0
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET STUDENT ATTEMPTS
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/:studentId/attempts', async (req, res) => {
    try {
        const { studentId } = req.params;
        
        const result = await pool.query(`
            SELECT a.*, e.title as exam_title,
                   c.name as class_name,
                   (SELECT COUNT(*) FROM proctor_logs WHERE attempt_id = a.id) as violation_count,
                   (SELECT MIN(trust_score) FROM proctor_logs WHERE attempt_id = a.id) as min_trust_score
            FROM attempts a
            JOIN exams e ON a.exam_id = e.id
            LEFT JOIN classes c ON e.class_id = c.id
            WHERE a.student_id = $1
            ORDER BY a.submitted_at DESC
        `, [studentId]);
        
        res.json({ success: true, attempts: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// UPDATE STUDENT PROFILE (name, email, password) - requires current password
// ═══════════════════════════════════════════════════════════════════════════════

router.put('/:studentId/profile', async (req, res) => {
    try {
        const { studentId } = req.params;
        const { full_name, email, currentPassword, newPassword } = req.body;

        if (!currentPassword) {
            return res.status(400).json({ success: false, message: 'Current password is required to make changes' });
        }

        const result = await pool.query(
            'SELECT id, full_name, email, password_hash FROM users WHERE id = $1',
            [studentId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        const user = result.rows[0];

        // Verify current password (bcrypt hash with plaintext fallback, matching login logic)
        const valid = user.password_hash
            ? await bcrypt.compare(currentPassword, user.password_hash).catch(() => false)
            : user.password === currentPassword;

        if (!valid) {
            return res.status(401).json({ success: false, message: 'Current password is incorrect' });
        }

        const updates = [];
        const values = [];

        if (full_name && full_name.trim()) {
            values.push(full_name.trim());
            updates.push(`full_name = $${values.length}`);
        }

        if (email && email.trim()) {
            values.push(email.trim().toLowerCase());
            updates.push(`email = $${values.length}`);
        }

        if (newPassword) {
            if (String(newPassword).length < 6) {
                return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
            }
            const hashed = await bcrypt.hash(newPassword, 12);
            values.push(hashed);
            updates.push(`password_hash = $${values.length}`);
        }

        if (updates.length === 0) {
            return res.status(400).json({ success: false, message: 'No changes to save' });
        }

        values.push(studentId);
        const updateResult = await pool.query(
            `UPDATE users SET ${updates.join(', ')}, updated_at = NOW() 
             WHERE id = $${values.length} 
             RETURNING id, full_name as name, email`,
            values
        );

        res.json({ success: true, user: updateResult.rows[0], message: 'Profile updated successfully' });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(400).json({ success: false, message: 'Email is already in use by another account' });
        }
        res.status(500).json({ success: false, error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET ENROLLED CLASSES
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/:studentId/classes', async (req, res) => {
    try {
        const { studentId } = req.params;
        
        const result = await pool.query(`
            SELECT c.id, c.name, c.code, c.description,
                   i.name as instructor_name, i.email as instructor_email,
                   d.name as department_name,
                   b.name as batch_name,
                   ce.enrolled_at,
                   (SELECT COUNT(*) FROM exams WHERE class_id = c.id AND is_published = true) as exam_count
            FROM class_enrollments ce
            JOIN classes c ON ce.class_id = c.id
            LEFT JOIN instructors i ON c.instructor_id = i.id
            LEFT JOIN departments d ON c.department_id = d.id
            LEFT JOIN batches b ON c.batch_id = b.id
            WHERE ce.student_id = $1 AND ce.status = 'active'
            ORDER BY c.name
        `, [studentId]);
        
        res.json({ success: true, classes: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

export default router;
