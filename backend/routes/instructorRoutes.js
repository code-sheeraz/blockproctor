// routes/instructorRoutes.js
// Instructor routes for class and exam management

import express from 'express';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import { recordExamOnChain, generateExamHash } from '../services/blockchainService.js';
import { authenticate, authorize } from '../middleware/auth.js';
import pool from '../config/db.js';

const router = express.Router();

// ═══════════════════════════════════════════════════════════════════════════════
// INSTRUCTOR AUTHENTICATION
// ═══════════════════════════════════════════════════════════════════════════════

/** Authenticate an instructor and return session data. */
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const result = await pool.query(
            `SELECT i.id, i.name, i.email, i.password_hash, i.employee_id, i.department_id,
                    d.name as department_name, d.code as department_code
             FROM instructors i
             LEFT JOIN departments d ON i.department_id = d.id
             WHERE i.email = $1 AND i.is_active = true`,
            [email]
        );
        
        if (result.rows.length === 0) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        
        const match = result.rows[0].password_hash
            ? await bcrypt.compare(password, result.rows[0].password_hash).catch(() => false)
            : false;
        if (!match) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        
        await pool.query('UPDATE instructors SET last_login = NOW() WHERE id = $1', [result.rows[0].id]);
        
        res.json({ 
            success: true, 
            instructor: result.rows[0],
            role: 'instructor'
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// All remaining instructor routes require an authenticated instructor or admin
router.use(authenticate, authorize('admin', 'instructor'));

// ═══════════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════

/** Get dashboard stats, recent classes, and recent exams for an instructor. */
router.get('/:instructorId/dashboard', async (req, res) => {
    try {
        const { instructorId } = req.params;
        
        // Get instructor info
        const instructorResult = await pool.query(
            `SELECT i.*, d.name as department_name, d.code as department_code
             FROM instructors i
             LEFT JOIN departments d ON i.department_id = d.id
             WHERE i.id = $1`,
            [instructorId]
        );
        
        if (instructorResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Instructor not found' });
        }
        
        const instructor = instructorResult.rows[0];
        
        // Get stats
        const stats = await pool.query(`
            SELECT 
                (SELECT COUNT(*) FROM classes WHERE instructor_id = $1 AND is_active = true) as total_classes,
                (SELECT COUNT(*) FROM exams WHERE instructor_id = $1) as total_exams,
                (SELECT COUNT(DISTINCT ce.student_id) 
                 FROM class_enrollments ce 
                 JOIN classes c ON ce.class_id = c.id 
                 WHERE c.instructor_id = $1) as total_students,
                (SELECT COUNT(*) FROM users 
                 WHERE department_id = $2 
                 AND enrollment_status = 'pending_instructor') as pending_students
        `, [instructorId, instructor.department_id]);
        
        // Get recent classes
        const classes = await pool.query(`
            SELECT c.*, 
                   (SELECT COUNT(*) FROM class_enrollments WHERE class_id = c.id) as student_count,
                   (SELECT COUNT(*) FROM exams WHERE class_id = c.id) as exam_count
            FROM classes c
            WHERE c.instructor_id = $1 AND c.is_active = true
            ORDER BY c.created_at DESC
            LIMIT 5
        `, [instructorId]);
        
        // Get recent exams
        const exams = await pool.query(`
            SELECT e.*, c.name as class_name, c.code as class_code,
                   (SELECT COUNT(*) FROM attempts WHERE exam_id = e.id) as attempt_count
            FROM exams e
            LEFT JOIN classes c ON e.class_id = c.id
            WHERE e.instructor_id = $1
            ORDER BY e.created_at DESC
            LIMIT 5
        `, [instructorId]);
        
        res.json({ 
            success: true, 
            instructor,
            stats: stats.rows[0],
            classes: classes.rows,
            exams: exams.rows
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CLASS MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

/** List all classes for the authenticated instructor. */
router.get('/:instructorId/classes', async (req, res) => {
    try {
        const { instructorId } = req.params;
        
        const result = await pool.query(`
            SELECT c.*, 
                   b.name as batch_name, b.year as batch_year,
                   d.name as department_name,
                   (SELECT COUNT(*) FROM class_enrollments WHERE class_id = c.id AND status = 'active') as student_count,
                   (SELECT COUNT(*) FROM exams WHERE class_id = c.id) as exam_count
            FROM classes c
            LEFT JOIN batches b ON c.batch_id = b.id
            LEFT JOIN departments d ON c.department_id = d.id
            WHERE c.instructor_id = $1
            ORDER BY c.created_at DESC
        `, [instructorId]);
        
        res.json({ success: true, classes: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/** Create a new class under the authenticated instructor. */
router.post('/:instructorId/classes', async (req, res) => {
    try {
        const { instructorId } = req.params;
        const { name, code, description, department_id, batch_id, max_students } = req.body;
        
        const result = await pool.query(
            `INSERT INTO classes (name, code, description, instructor_id, department_id, batch_id, max_students)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [name, code, description, instructorId, department_id, batch_id, max_students || 50]
        );
        
        res.json({ success: true, class: result.rows[0] });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(400).json({ success: false, message: 'Class code already exists for this batch' });
        }
        res.status(500).json({ success: false, error: err.message });
    }
});

/** Get class details including enrolled students and exams. */
router.get('/:instructorId/classes/:classId', async (req, res) => {
    try {
        const { instructorId, classId } = req.params;
        
        // Get class info
        const classResult = await pool.query(`
            SELECT c.*, b.name as batch_name, d.name as department_name
            FROM classes c
            LEFT JOIN batches b ON c.batch_id = b.id
            LEFT JOIN departments d ON c.department_id = d.id
            WHERE c.id = $1 AND c.instructor_id = $2
        `, [classId, instructorId]);
        
        if (classResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Class not found' });
        }
        
        // Get enrolled students (face_verification_photo for identity check)
        const students = await pool.query(`
            SELECT u.id, u.full_name as name, u.email, u.student_id, u.face_verification_photo,
                   ce.enrolled_at, ce.status as enrollment_status
            FROM class_enrollments ce
            JOIN users u ON ce.student_id = u.id
            WHERE ce.class_id = $1
            ORDER BY u.full_name
        `, [classId]);
        
        // Get exams for this class
        const exams = await pool.query(`
            SELECT e.*, 
                   (SELECT COUNT(*) FROM attempts WHERE exam_id = e.id) as attempt_count
            FROM exams e
            WHERE e.class_id = $1
            ORDER BY e.created_at DESC
        `, [classId]);
        
        res.json({ 
            success: true, 
            class: classResult.rows[0],
            students: students.rows,
            exams: exams.rows
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/** Get enrolled students with exam attempt stats for a class. */
router.get('/:instructorId/classes/:classId/students', async (req, res) => {
    try {
        const { instructorId, classId } = req.params;
        
        // Verify class belongs to instructor
        const classCheck = await pool.query(
            'SELECT id, name, code FROM classes WHERE id = $1 AND instructor_id = $2',
            [classId, instructorId]
        );
        
        if (classCheck.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Class not found' });
        }
        
        // Get enrolled students with their exam attempt stats
        const students = await pool.query(`
            SELECT u.id, u.full_name as name, u.email, u.student_id, u.face_verification_photo,
                   ce.enrolled_at, ce.status as enrollment_status,
                   b.name as batch_name, b.year as batch_year,
                   (SELECT COUNT(*) FROM attempts a 
                    JOIN exams e ON a.exam_id = e.id 
                    WHERE a.student_id = u.id AND e.class_id = $1) as exam_attempts,
                   (SELECT AVG(a.score) FROM attempts a 
                    JOIN exams e ON a.exam_id = e.id 
                    WHERE a.student_id = u.id AND e.class_id = $1 AND a.score IS NOT NULL) as avg_score
            FROM class_enrollments ce
            JOIN users u ON ce.student_id = u.id
            LEFT JOIN batches b ON u.batch_id = b.id
            WHERE ce.class_id = $1 AND ce.status = 'active'
            ORDER BY u.full_name
        `, [classId]);
        
        res.json({ 
            success: true, 
            class: classCheck.rows[0],
            students: students.rows 
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// STUDENT MANAGEMENT (Add students to classes)
// ═══════════════════════════════════════════════════════════════════════════════

/** Get students pending instructor approval from the same department. */
router.get('/:instructorId/pending-students', async (req, res) => {
    try {
        const { instructorId } = req.params;
        
        // Get instructor's department
        const instructor = await pool.query(
            'SELECT department_id FROM instructors WHERE id = $1',
            [instructorId]
        );
        
        if (instructor.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Instructor not found' });
        }
        
        // Get students from same department waiting for instructor (face photo for verification)
        const result = await pool.query(`
            SELECT u.id, u.full_name as name, u.email, u.student_id, u.face_verification_photo, u.created_at,
                   b.name as batch_name, b.year as batch_year,
                   d.name as department_name
            FROM users u
            LEFT JOIN batches b ON u.batch_id = b.id
            LEFT JOIN departments d ON u.department_id = d.id
            WHERE u.department_id = $1 
            AND u.enrollment_status = 'pending_instructor'
            AND u.face_descriptor IS NOT NULL
            ORDER BY u.created_at DESC
        `, [instructor.rows[0].department_id]);
        
        res.json({ success: true, students: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/** Enroll a single student into a class. */
router.post('/:instructorId/classes/:classId/students', async (req, res) => {
    try {
        const { instructorId, classId } = req.params;
        const { student_id } = req.body;
        
        // Verify class belongs to instructor
        const classCheck = await pool.query(
            'SELECT id FROM classes WHERE id = $1 AND instructor_id = $2',
            [classId, instructorId]
        );
        
        if (classCheck.rows.length === 0) {
            return res.status(403).json({ success: false, message: 'Not authorized for this class' });
        }
        
        // Add student to class
        const result = await pool.query(
            `INSERT INTO class_enrollments (class_id, student_id, enrolled_by)
             VALUES ($1, $2, $3)
             ON CONFLICT (class_id, student_id) DO UPDATE SET status = 'active'
             RETURNING *`,
            [classId, student_id, instructorId]
        );
        
        // Update student status to enrolled
        await pool.query(
            `UPDATE users SET enrollment_status = 'enrolled', updated_at = NOW() 
             WHERE id = $1`,
            [student_id]
        );
        
        res.json({ success: true, enrollment: result.rows[0], message: 'Student added to class' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/** Enroll multiple students into a class in bulk. */
router.post('/:instructorId/classes/:classId/students/bulk', async (req, res) => {
    try {
        const { instructorId, classId } = req.params;
        const { student_ids } = req.body;
        
        if (!student_ids || !Array.isArray(student_ids)) {
            return res.status(400).json({ success: false, message: 'student_ids array required' });
        }
        
        // Verify class belongs to instructor
        const classCheck = await pool.query(
            'SELECT id FROM classes WHERE id = $1 AND instructor_id = $2',
            [classId, instructorId]
        );
        
        if (classCheck.rows.length === 0) {
            return res.status(403).json({ success: false, message: 'Not authorized for this class' });
        }
        
        // Add all students
        const added = [];
        for (const studentId of student_ids) {
            try {
                await pool.query(
                    `INSERT INTO class_enrollments (class_id, student_id, enrolled_by)
                     VALUES ($1, $2, $3)
                     ON CONFLICT (class_id, student_id) DO UPDATE SET status = 'active'`,
                    [classId, studentId, instructorId]
                );
                
                await pool.query(
                    `UPDATE users SET enrollment_status = 'enrolled', updated_at = NOW() 
                     WHERE id = $1`,
                    [studentId]
                );
                
                added.push(studentId);
            } catch (e) {
                console.error(`Failed to add student ${studentId}:`, e.message);
            }
        }
        
        res.json({ success: true, added_count: added.length, added_ids: added });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/** Remove a student from a class, returning them to the pending list. */
router.delete('/:instructorId/classes/:classId/students/:studentId', async (req, res) => {
    try {
        const { instructorId, classId, studentId } = req.params;
        
        // Delete the enrollment completely (student goes back to pending list)
        await pool.query(
            `DELETE FROM class_enrollments 
             WHERE class_id = $1 AND student_id = $2`,
            [classId, studentId]
        );
        
        res.json({ success: true, message: 'Student removed from class and returned to pending list' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// EXAM MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

/** List all exams created by the authenticated instructor. */
router.get('/:instructorId/exams', async (req, res) => {
    try {
        const { instructorId } = req.params;
        
        const result = await pool.query(`
            SELECT e.*, 
                   c.name as class_name, c.code as class_code,
                   (SELECT COUNT(*) FROM attempts WHERE exam_id = e.id) as attempt_count,
                   (SELECT COUNT(*) FROM class_enrollments WHERE class_id = e.class_id AND status = 'active') as eligible_students
            FROM exams e
            LEFT JOIN classes c ON e.class_id = c.id
            WHERE e.instructor_id = $1
            ORDER BY e.created_at DESC
        `, [instructorId]);
        
        res.json({ success: true, exams: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/** Create a new exam for a class. */
router.post('/:instructorId/exams', async (req, res) => {
    try {
        const { instructorId } = req.params;
        const { title, description, class_id, questions_json, duration_minutes, start_time, end_time, is_published, randomize_questions } = req.body;
        
        // Verify class belongs to instructor
        const classCheck = await pool.query(
            'SELECT id FROM classes WHERE id = $1 AND instructor_id = $2',
            [class_id, instructorId]
        );
        
        if (classCheck.rows.length === 0) {
            return res.status(403).json({ success: false, message: 'Not authorized for this class' });
        }
        
        const result = await pool.query(
            `INSERT INTO exams (title, description, class_id, instructor_id, questions_json, duration_minutes, start_time, end_time, is_published, randomize_questions)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             RETURNING *`,
            [title, description || null, class_id, instructorId, JSON.stringify(questions_json), duration_minutes, start_time || null, end_time || null, is_published || false, randomize_questions || false]
        );
        
        res.json({ success: true, exam: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/** Duplicate an existing exam as a new draft in the same class. */
router.post('/:instructorId/exams/:examId/duplicate', async (req, res) => {
    try {
        const { instructorId, examId } = req.params;

        const sourceResult = await pool.query(
            'SELECT * FROM exams WHERE id = $1 AND instructor_id = $2',
            [examId, instructorId]
        );

        if (sourceResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Exam not found or not authorized' });
        }

        const source = sourceResult.rows[0];

        let questions = source.questions_json || [];
        if (typeof questions === 'string') {
            try {
                questions = JSON.parse(questions);
            } catch {
                questions = [];
            }
        }
        if (!Array.isArray(questions)) questions = [];

        const result = await pool.query(
            `INSERT INTO exams (title, description, class_id, instructor_id, questions_json,
                                duration_minutes, randomize_questions, is_published)
             VALUES ($1, $2, $3, $4, $5, $6, $7, false)
             RETURNING *`,
            [
                `${source.title} (Copy)`,
                source.description || null,
                source.class_id,
                instructorId,
                JSON.stringify(questions),
                source.duration_minutes,
                source.randomize_questions || false,
            ]
        );

        res.json({
            success: true,
            exam: result.rows[0],
            questionCount: questions.length,
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/** Get full details of a single exam including class info. */
router.get('/:instructorId/exams/:examId', async (req, res) => {
    try {
        const { instructorId, examId } = req.params;
        
        const result = await pool.query(
            `SELECT e.*, c.name as class_name 
             FROM exams e
             JOIN classes c ON e.class_id = c.id
             WHERE e.id = $1 AND e.instructor_id = $2`,
            [examId, instructorId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Exam not found or not authorized' });
        }
        
        res.json({ success: true, exam: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/** Update exam fields such as title, questions, schedule, or publish state. */
router.put('/:instructorId/exams/:examId', async (req, res) => {
    try {
        const { instructorId, examId } = req.params;
        const { title, description, questions_json, duration_minutes, start_time, end_time, is_published, randomize_questions } = req.body;
        
        const result = await pool.query(
            `UPDATE exams 
             SET title = COALESCE($1, title),
                 description = COALESCE($2, description),
                 questions_json = COALESCE($3, questions_json),
                 duration_minutes = COALESCE($4, duration_minutes),
                 start_time = $5,
                 end_time = $6,
                 is_published = COALESCE($7, is_published),
                 randomize_questions = COALESCE($8, randomize_questions)
             WHERE id = $9 AND instructor_id = $10
             RETURNING *`,
            [title, description || null, questions_json ? JSON.stringify(questions_json) : null, duration_minutes, start_time || null, end_time || null, is_published, randomize_questions, examId, instructorId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Exam not found or not authorized' });
        }
        
        res.json({ success: true, exam: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/** Get exam results with per-attempt proctor logs and summary stats. */
router.get('/:instructorId/exams/:examId/results', async (req, res) => {
    try {
        const { instructorId, examId } = req.params;
        
        // Verify exam belongs to instructor
        const examCheck = await pool.query(
            'SELECT * FROM exams WHERE id = $1 AND instructor_id = $2',
            [examId, instructorId]
        );
        
        if (examCheck.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Exam not found' });
        }
        
        // Get all attempts with proctor data
        const attempts = await pool.query(`
            SELECT a.*, 
                   a.student_id as student_db_id,
                   u.full_name as student_name, u.email as student_email, 
                   u.student_id as student_roll_no,
                   (SELECT COUNT(*) FROM proctor_logs WHERE attempt_id = a.id) as violation_count,
                   (SELECT MIN(trust_score) FROM proctor_logs WHERE attempt_id = a.id) as min_trust_score
            FROM attempts a
            JOIN users u ON a.student_id = u.id
            WHERE a.exam_id = $1
            ORDER BY a.score DESC
        `, [examId]);

        // Attach proctor logs to each attempt (for per-attempt detail view)
        const attemptsWithLogs = await Promise.all(attempts.rows.map(async (a) => {
            const logs = await pool.query(
                `SELECT id, violation_type, description, severity, trust_score, created_at
                 FROM proctor_logs
                 WHERE attempt_id = $1
                 ORDER BY created_at DESC`,
                [a.id]
            );
            return { ...a, logs: logs.rows };
        }));
        
        // Get summary stats
        const stats = await pool.query(`
            SELECT 
                COUNT(*) as total_attempts,
                AVG(score) as avg_score,
                MAX(score) as max_score,
                MIN(score) as min_score,
                (SELECT COUNT(*) FROM proctor_logs p 
                 JOIN attempts a ON p.attempt_id = a.id 
                 WHERE a.exam_id = $1) as total_violations
            FROM attempts
            WHERE exam_id = $1
        `, [examId]);
        
        res.json({ 
            success: true, 
            exam: examCheck.rows[0],
            attempts: attemptsWithLogs,
            stats: stats.rows[0]
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLISH / UNPUBLISH EXAM
// ═══════════════════════════════════════════════════════════════════════════════

/** Publish an exam, making it visible to students, and record on blockchain. */
router.post('/:instructorId/exams/:examId/publish', async (req, res) => {
    try {
        const { instructorId, examId } = req.params;
        
        const result = await pool.query(
            `UPDATE exams 
             SET is_published = true 
             WHERE id = $1 AND instructor_id = $2
             RETURNING *`,
            [examId, instructorId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Exam not found or not authorized' });
        }
        
        const exam = result.rows[0];
        
        // Auto-record exam on blockchain when published
        try {
            const blockchainResult = await recordExamOnChain(parseInt(examId), exam);
            if (blockchainResult.success) {
                // Store blockchain hash in exam record
                await pool.query(
                    `UPDATE exams SET blockchain_hash = $1, blockchain_tx = $2 WHERE id = $3`,
                    [blockchainResult.dataHash, blockchainResult.txHash, examId]
                );
                console.log(`✅ Exam ${examId} recorded on blockchain: ${blockchainResult.dataHash?.substring(0, 16)}...`);
            } else {
                console.log(`⚠️ Blockchain recording skipped for exam ${examId}:`, blockchainResult.reason || 'unknown');
            }
        } catch (bcErr) {
            console.error(`Blockchain recording failed for exam ${examId} (non-blocking):`, bcErr.message);
        }
        
        res.json({ success: true, exam, message: 'Exam published successfully!' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/** Unpublish an exam, hiding it from students. */
router.post('/:instructorId/exams/:examId/unpublish', async (req, res) => {
    try {
        const { instructorId, examId } = req.params;
        
        const result = await pool.query(
            `UPDATE exams 
             SET is_published = false 
             WHERE id = $1 AND instructor_id = $2
             RETURNING *`,
            [examId, instructorId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Exam not found or not authorized' });
        }
        
        res.json({ success: true, exam: result.rows[0], message: 'Exam unpublished' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/** Delete an exam and archive all related data for audit. */
router.delete('/:instructorId/exams/:examId', async (req, res) => {
    const client = await pool.connect();
    try {
        const { instructorId, examId } = req.params;
        const { reason } = req.body || {}; // DELETE requests may have no body
        
        await client.query('BEGIN');
        
        // First verify the exam belongs to this instructor and get details
        const examCheck = await client.query(`
            SELECT e.*, c.name as class_name, i.name as instructor_name
            FROM exams e
            LEFT JOIN classes c ON e.class_id = c.id
            LEFT JOIN instructors i ON e.instructor_id = i.id
            WHERE e.id = $1 AND e.instructor_id = $2
        `, [examId, instructorId]);
        
        if (examCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Exam not found or not authorized' });
        }
        
        const exam = examCheck.rows[0];
        
        // Get instructor info for audit
        const instructorInfo = await client.query('SELECT name FROM instructors WHERE id = $1', [instructorId]);
        const instructorName = instructorInfo.rows[0]?.name || 'Unknown';
        
        // Count attempts
        const attemptCount = await client.query('SELECT COUNT(*) FROM attempts WHERE exam_id = $1', [examId]);
        
        // 1. Archive exam to audit table
        await client.query(`
            INSERT INTO audit_exams (original_id, title, description, class_id, class_name, instructor_id,
                                     instructor_name, duration_minutes, start_time, end_time, is_active,
                                     questions, total_attempts, created_at, deleted_by, deleted_by_name, deletion_reason)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        `, [exam.id, exam.title, exam.description, exam.class_id, exam.class_name, exam.instructor_id,
            exam.instructor_name, exam.duration_minutes, exam.start_time, exam.end_time, exam.is_active,
            JSON.stringify(exam.questions), attemptCount.rows[0].count, exam.created_at,
            instructorId, instructorName, reason || 'No reason provided']);
        
        // 2. Archive attempts
        const attempts = await client.query(`
            SELECT a.*, u.full_name as student_name, u.student_id as student_identifier
            FROM attempts a
            JOIN users u ON a.student_id = u.id
            WHERE a.exam_id = $1
        `, [examId]);
        
        for (const att of attempts.rows) {
            await client.query(`
                INSERT INTO audit_attempts (original_id, exam_id, exam_title, student_id, student_name,
                                            student_identifier, score, total_questions, correct_answers,
                                            answers, started_at, submitted_at, blockchain_hash, blockchain_tx,
                                            session_id, deleted_by, deleted_by_name, deletion_reason)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
            `, [att.id, att.exam_id, exam.title, att.student_id, att.student_name, att.student_identifier,
                att.score, att.total_questions, att.correct_answers, JSON.stringify(att.answers_json),
                att.started_at, att.submitted_at, att.blockchain_hash, att.blockchain_tx, att.session_id,
                instructorId, instructorName, reason || 'No reason provided']);
        }
        
        // 3. Archive proctor logs
        const proctorLogs = await client.query(`
            SELECT pl.*, u.full_name as student_name
            FROM proctor_logs pl
            LEFT JOIN users u ON pl.student_id = u.id
            WHERE pl.exam_id = $1
        `, [examId]);
        
        for (const log of proctorLogs.rows) {
            await client.query(`
                INSERT INTO audit_proctor_logs (original_id, attempt_id, exam_title, student_id, student_name,
                                                event_type, event_data, confidence_score, face_count,
                                                screenshot_url, timestamp, deleted_by, deleted_by_name, deletion_reason)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            `, [log.id, log.attempt_id, exam.title, log.student_id, log.student_name, log.event_type,
                JSON.stringify(log.event_data), log.confidence_score, log.face_count, log.screenshot_url,
                log.timestamp, instructorId, instructorName, reason || 'No reason provided']);
        }
        
        // 4. Archive exam sessions
        const sessions = await client.query(`
            SELECT es.*, u.full_name as student_name
            FROM exam_sessions es
            LEFT JOIN users u ON es.student_id = u.id
            WHERE es.exam_id = $1
        `, [examId]);
        
        for (const sess of sessions.rows) {
            await client.query(`
                INSERT INTO audit_exam_sessions (original_id, exam_id, exam_title, student_id, student_name,
                                                 status, started_at, submitted_at, ended_at, created_at,
                                                 deleted_by, deleted_by_name, deletion_reason)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            `, [sess.id, sess.exam_id, exam.title, sess.student_id, sess.student_name, sess.status,
                sess.started_at, sess.submitted_at, sess.ended_at, sess.created_at,
                instructorId, instructorName, reason || 'No reason provided']);
        }
        
        // 4b. Archive heartbeat logs
        const heartbeats = await client.query(`
            SELECT hl.*, u.full_name as student_name, e.title as exam_title
            FROM heartbeat_logs hl
            LEFT JOIN users u ON hl.student_id = u.id
            LEFT JOIN exams e ON hl.exam_id = e.id
            WHERE hl.exam_id = $1
        `, [examId]);

        for (const beat of heartbeats.rows) {
            await client.query(`
                INSERT INTO audit_heartbeat_logs (original_id, session_id, exam_title, student_name,
                                                  event_type, event_data, timestamp, deletion_reason)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `, [beat.id, beat.session_id, beat.exam_title, beat.student_name, beat.status,
                JSON.stringify({ ip_address: beat.ip_address, user_agent: beat.user_agent }),
                beat.timestamp, reason || 'No reason provided']);
        }

        // 5. Delete in order of dependencies
        await client.query('DELETE FROM heartbeat_logs WHERE exam_id = $1', [examId]);
        await client.query('DELETE FROM exam_access_requests WHERE exam_id = $1', [examId]);
        await client.query('DELETE FROM proctor_logs WHERE exam_id = $1', [examId]);
        await client.query('DELETE FROM attempts WHERE exam_id = $1', [examId]);
        await client.query('DELETE FROM exam_sessions WHERE exam_id = $1', [examId]);
        await client.query('DELETE FROM exams WHERE id = $1', [examId]);
        
        // 6. Log deletion
        await client.query(`
            INSERT INTO audit_deletion_log (table_name, record_id, deleted_by_id, deleted_by_role, 
                                            deleted_by_name, deletion_reason, metadata)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, ['exams', examId, instructorId, 'instructor', instructorName, reason || 'No reason provided',
            JSON.stringify({ exam_title: exam.title, attempt_count: attemptCount.rows[0].count })]);
        
        await client.query('COMMIT');
        
        res.json({ 
            success: true, 
            message: `Exam "${exam.title}" deleted. ${attempts.rows.length} attempts archived for audit.`
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Delete exam error:', err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER: Get available batches and departments
// ═══════════════════════════════════════════════════════════════════════════════

/** List all active batches. */
router.get('/meta/batches', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM batches WHERE is_active = true ORDER BY year DESC, semester');
        res.json({ success: true, batches: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/** List all departments. */
router.get('/meta/departments', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM departments ORDER BY name');
        res.json({ success: true, departments: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE CLASS WITH AUDIT
// ═══════════════════════════════════════════════════════════════════════════════

/** Delete a class and archive all related exams, enrollments, and logs for audit. */
router.delete('/:instructorId/classes/:classId', async (req, res) => {
    const client = await pool.connect();
    try {
        const { instructorId, classId } = req.params;
        const { reason } = req.body || {}; // DELETE requests may have no body
        
        await client.query('BEGIN');
        
        // Verify class belongs to instructor
        const classCheck = await client.query(`
            SELECT c.*, i.name as instructor_name, d.name as department_name,
                   (SELECT COUNT(*) FROM class_enrollments WHERE class_id = c.id) as student_count
            FROM classes c
            LEFT JOIN instructors i ON c.instructor_id = i.id
            LEFT JOIN departments d ON c.department_id = d.id
            WHERE c.id = $1 AND c.instructor_id = $2
        `, [classId, instructorId]);
        
        if (classCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Class not found or not authorized' });
        }
        
        const cls = classCheck.rows[0];
        
        // Get instructor info for audit
        const instructorInfo = await client.query('SELECT name FROM instructors WHERE id = $1', [instructorId]);
        const instructorName = instructorInfo.rows[0]?.name || 'Unknown';
        
        // 1. Archive class to audit table
        await client.query(`
            INSERT INTO audit_classes (original_id, name, code, description, instructor_id, instructor_name, 
                                       department_id, department_name, student_count, is_active, created_at,
                                       deleted_by, deleted_by_name, deletion_reason)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        `, [cls.id, cls.name, cls.code, cls.description, cls.instructor_id, cls.instructor_name,
            cls.department_id, cls.department_name, cls.student_count, cls.is_active, cls.created_at,
            instructorId, instructorName, reason || 'No reason provided']);
        
        // 2. Archive enrollments
        const enrollments = await client.query(`
            SELECT ce.*, u.full_name as student_name, u.student_id as student_identifier, c.name as class_name
            FROM class_enrollments ce
            JOIN users u ON ce.student_id = u.id
            JOIN classes c ON ce.class_id = c.id
            WHERE ce.class_id = $1
        `, [classId]);
        
        for (const enr of enrollments.rows) {
            await client.query(`
                INSERT INTO audit_class_enrollments (original_id, class_id, class_name, student_id, student_name,
                                                     student_identifier, status, enrolled_at, deleted_by, 
                                                     deleted_by_name, deletion_reason)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            `, [enr.id, enr.class_id, enr.class_name, enr.student_id, enr.student_name,
                enr.student_identifier, enr.status, enr.enrolled_at, instructorId, instructorName,
                'Class deleted: ' + (reason || 'No reason provided')]);
        }
        
        // 3. Get and archive all exams for this class
        const exams = await client.query('SELECT * FROM exams WHERE class_id = $1', [classId]);
        
        for (const exam of exams.rows) {
            // Archive exam
            await client.query(`
                INSERT INTO audit_exams (original_id, title, description, class_id, class_name, instructor_id,
                                         instructor_name, duration_minutes, start_time, end_time, is_active,
                                         questions, deleted_by, deleted_by_name, deletion_reason)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            `, [exam.id, exam.title, exam.description, exam.class_id, cls.name, exam.instructor_id,
                instructorName, exam.duration_minutes, exam.start_time, exam.end_time, exam.is_active,
                JSON.stringify(exam.questions), instructorId, instructorName,
                'Class deleted: ' + (reason || 'No reason provided')]);
            
            // Archive attempts for this exam
            const attempts = await client.query(`
                SELECT a.*, u.full_name as student_name, u.student_id as student_identifier, e.title as exam_title
                FROM attempts a
                JOIN users u ON a.student_id = u.id
                JOIN exams e ON a.exam_id = e.id
                WHERE a.exam_id = $1
            `, [exam.id]);
            
            for (const att of attempts.rows) {
                await client.query(`
                    INSERT INTO audit_attempts (original_id, exam_id, exam_title, student_id, student_name,
                                                student_identifier, score, total_questions, correct_answers,
                                                answers, started_at, submitted_at, blockchain_hash, blockchain_tx,
                                                session_id, deleted_by, deleted_by_name, deletion_reason)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
                `, [att.id, att.exam_id, att.exam_title, att.student_id, att.student_name, att.student_identifier,
                    att.score, att.total_questions, att.correct_answers, JSON.stringify(att.answers_json),
                    att.started_at, att.submitted_at, att.blockchain_hash, att.blockchain_tx, att.session_id,
                    instructorId, instructorName, 'Class deleted: ' + (reason || 'No reason provided')]);
            }
            
            // Archive proctor logs for this exam
            const proctorLogs = await client.query(`
                SELECT pl.*, u.full_name as student_name, e.title as exam_title
                FROM proctor_logs pl
                LEFT JOIN users u ON pl.student_id = u.id
                LEFT JOIN exams e ON pl.exam_id = e.id
                WHERE pl.exam_id = $1
            `, [exam.id]);
            
            for (const log of proctorLogs.rows) {
                await client.query(`
                    INSERT INTO audit_proctor_logs (original_id, attempt_id, exam_title, student_id, student_name,
                                                    event_type, event_data, confidence_score, face_count,
                                                    screenshot_url, timestamp, deleted_by, deleted_by_name, deletion_reason)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                `, [log.id, log.attempt_id, log.exam_title, log.student_id, log.student_name, log.event_type,
                    JSON.stringify(log.event_data), log.confidence_score, log.face_count, log.screenshot_url,
                    log.timestamp, instructorId, instructorName, 'Class deleted: ' + (reason || 'No reason provided')]);
            }
            
            // Archive exam sessions
            const sessions = await client.query(`
                SELECT es.*, u.full_name as student_name, e.title as exam_title
                FROM exam_sessions es
                LEFT JOIN users u ON es.student_id = u.id
                LEFT JOIN exams e ON es.exam_id = e.id
                WHERE es.exam_id = $1
            `, [exam.id]);
            
            for (const sess of sessions.rows) {
                await client.query(`
                    INSERT INTO audit_exam_sessions (original_id, exam_id, exam_title, student_id, student_name,
                                                     status, started_at, submitted_at, ended_at, created_at,
                                                     deleted_by, deleted_by_name, deletion_reason)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                `, [sess.id, sess.exam_id, sess.exam_title, sess.student_id, sess.student_name, sess.status,
                    sess.started_at, sess.submitted_at, sess.ended_at, sess.created_at,
                    instructorId, instructorName, 'Class deleted: ' + (reason || 'No reason provided')]);
            }
            
            // Archive heartbeat logs for this exam
            const heartbeats = await client.query(`
                SELECT hl.*, u.full_name as student_name, e.title as exam_title
                FROM heartbeat_logs hl
                LEFT JOIN users u ON hl.student_id = u.id
                LEFT JOIN exams e ON hl.exam_id = e.id
                WHERE hl.exam_id = $1
            `, [exam.id]);

            for (const beat of heartbeats.rows) {
                await client.query(`
                    INSERT INTO audit_heartbeat_logs (original_id, session_id, exam_title, student_name,
                                                      event_type, event_data, timestamp, deletion_reason)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                `, [beat.id, beat.session_id, beat.exam_title, beat.student_name, beat.status,
                    JSON.stringify({ ip_address: beat.ip_address, user_agent: beat.user_agent }),
                    beat.timestamp, 'Class deleted: ' + (reason || 'No reason provided')]);
            }

            // Delete exam data
            await client.query('DELETE FROM heartbeat_logs WHERE exam_id = $1', [exam.id]);
            await client.query('DELETE FROM exam_access_requests WHERE exam_id = $1', [exam.id]);
            await client.query('DELETE FROM proctor_logs WHERE exam_id = $1', [exam.id]);
            await client.query('DELETE FROM attempts WHERE exam_id = $1', [exam.id]);
            await client.query('DELETE FROM exam_sessions WHERE exam_id = $1', [exam.id]);
        }
        
        // 4. Delete exams
        await client.query('DELETE FROM exams WHERE class_id = $1', [classId]);
        
        // 5. Delete enrollments
        await client.query('DELETE FROM class_enrollments WHERE class_id = $1', [classId]);
        
        // 6. Delete the class
        await client.query('DELETE FROM classes WHERE id = $1', [classId]);
        
        // 7. Log deletion
        await client.query(`
            INSERT INTO audit_deletion_log (table_name, record_id, deleted_by_id, deleted_by_role, 
                                            deleted_by_name, deletion_reason, metadata)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, ['classes', classId, instructorId, 'instructor', instructorName, reason || 'No reason provided',
            JSON.stringify({ class_name: cls.name, student_count: cls.student_count, exam_count: exams.rows.length })]);
        
        await client.query('COMMIT');
        
        res.json({ 
            success: true, 
            message: `Class "${cls.name}" deleted. ${enrollments.rows.length} enrollments and ${exams.rows.length} exams archived for audit.`
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Delete class error:', err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
});

export default router;
