// routes/adminRoutes.js
// Super Admin routes for system management

import express from 'express';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import { sha256 } from '../utils/hash.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { verifyAttemptIntegrity, isBlockchainReady } from '../services/blockchainService.js';
import { archiveAttemptsForRetake } from '../services/examSessionService.js';
import { calculateIntegrityScore } from '../utils/integrityScore.js';
import pool from '../config/db.js';
const router = express.Router();

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN AUTHENTICATION
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const result = await pool.query(
            'SELECT id, name, email, password_hash, is_super_admin FROM admins WHERE email = $1 AND is_active = true',
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
        
        // Update last login
        await pool.query('UPDATE admins SET last_login = NOW() WHERE id = $1', [result.rows[0].id]);
        
        res.json({ 
            success: true, 
            admin: result.rows[0],
            role: 'admin'
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// All remaining admin routes require an authenticated admin
router.use(authenticate, authorize('admin'));

// ═══════════════════════════════════════════════════════════════════════════════
// DASHBOARD STATISTICS
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/dashboard/stats', async (req, res) => {
    try {
        const stats = await pool.query(`
            SELECT 
                (SELECT COUNT(*) FROM users WHERE enrollment_status = 'pending_admin') as pending_students,
                (SELECT COUNT(*) FROM users WHERE enrollment_status = 'enrolled') as enrolled_students,
                (SELECT COUNT(*) FROM users) as total_students,
                (SELECT COUNT(*) FROM instructors WHERE is_active = true) as total_instructors,
                (SELECT COUNT(*) FROM exams) as total_exams,
                (SELECT COUNT(*) FROM classes WHERE is_active = true) as total_classes,
                (SELECT COUNT(*) FROM departments) as total_departments,
                (SELECT COUNT(*) FROM attempts) as total_attempts
        `);
        
        res.json({ success: true, stats: stats.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ALL STUDENTS (with enrollment status and photos)
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/students', async (req, res) => {
    try {
        const { status } = req.query;
        
        let query = `
            SELECT 
                u.id, u.full_name as name, u.email, u.student_id, u.enrollment_status,
                u.created_at, u.updated_at, u.face_verification_photo,
                u.department_id, u.batch_id,
                u.face_descriptor IS NOT NULL as has_face_enrolled,
                d.name as department_name, d.code as department_code,
                b.name as batch_name, b.year as batch_year,
                (SELECT COUNT(*) FROM class_enrollments ce WHERE ce.student_id = u.id) as class_count
            FROM users u
            LEFT JOIN departments d ON u.department_id = d.id
            LEFT JOIN batches b ON u.batch_id = b.id
        `;
        
        const params = [];
        if (status) {
            params.push(status);
            query += ` WHERE u.enrollment_status = $1`;
        }
        
        query += ` ORDER BY u.created_at DESC`;
        
        const result = await pool.query(query, params);
        res.json({ success: true, students: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Get single student details
router.get('/students/:studentId', async (req, res) => {
    try {
        const { studentId } = req.params;
        
        const result = await pool.query(`
            SELECT 
                u.id, u.full_name as name, u.email, u.student_id, u.enrollment_status,
                u.department_id, u.batch_id, u.created_at, u.updated_at,
                u.face_verification_photo, u.face_descriptor IS NOT NULL as has_face_enrolled,
                d.name as department_name, d.code as department_code,
                b.name as batch_name, b.year as batch_year
            FROM users u
            LEFT JOIN departments d ON u.department_id = d.id
            LEFT JOIN batches b ON u.batch_id = b.id
            WHERE u.id = $1
        `, [studentId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }
        
        res.json({ success: true, student: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Update student information
router.put('/students/:studentId', async (req, res) => {
    try {
        const { studentId } = req.params;
        const { name, email, student_id, department_id, batch_id, enrollment_status } = req.body;
        
        // Build dynamic update query
        const updates = [];
        const values = [];
        let paramIndex = 1;
        
        if (name !== undefined) {
            updates.push(`full_name = $${paramIndex++}`);
            values.push(name);
        }
        if (email !== undefined) {
            updates.push(`email = $${paramIndex++}`);
            values.push(email);
        }
        if (student_id !== undefined) {
            updates.push(`student_id = $${paramIndex++}`);
            values.push(student_id);
        }
        if (department_id !== undefined) {
            updates.push(`department_id = $${paramIndex++}`);
            values.push(department_id);
        }
        if (batch_id !== undefined) {
            updates.push(`batch_id = $${paramIndex++}`);
            values.push(batch_id);
        }
        if (enrollment_status !== undefined) {
            updates.push(`enrollment_status = $${paramIndex++}`);
            values.push(enrollment_status);
        }
        
        if (updates.length === 0) {
            return res.status(400).json({ success: false, message: 'No fields to update' });
        }
        
        updates.push(`updated_at = NOW()`);
        values.push(studentId);
        
        const query = `
            UPDATE users 
            SET ${updates.join(', ')}
            WHERE id = $${paramIndex}
            RETURNING id, full_name as name, email, student_id, department_id, batch_id, enrollment_status
        `;
        
        const result = await pool.query(query, values);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }
        
        res.json({ success: true, student: result.rows[0], message: 'Student updated successfully' });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(400).json({ success: false, message: 'Email or Student ID already exists' });
        }
        res.status(500).json({ success: false, error: err.message });
    }
});

// Delete student (archives all data to audit tables first)
router.delete('/students/:studentId', async (req, res) => {
    const client = await pool.connect();
    try {
        const { studentId } = req.params;
        const reason = req.body?.reason || 'Admin deleted student';

        // Student info for audit trail
        const studentInfo = await pool.query(
            'SELECT id, full_name, email, student_id FROM users WHERE id = $1',
            [studentId]
        );
        if (studentInfo.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }
        const student = studentInfo.rows[0];

        // Admin identity from token (token only carries userId/role/email)
        const adminInfo = await pool.query('SELECT name FROM admins WHERE id = $1', [req.user.userId]);
        const adminName = adminInfo.rows[0]?.name || req.user.email || 'Admin';

        await client.query('BEGIN');

        // ── ARCHIVE (before deleting) ─────────────────────────────────────────

        // 1. Attempts (preserve blockchain verification data)
        const attempts = await client.query(`
            SELECT a.*, u.full_name as student_name, u.student_id as student_identifier, e.title as exam_title
            FROM attempts a
            JOIN users u ON a.student_id = u.id
            LEFT JOIN exams e ON a.exam_id = e.id
            WHERE a.student_id = $1
        `, [studentId]);

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
                req.user.userId, adminName, reason]);
        }

        // 2. Proctor logs
        const proctorLogs = await client.query(`
            SELECT pl.*, u.full_name as student_name, e.title as exam_title
            FROM proctor_logs pl
            LEFT JOIN users u ON pl.student_id = u.id
            LEFT JOIN exams e ON pl.exam_id = e.id
            WHERE pl.student_id = $1
        `, [studentId]);

        for (const log of proctorLogs.rows) {
            await client.query(`
                INSERT INTO audit_proctor_logs (original_id, attempt_id, exam_title, student_id, student_name,
                                                event_type, event_data, confidence_score, face_count,
                                                screenshot_url, timestamp, deleted_by, deleted_by_name, deletion_reason)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            `, [log.id, log.attempt_id, log.exam_title, log.student_id, log.student_name, log.violation_type,
                JSON.stringify(log.metadata || {}), log.confidence_score, log.face_count, log.screenshot_url,
                log.created_at, req.user.userId, adminName, reason]);
        }

        // 3. Exam sessions
        const sessions = await client.query(`
            SELECT es.*, u.full_name as student_name, e.title as exam_title
            FROM exam_sessions es
            LEFT JOIN users u ON es.student_id = u.id
            LEFT JOIN exams e ON es.exam_id = e.id
            WHERE es.student_id = $1
        `, [studentId]);

        for (const sess of sessions.rows) {
            await client.query(`
                INSERT INTO audit_exam_sessions (original_id, exam_id, exam_title, student_id, student_name,
                                                 status, started_at, submitted_at, ended_at, created_at,
                                                 deleted_by, deleted_by_name, deletion_reason)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            `, [sess.id, sess.exam_id, sess.exam_title, sess.student_id, sess.student_name, sess.status,
                sess.started_at, sess.submitted_at, sess.ended_at, sess.created_at,
                req.user.userId, adminName, reason]);
        }

        // 4. Heartbeat logs
        const heartbeats = await client.query(`
            SELECT hl.*, u.full_name as student_name, e.title as exam_title
            FROM heartbeat_logs hl
            LEFT JOIN users u ON hl.student_id = u.id
            LEFT JOIN exams e ON hl.exam_id = e.id
            WHERE hl.student_id = $1
        `, [studentId]);

        for (const beat of heartbeats.rows) {
            await client.query(`
                INSERT INTO audit_heartbeat_logs (original_id, session_id, exam_title, student_name,
                                                  event_type, event_data, timestamp, deletion_reason)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `, [beat.id, beat.session_id, beat.exam_title, beat.student_name, beat.status,
                JSON.stringify({ ip_address: beat.ip_address, user_agent: beat.user_agent }),
                beat.timestamp, reason]);
        }

        // 5. Class enrollments
        const enrollments = await client.query(`
            SELECT ce.*, u.full_name as student_name, u.student_id as student_identifier, c.name as class_name
            FROM class_enrollments ce
            LEFT JOIN users u ON ce.student_id = u.id
            LEFT JOIN classes c ON ce.class_id = c.id
            WHERE ce.student_id = $1
        `, [studentId]);

        for (const enr of enrollments.rows) {
            await client.query(`
                INSERT INTO audit_class_enrollments (original_id, class_id, class_name, student_id, student_name,
                                                     student_identifier, status, enrolled_at, deleted_by,
                                                     deleted_by_name, deletion_reason)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            `, [enr.id, enr.class_id, enr.class_name, enr.student_id, enr.student_name,
                enr.student_identifier, enr.status, enr.enrolled_at, req.user.userId, adminName, reason]);
        }

        // Counts for deletion log metadata
        const accessRequests = await client.query(
            'SELECT COUNT(*) FROM exam_access_requests WHERE student_id = $1', [studentId]);
        const aiEvents = await client.query(
            'SELECT COUNT(*) FROM ai_events WHERE attempt_id IN (SELECT id FROM attempts WHERE student_id = $1)',
            [studentId]);

        // ── DELETE (in dependency order) ──────────────────────────────────────
        await client.query('DELETE FROM heartbeat_logs WHERE student_id = $1', [studentId]);
        await client.query('DELETE FROM exam_access_requests WHERE student_id = $1 OR reviewed_by = $1', [studentId]);
        await client.query(
            'DELETE FROM ai_events WHERE attempt_id IN (SELECT id FROM attempts WHERE student_id = $1)',
            [studentId]
        );
        await client.query('DELETE FROM proctor_logs WHERE student_id = $1', [studentId]);
        await client.query('DELETE FROM exam_sessions WHERE student_id = $1', [studentId]);
        await client.query('DELETE FROM attempts WHERE student_id = $1', [studentId]);
        await client.query('DELETE FROM class_enrollments WHERE student_id = $1', [studentId]);

        const result = await client.query(
            'DELETE FROM users WHERE id = $1 RETURNING id, full_name as name',
            [studentId]
        );

        // ── AUDIT DELETION LOG ────────────────────────────────────────────────
        await client.query(`
            INSERT INTO audit_deletion_log (table_name, record_id, deleted_by_id, deleted_by_role,
                                            deleted_by_name, deletion_reason, metadata)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, ['users', studentId, req.user.userId, 'admin', adminName, reason, JSON.stringify({
                student_name: student.full_name,
                student_email: student.email,
                student_roll_no: student.student_id,
                attempt_count: attempts.rows.length,
                proctor_log_count: proctorLogs.rows.length,
                session_count: sessions.rows.length,
                heartbeat_count: heartbeats.rows.length,
                enrollment_count: enrollments.rows.length,
                access_request_count: parseInt(accessRequests.rows[0].count),
                ai_event_count: parseInt(aiEvents.rows[0].count)
            })]);

        await client.query('COMMIT');

        res.json({ success: true, message: `Student "${result.rows[0].name}" deleted and archived for audit.` });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Delete student error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
});

// Reset student face enrollment (allow re-upload)
router.post('/students/:studentId/reset-face', async (req, res) => {
    try {
        const { studentId } = req.params;
        
        const result = await pool.query(
            `UPDATE users 
             SET face_descriptor = NULL, 
                 face_verification_photo = NULL,
                 enrollment_status = 'pending_face',
                 updated_at = NOW()
             WHERE id = $1
             RETURNING id, full_name as name`,
            [studentId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }
        
        res.json({ success: true, message: 'Face enrollment reset. Student can upload a new photo.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PENDING ENROLLMENTS (Students waiting for admin approval)
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/enrollments/pending', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                u.id, u.full_name as name, u.email, u.student_id, u.enrollment_status,
                u.created_at, u.face_verification_photo,
                d.name as department_name, d.code as department_code,
                b.name as batch_name, b.year as batch_year
            FROM users u
            LEFT JOIN departments d ON u.department_id = d.id
            LEFT JOIN batches b ON u.batch_id = b.id
            WHERE u.enrollment_status = 'pending_admin'
            ORDER BY u.created_at DESC
        `);
        
        res.json({ success: true, enrollments: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Legacy endpoint for backward compatibility
router.get('/pending-enrollments', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                u.id, u.full_name as name, u.email, u.student_id, u.enrollment_status,
                u.created_at, u.face_verification_photo,
                d.name as department_name, d.code as department_code,
                b.name as batch_name, b.year as batch_year
            FROM users u
            LEFT JOIN departments d ON u.department_id = d.id
            LEFT JOIN batches b ON u.batch_id = b.id
            WHERE u.enrollment_status IN ('pending_admin', 'PENDING')
            ORDER BY u.created_at DESC
        `);
        
        res.json({ success: true, enrollments: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Get all enrollments with filters
router.get('/enrollments', async (req, res) => {
    try {
        const { status, department_id, batch_id } = req.query;
        
        let query = `
            SELECT 
                u.id, u.full_name as name, u.email, u.student_id, u.enrollment_status,
                u.created_at, u.face_verification_photo, u.face_descriptor IS NOT NULL as has_face,
                d.name as department_name, d.code as department_code,
                b.name as batch_name, b.year as batch_year
            FROM users u
            LEFT JOIN departments d ON u.department_id = d.id
            LEFT JOIN batches b ON u.batch_id = b.id
            WHERE 1=1
        `;
        const params = [];
        
        if (status) {
            params.push(status);
            query += ` AND u.enrollment_status = $${params.length}`;
        }
        if (department_id) {
            params.push(department_id);
            query += ` AND u.department_id = $${params.length}`;
        }
        if (batch_id) {
            params.push(batch_id);
            query += ` AND u.batch_id = $${params.length}`;
        }
        
        query += ' ORDER BY u.created_at DESC';
        
        const result = await pool.query(query, params);
        res.json({ success: true, enrollments: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// APPROVE / REJECT ENROLLMENT (Step 1: Admin approves registration)
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/enrollments/:userId/approve', async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Move to next status: pending_face (needs to enroll face)
        const result = await pool.query(
            `UPDATE users 
             SET enrollment_status = 'pending_face', updated_at = NOW() 
             WHERE id = $1 AND enrollment_status IN ('pending_admin', 'PENDING')
             RETURNING id, full_name as name, email, enrollment_status`,
            [userId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Student not found or already processed' });
        }
        
        res.json({ success: true, student: result.rows[0], message: 'Student approved. Waiting for face enrollment.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FACE PHOTO VERIFICATION (Step 2: Admin verifies face photo matches documents)
// ═══════════════════════════════════════════════════════════════════════════════

// Get students with face photos pending verification
router.get('/face-verifications/pending', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                u.id, u.full_name as name, u.email, u.student_id, u.enrollment_status,
                u.created_at, u.updated_at, u.face_verification_photo,
                u.face_descriptor IS NOT NULL as has_face_data,
                d.name as department_name, d.code as department_code,
                b.name as batch_name, b.year as batch_year
            FROM users u
            LEFT JOIN departments d ON u.department_id = d.id
            LEFT JOIN batches b ON u.batch_id = b.id
            WHERE u.enrollment_status = 'pending_face'
            AND u.face_verification_photo IS NOT NULL
            AND u.face_descriptor IS NOT NULL
            ORDER BY u.updated_at DESC
        `);
        
        res.json({ success: true, verifications: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Approve face photo - move to pending_instructor
router.post('/face-verifications/:userId/approve', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const result = await pool.query(
            `UPDATE users 
             SET enrollment_status = 'pending_instructor', updated_at = NOW() 
             WHERE id = $1 
             AND enrollment_status = 'pending_face'
             AND face_verification_photo IS NOT NULL
             AND face_descriptor IS NOT NULL
             RETURNING id, full_name as name, email, enrollment_status, face_descriptor`,
            [userId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Student not found, face photo missing, or already processed' 
            });
        }
        
        const student = result.rows[0];
        
        // Generate and store face verification hash for integrity
        try {
            const faceHash = sha256(JSON.stringify({
                userId: student.id,
                name: student.name,
                email: student.email,
                faceDescriptor: student.face_descriptor,
                verifiedAt: new Date().toISOString()
            }));
            
            await pool.query(
                `UPDATE users SET face_verification_hash = $1 WHERE id = $2`,
                [faceHash, userId]
            );
            console.log(`✅ Face verification hash stored for user ${userId}: ${faceHash.substring(0, 16)}...`);
        } catch (hashErr) {
            console.error(`Hash generation failed for user ${userId} (non-blocking):`, hashErr.message);
        }
        
        // Don't return face_descriptor in response
        delete student.face_descriptor;
        
        res.json({ 
            success: true, 
            student, 
            message: 'Face photo verified! Student can now be assigned to a class.' 
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Reject face photo - ask student to retake
router.post('/face-verifications/:userId/reject', async (req, res) => {
    try {
        const { userId } = req.params;
        const { reason } = req.body;
        
        // Clear face data so student can retake photo
        const result = await pool.query(
            `UPDATE users 
             SET face_verification_photo = NULL, 
                 face_descriptor = NULL,
                 updated_at = NOW() 
             WHERE id = $1 AND enrollment_status = 'pending_face'
             RETURNING id, full_name as name, email`,
            [userId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }
        
        res.json({ 
            success: true, 
            message: 'Face photo rejected. Student must retake photo.',
            reason: reason || 'Photo did not meet verification requirements'
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Legacy approve endpoint
router.post('/approve/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const result = await pool.query(
            `UPDATE users SET enrollment_status = 'pending_face', updated_at = NOW() 
             WHERE id = $1 RETURNING id, full_name as name, email`,
            [userId]
        );
        if (result.rowCount === 0) return res.status(404).json({ success: false });
        res.json({ success: true, message: "User Approved", user: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/enrollments/:userId/reject', async (req, res) => {
    try {
        const { userId } = req.params;
        const { reason } = req.body;
        
        const result = await pool.query(
            `UPDATE users 
             SET enrollment_status = 'rejected', updated_at = NOW() 
             WHERE id = $1
             RETURNING id, full_name as name, email`,
            [userId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }
        
        res.json({ success: true, message: 'Enrollment rejected' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Legacy reject endpoint
router.post('/reject/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const result = await pool.query(
            `UPDATE users SET enrollment_status = 'rejected', face_descriptor = NULL 
             WHERE id = $1 RETURNING id, full_name as name`,
            [userId]
        );
        if (result.rowCount === 0) return res.status(404).json({ success: false });
        res.json({ success: true, message: "User Rejected" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// MANAGE DEPARTMENTS
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/departments', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT d.*, 
                   (SELECT COUNT(*) FROM users WHERE department_id = d.id) as student_count,
                   (SELECT COUNT(*) FROM instructors WHERE department_id = d.id) as instructor_count
            FROM departments d
            ORDER BY d.name
        `);
        res.json({ success: true, departments: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/departments', async (req, res) => {
    try {
        const { name, code } = req.body;
        
        const result = await pool.query(
            'INSERT INTO departments (name, code) VALUES ($1, $2) RETURNING *',
            [name, code.toUpperCase()]
        );
        
        res.json({ success: true, department: result.rows[0] });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(400).json({ success: false, message: 'Department code already exists' });
        }
        res.status(500).json({ success: false, error: err.message });
    }
});

// Update department
router.put('/departments/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, code } = req.body;
        
        const result = await pool.query(
            `UPDATE departments SET name = COALESCE($1, name), code = COALESCE($2, code)
             WHERE id = $3 RETURNING *`,
            [name, code?.toUpperCase(), id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Department not found' });
        }
        
        res.json({ success: true, department: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Delete department
router.delete('/departments/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Check if department has users or instructors
        const usersCheck = await pool.query('SELECT COUNT(*) FROM users WHERE department_id = $1', [id]);
        const instructorsCheck = await pool.query('SELECT COUNT(*) FROM instructors WHERE department_id = $1', [id]);
        
        if (parseInt(usersCheck.rows[0].count) > 0 || parseInt(instructorsCheck.rows[0].count) > 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Cannot delete department with assigned students or instructors' 
            });
        }
        
        const result = await pool.query('DELETE FROM departments WHERE id = $1 RETURNING *', [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Department not found' });
        }
        
        res.json({ success: true, message: `Department "${result.rows[0].name}" deleted` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// MANAGE BATCHES
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/batches', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT b.*, 
                   (SELECT COUNT(*) FROM users WHERE batch_id = b.id) as student_count
            FROM batches b
            ORDER BY b.year DESC, b.semester
        `);
        res.json({ success: true, batches: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/batches', async (req, res) => {
    try {
        const { name, year, semester } = req.body;
        
        const result = await pool.query(
            'INSERT INTO batches (name, year, semester) VALUES ($1, $2, $3) RETURNING *',
            [name, year, semester]
        );
        
        res.json({ success: true, batch: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Update batch
router.put('/batches/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, year, semester, is_active } = req.body;
        
        const result = await pool.query(
            `UPDATE batches SET 
                name = COALESCE($1, name), 
                year = COALESCE($2, year), 
                semester = COALESCE($3, semester),
                is_active = COALESCE($4, is_active)
             WHERE id = $5 RETURNING *`,
            [name, year, semester, is_active, id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Batch not found' });
        }
        
        res.json({ success: true, batch: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Delete batch
router.delete('/batches/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Check if batch has users
        const usersCheck = await pool.query('SELECT COUNT(*) FROM users WHERE batch_id = $1', [id]);
        
        if (parseInt(usersCheck.rows[0].count) > 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Cannot delete batch with assigned students' 
            });
        }
        
        const result = await pool.query('DELETE FROM batches WHERE id = $1 RETURNING *', [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Batch not found' });
        }
        
        res.json({ success: true, message: `Batch "${result.rows[0].name}" deleted` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// MANAGE INSTRUCTORS
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/instructors', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT i.id, i.name, i.email, i.employee_id, i.is_active, i.created_at,
                   d.name as department_name, d.code as department_code,
                   (SELECT COUNT(*) FROM classes WHERE instructor_id = i.id) as class_count
            FROM instructors i
            LEFT JOIN departments d ON i.department_id = d.id
            ORDER BY i.name
        `);
        res.json({ success: true, instructors: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/instructors', async (req, res) => {
    try {
        const { name, email, password, department_id, employee_id } = req.body;
        
        if (!password) {
            return res.status(400).json({ success: false, message: 'Password is required' });
        }
        const hashed = await bcrypt.hash(password, 12);
        
        const result = await pool.query(
            `INSERT INTO instructors (name, email, password_hash, department_id, employee_id) 
             VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, employee_id`,
            [name, email, hashed, department_id, employee_id]
        );
        
        res.json({ success: true, instructor: result.rows[0] });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(400).json({ success: false, message: 'Email already exists' });
        }
        res.status(500).json({ success: false, error: err.message });
    }
});

router.put('/instructors/:id/toggle-active', async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query(
            'UPDATE instructors SET is_active = NOT is_active WHERE id = $1 RETURNING id, name, is_active',
            [id]
        );
        
        res.json({ success: true, instructor: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Update instructor
router.put('/instructors/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, password, department_id, employee_id, is_active } = req.body;
        
        const updates = [];
        const values = [];
        let paramIndex = 1;
        
        if (name !== undefined) { updates.push(`name = $${paramIndex++}`); values.push(name); }
        if (email !== undefined) { updates.push(`email = $${paramIndex++}`); values.push(email); }
        if (password !== undefined) {
            const hashed = await bcrypt.hash(password, 12);
            updates.push(`password_hash = $${paramIndex++}`);
            values.push(hashed);
        }
        if (department_id !== undefined) { updates.push(`department_id = $${paramIndex++}`); values.push(department_id); }
        if (employee_id !== undefined) { updates.push(`employee_id = $${paramIndex++}`); values.push(employee_id); }
        if (is_active !== undefined) { updates.push(`is_active = $${paramIndex++}`); values.push(is_active); }
        
        if (updates.length === 0) {
            return res.status(400).json({ success: false, message: 'No fields to update' });
        }
        
        values.push(id);
        const result = await pool.query(
            `UPDATE instructors SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING id, name, email, department_id, employee_id, is_active`,
            values
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Instructor not found' });
        }
        
        res.json({ success: true, instructor: result.rows[0] });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(400).json({ success: false, message: 'Email already exists' });
        }
        res.status(500).json({ success: false, error: err.message });
    }
});

// Delete instructor
router.delete('/instructors/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Check if instructor has classes
        const classCheck = await pool.query('SELECT COUNT(*) FROM classes WHERE instructor_id = $1', [id]);
        
        if (parseInt(classCheck.rows[0].count) > 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Cannot delete instructor with assigned classes. Reassign or delete classes first.' 
            });
        }
        
        const result = await pool.query('DELETE FROM instructors WHERE id = $1 RETURNING id, name', [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Instructor not found' });
        }
        
        res.json({ success: true, message: `Instructor "${result.rows[0].name}" deleted` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// VIEW ALL EXAMS
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/exams', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT e.*, 
                   i.name as instructor_name,
                   c.name as class_name, c.code as class_code,
                   (SELECT COUNT(*) FROM attempts WHERE exam_id = e.id) as attempt_count
            FROM exams e
            LEFT JOIN instructors i ON e.instructor_id = i.id
            LEFT JOIN classes c ON e.class_id = c.id
            ORDER BY e.created_at DESC
        `);
        res.json({ success: true, exams: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Update exam (admin can edit any exam)
router.put('/exams/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { title, duration_minutes, is_published, start_time, end_time } = req.body;
        
        const updates = [];
        const values = [];
        let paramIndex = 1;
        
        if (title !== undefined) { updates.push(`title = $${paramIndex++}`); values.push(title); }
        if (duration_minutes !== undefined) { updates.push(`duration_minutes = $${paramIndex++}`); values.push(duration_minutes); }
        if (is_published !== undefined) { updates.push(`is_published = $${paramIndex++}`); values.push(is_published); }
        if (start_time !== undefined) { updates.push(`start_time = $${paramIndex++}`); values.push(start_time); }
        if (end_time !== undefined) { updates.push(`end_time = $${paramIndex++}`); values.push(end_time); }
        
        if (updates.length === 0) {
            return res.status(400).json({ success: false, message: 'No fields to update' });
        }
        
        values.push(id);
        const result = await pool.query(
            `UPDATE exams SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
            values
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Exam not found' });
        }
        
        res.json({ success: true, exam: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Delete exam (admin can delete any exam)
router.delete('/exams/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Delete related data first
        await pool.query('DELETE FROM proctor_logs WHERE exam_id = $1', [id]);
        await pool.query('DELETE FROM attempts WHERE exam_id = $1', [id]);
        
        const result = await pool.query('DELETE FROM exams WHERE id = $1 RETURNING id, title', [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Exam not found' });
        }
        
        res.json({ success: true, message: `Exam "${result.rows[0].title}" deleted` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// MANAGE CLASSES
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/classes', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT c.*, 
                   i.name as instructor_name,
                   d.name as department_name,
                   b.name as batch_name,
                   (SELECT COUNT(*) FROM class_enrollments WHERE class_id = c.id AND status = 'active') as student_count,
                   (SELECT COUNT(*) FROM exams WHERE class_id = c.id) as exam_count
            FROM classes c
            LEFT JOIN instructors i ON c.instructor_id = i.id
            LEFT JOIN departments d ON c.department_id = d.id
            LEFT JOIN batches b ON c.batch_id = b.id
            ORDER BY c.created_at DESC
        `);
        res.json({ success: true, classes: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Update class
router.put('/classes/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, code, description, instructor_id, is_active } = req.body;
        
        const updates = [];
        const values = [];
        let paramIndex = 1;
        
        if (name !== undefined) { updates.push(`name = $${paramIndex++}`); values.push(name); }
        if (code !== undefined) { updates.push(`code = $${paramIndex++}`); values.push(code); }
        if (description !== undefined) { updates.push(`description = $${paramIndex++}`); values.push(description); }
        if (instructor_id !== undefined) { updates.push(`instructor_id = $${paramIndex++}`); values.push(instructor_id); }
        if (is_active !== undefined) { updates.push(`is_active = $${paramIndex++}`); values.push(is_active); }
        
        if (updates.length === 0) {
            return res.status(400).json({ success: false, message: 'No fields to update' });
        }
        
        values.push(id);
        const result = await pool.query(
            `UPDATE classes SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
            values
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Class not found' });
        }
        
        res.json({ success: true, class: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Delete class
router.delete('/classes/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Delete related data
        await pool.query('DELETE FROM class_enrollments WHERE class_id = $1', [id]);
        
        // Delete exams and their data
        const exams = await pool.query('SELECT id FROM exams WHERE class_id = $1', [id]);
        for (const exam of exams.rows) {
            await pool.query('DELETE FROM proctor_logs WHERE exam_id = $1', [exam.id]);
            await pool.query('DELETE FROM attempts WHERE exam_id = $1', [exam.id]);
        }
        await pool.query('DELETE FROM exams WHERE class_id = $1', [id]);
        
        const result = await pool.query('DELETE FROM classes WHERE id = $1 RETURNING id, name', [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Class not found' });
        }
        
        res.json({ success: true, message: `Class "${result.rows[0].name}" deleted` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// VIEW ALL ATTEMPTS & PROCTOR LOGS
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/attempts', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT a.*, 
                   u.full_name as student_name, u.email as student_email,
                   e.title as exam_title,
                   (SELECT COUNT(*) FROM proctor_logs WHERE attempt_id = a.id) as violation_count
            FROM attempts a
            JOIN users u ON a.student_id = u.id
            JOIN exams e ON a.exam_id = e.id
            ORDER BY a.submitted_at DESC
            LIMIT 100
        `);
        res.json({ success: true, attempts: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Get single attempt with details
router.get('/attempts/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const attempt = await pool.query(`
            SELECT a.*, 
                   u.full_name as student_name, u.email as student_email, u.student_id,
                   e.title as exam_title, e.questions_json,
                   c.name as class_name
            FROM attempts a
            JOIN users u ON a.student_id = u.id
            JOIN exams e ON a.exam_id = e.id
            LEFT JOIN classes c ON e.class_id = c.id
            WHERE a.id = $1
        `, [id]);
        
        if (attempt.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Attempt not found' });
        }
        
        const logs = await pool.query(
            'SELECT * FROM proctor_logs WHERE attempt_id = $1 ORDER BY created_at',
            [id]
        );
        
        res.json({ 
            success: true, 
            attempt: attempt.rows[0],
            proctorLogs: logs.rows
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Delete attempt
router.delete('/attempts/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        await pool.query('DELETE FROM proctor_logs WHERE attempt_id = $1', [id]);
        const result = await pool.query('DELETE FROM attempts WHERE id = $1 RETURNING id', [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Attempt not found' });
        }
        
        res.json({ success: true, message: 'Attempt deleted' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/proctor-logs', async (req, res) => {
    try {
        const { student_id, exam_id, limit = 100 } = req.query;
        
        let query = `
            SELECT p.*, 
                   u.full_name as student_name,
                   e.title as exam_title
            FROM proctor_logs p
            LEFT JOIN users u ON p.student_id = u.id
            LEFT JOIN exams e ON p.exam_id = e.id
            WHERE 1=1
        `;
        const params = [];
        
        if (student_id) {
            params.push(student_id);
            query += ` AND p.student_id = $${params.length}`;
        }
        if (exam_id) {
            params.push(exam_id);
            query += ` AND p.exam_id = $${params.length}`;
        }
        
        params.push(limit);
        query += ` ORDER BY p.created_at DESC LIMIT $${params.length}`;
        
        const result = await pool.query(query, params);
        res.json({ success: true, logs: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SUBMITTED EXAMS (for AdminDashboard compatibility)
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/submitted-exams', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                es.id as session_id,
                es.exam_id,
                es.student_id,
                es.status,
                es.started_at,
                es.finished_at,
                es.is_locked,
                es.lock_reason,
                es.warning_count,
                es.violation_count,
                es.time_remaining,
                es.result,
                a.id as attempt_id,
                a.score,
                a.correct_count,
                a.total_questions,
                a.submitted_at,
                u.full_name,
                u.email,
                u.student_id as student_id_number,
                e.title as exam_title,
                e.duration_minutes,
                c.name as class_name,
                i.name as instructor_name,
                (SELECT COUNT(*) FROM proctor_logs pl WHERE pl.session_id = es.id) as violation_log_count
            FROM exam_sessions es
            JOIN users u ON es.student_id = u.id
            JOIN exams e ON es.exam_id = e.id
            LEFT JOIN attempts a ON a.exam_id = es.exam_id AND a.student_id = es.student_id
            LEFT JOIN classes c ON e.class_id = c.id
            LEFT JOIN instructors i ON e.instructor_id = i.id
            ORDER BY es.started_at DESC
        `);
        
        res.json({ success: true, sessions: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// STUDENT LOGS VIEW (with search)
// ═══════════════════════════════════════════════════════════════════════════════

// Get all students with their exam history summary
router.get('/student-logs', async (req, res) => {
    try {
        const { search } = req.query;
        
        let query = `
            SELECT 
                u.id,
                u.full_name,
                u.email,
                u.student_id,
                u.enrollment_status,
                u.created_at as joined_at,
                d.name as department_name,
                b.name as batch_name,
                COUNT(DISTINCT es.id) as total_attempts,
                COUNT(DISTINCT CASE WHEN es.status = 'COMPLETED' THEN es.id END) as completed_exams,
                COUNT(DISTINCT CASE WHEN es.is_locked THEN es.id END) as locked_exams,
                COUNT(DISTINCT CASE WHEN es.status = 'TERMINATED' THEN es.id END) as terminated_exams,
                COALESCE(ROUND(AVG(a.score)::numeric, 1), 0) as avg_score,
                COUNT(DISTINCT a.id) as total_scored_attempts,
                (SELECT COUNT(*) FROM proctor_logs pl WHERE pl.student_id = u.id) as total_violations,
                (SELECT COUNT(*) FROM proctor_logs pl WHERE pl.student_id = u.id AND pl.severity = 'critical') as critical_violations
            FROM users u
            LEFT JOIN departments d ON u.department_id = d.id
            LEFT JOIN batches b ON u.batch_id = b.id
            LEFT JOIN exam_sessions es ON es.student_id = u.id
            LEFT JOIN attempts a ON a.student_id = u.id AND a.score IS NOT NULL
            WHERE u.role = 'student'
        `;
        
        const params = [];
        if (search) {
            params.push(`%${search}%`);
            query += ` AND (u.full_name ILIKE $1 OR u.email ILIKE $1 OR u.student_id ILIKE $1)`;
        }
        
        query += ` GROUP BY u.id, d.name, b.name ORDER BY u.full_name`;
        
        const result = await pool.query(query, params);
        res.json({ success: true, students: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Get detailed logs for a specific student
router.get('/student-logs/:studentId', async (req, res) => {
    try {
        const { studentId } = req.params;
        
        // Get student info
        const studentResult = await pool.query(`
            SELECT u.id, u.full_name, u.email, u.student_id, u.role, u.enrollment_status,
                   u.face_descriptor, u.face_verification_photo, u.face_verification_hash,
                   u.approved_at, u.approved_by, u.created_at, u.updated_at, u.profile_photo_url,
                   u.department_id, u.batch_id,
                   d.name as department_name, b.name as batch_name
            FROM users u
            LEFT JOIN departments d ON u.department_id = d.id
            LEFT JOIN batches b ON u.batch_id = b.id
            WHERE u.id = $1
        `, [studentId]);
        
        if (studentResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }
        
        // Get all exam attempts with details
        const attemptsResult = await pool.query(`
            SELECT 
                es.id as session_id,
                es.status,
                es.started_at,
                es.finished_at,
                es.is_locked,
                es.lock_reason,
                es.warning_count,
                es.violation_count,
                es.time_remaining,
                a.id as attempt_id,
                a.score,
                a.correct_count,
                a.total_questions,
                a.answers_json,
                e.id as exam_id,
                e.title as exam_title,
                e.duration_minutes,
                c.name as class_name,
                i.name as instructor_name
            FROM exam_sessions es
            JOIN exams e ON es.exam_id = e.id
            LEFT JOIN attempts a ON a.exam_id = es.exam_id AND a.student_id = es.student_id
            LEFT JOIN classes c ON e.class_id = c.id
            LEFT JOIN instructors i ON e.instructor_id = i.id
            WHERE es.student_id = $1
            ORDER BY es.started_at DESC
        `, [studentId]);
        
        // Get all proctor logs for this student
        const logsResult = await pool.query(`
            SELECT 
                pl.*,
                e.title as exam_title
            FROM proctor_logs pl
            LEFT JOIN exams e ON pl.exam_id = e.id
            WHERE pl.student_id = $1
            ORDER BY pl.created_at DESC
        `, [studentId]);
        
        // Group logs by exam
        const logsByExam = {};
        logsResult.rows.forEach(log => {
            if (!logsByExam[log.exam_id]) {
                logsByExam[log.exam_id] = [];
            }
            logsByExam[log.exam_id].push(log);
        });
        
        // Calculate real average from scored attempts only
        const scoredAttempts = attemptsResult.rows.filter(a => a.score !== null && a.score !== undefined);
        const avgScore = scoredAttempts.length > 0 
            ? Math.round(scoredAttempts.reduce((sum, a) => sum + parseFloat(a.score || 0), 0) / scoredAttempts.length * 10) / 10
            : 0;
        
        res.json({
            success: true,
            student: studentResult.rows[0],
            attempts: attemptsResult.rows,
            allLogs: logsResult.rows,
            logsByExam,
            summary: {
                totalAttempts: attemptsResult.rows.length,
                completedExams: attemptsResult.rows.filter(a => a.status === 'COMPLETED').length,
                lockedExams: attemptsResult.rows.filter(a => a.is_locked).length,
                terminatedExams: attemptsResult.rows.filter(a => a.status === 'TERMINATED').length,
                avgScore: avgScore,
                scoredAttempts: scoredAttempts.length,
                totalViolations: logsResult.rows.length,
                criticalViolations: logsResult.rows.filter(l => l.severity === 'critical').length
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Admin approve retry (unlock and allow new attempt while preserving old)
router.post('/student-logs/:studentId/exam/:examId/allow-retry', async (req, res) => {
    const client = await pool.connect();
    try {
        const { studentId, examId } = req.params;
        const { adminNotes } = req.body || {};

        // Get exam duration
        const examResult = await client.query('SELECT duration_minutes FROM exams WHERE id = $1', [examId]);
        if (examResult.rows.length === 0) {
            client.release();
            return res.status(404).json({ success: false, message: 'Exam not found' });
        }
        const duration = examResult.rows[0]?.duration_minutes || 60;

        await client.query('BEGIN');

        // Check if session exists
        const sessionResult = await client.query(
            `SELECT * FROM exam_sessions WHERE student_id = $1 AND exam_id = $2 FOR UPDATE`,
            [studentId, examId]
        );

        let sessionId;

        if (sessionResult.rows.length === 0) {
            // No session exists - create a fresh one ready to start
            const newSession = await client.query(`
                INSERT INTO exam_sessions (exam_id, student_id, status, time_remaining)
                VALUES ($1, $2, 'NOT_STARTED', $3)
                RETURNING id
            `, [examId, studentId, duration * 60]);
            sessionId = newSession.rows[0].id;
        } else {
            // Session exists - archive any prior attempt, then reset for a
            // fresh retake. Archiving keeps score history and the old chain
            // hash auditable; deleting mints a NEW attempt id on resubmit so
            // blockchain verification stays VALID.
            sessionId = sessionResult.rows[0].id;

            await archiveAttemptsForRetake(client, {
                studentId: Number(studentId),
                examId: Number(examId),
                reason: `Allow-retry granted: ${adminNotes || 'no notes provided'}`,
            });

            await client.query(`
                UPDATE exam_sessions
                SET is_locked = false,
                    lock_reason = NULL,
                    locked_at = NULL,
                    status = 'NOT_STARTED',
                    started_at = NULL,
                    finished_at = NULL,
                    ended_at = NULL,
                    submitted_at = NULL,
                    warning_count = 0,
                    violation_count = 0,
                    time_remaining = $2,
                    result = NULL,
                    question_order = NULL,
                    last_heartbeat = NULL
                WHERE id = $1
            `, [sessionId, duration * 60]);
        }

        // Log the admin action (old attempts live on in audit_attempts)
        await client.query(`
            INSERT INTO proctor_logs (session_id, student_id, exam_id, violation_type, description, severity)
            VALUES ($1, $2, $3, 'ADMIN_RETRY_ALLOWED', $4, 'info')
        `, [sessionId, studentId, examId, adminNotes || 'Admin allowed retry attempt']);

        await client.query('COMMIT');

        res.json({
            success: true,
            message: 'Retry allowed. Student can now reattempt the exam.'
        });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Allow retry error:', err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// AUDIT TRAIL ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// Get audit deletion log (all deleted records)
router.get('/audit/deletions', async (req, res) => {
    try {
        const { limit = 100, offset = 0, table_name } = req.query;
        
        let query = `
            SELECT * FROM audit_deletion_log
            ${table_name ? 'WHERE table_name = $3' : ''}
            ORDER BY deleted_at DESC
            LIMIT $1 OFFSET $2
        `;
        
        const params = table_name ? [limit, offset, table_name] : [limit, offset];
        const result = await pool.query(query, params);
        
        const countResult = await pool.query(
            `SELECT COUNT(*) FROM audit_deletion_log ${table_name ? 'WHERE table_name = $1' : ''}`,
            table_name ? [table_name] : []
        );
        
        res.json({
            success: true,
            deletions: result.rows,
            total: parseInt(countResult.rows[0].count),
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Get archived exams
router.get('/audit/exams', async (req, res) => {
    try {
        const { limit = 50, offset = 0 } = req.query;
        
        const result = await pool.query(`
            SELECT ae.*, 
                   (SELECT COUNT(*) FROM audit_attempts aa WHERE aa.exam_id = ae.original_id) as archived_attempts
            FROM audit_exams ae
            ORDER BY ae.deleted_at DESC
            LIMIT $1 OFFSET $2
        `, [limit, offset]);
        
        const countResult = await pool.query('SELECT COUNT(*) FROM audit_exams');
        
        res.json({
            success: true,
            exams: result.rows,
            total: parseInt(countResult.rows[0].count)
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Get archived attempts for an exam
router.get('/audit/exams/:examId/attempts', async (req, res) => {
    try {
        const { examId } = req.params;
        
        const result = await pool.query(`
            SELECT aa.*,
                   (SELECT COUNT(*) FROM audit_proctor_logs apl WHERE apl.attempt_id = aa.original_id) as archived_logs
            FROM audit_attempts aa
            WHERE aa.exam_id = $1
            ORDER BY aa.submitted_at DESC
        `, [examId]);
        
        res.json({
            success: true,
            attempts: result.rows
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Get archived proctor logs for an attempt
router.get('/audit/attempts/:attemptId/logs', async (req, res) => {
    try {
        const { attemptId } = req.params;
        
        const result = await pool.query(`
            SELECT * FROM audit_proctor_logs
            WHERE attempt_id = $1
            ORDER BY timestamp
        `, [attemptId]);
        
        res.json({
            success: true,
            logs: result.rows
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Get archived exam sessions for an exam
router.get('/audit/exams/:examId/sessions', async (req, res) => {
    try {
        const { examId } = req.params;
        
        const result = await pool.query(`
            SELECT * FROM audit_exam_sessions
            WHERE exam_id = $1
            ORDER BY started_at DESC
        `, [examId]);
        
        res.json({
            success: true,
            sessions: result.rows
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Get archived heartbeat logs for an exam
router.get('/audit/exams/:examId/heartbeats', async (req, res) => {
    try {
        const { examId } = req.params;
        
        const result = await pool.query(`
            SELECT ah.*
            FROM audit_heartbeat_logs ah
            WHERE ah.session_id IN (
                SELECT original_id FROM audit_exam_sessions WHERE exam_id = $1
            )
            ORDER BY ah.timestamp DESC
            LIMIT 500
        `, [examId]);
        
        res.json({
            success: true,
            heartbeats: result.rows
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Get archived class enrollments for a class
router.get('/audit/classes/:classId/enrollments', async (req, res) => {
    try {
        const { classId } = req.params;
        
        const result = await pool.query(`
            SELECT * FROM audit_class_enrollments
            WHERE class_id = $1
            ORDER BY enrolled_at DESC
        `, [classId]);
        
        res.json({
            success: true,
            enrollments: result.rows
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Get archived classes
router.get('/audit/classes', async (req, res) => {
    try {
        const { limit = 50, offset = 0 } = req.query;
        
        const result = await pool.query(`
            SELECT ac.*,
                   (SELECT COUNT(*) FROM audit_class_enrollments ace WHERE ace.class_id = ac.original_id) as archived_enrollments
            FROM audit_classes ac
            ORDER BY ac.deleted_at DESC
            LIMIT $1 OFFSET $2
        `, [limit, offset]);
        
        const countResult = await pool.query('SELECT COUNT(*) FROM audit_classes');
        
        res.json({
            success: true,
            classes: result.rows,
            total: parseInt(countResult.rows[0].count)
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Get integrity report for a specific exam (including active and archived data)
router.get('/audit/exam-integrity/:examId', async (req, res) => {
    try {
        const { examId } = req.params;
        
        // Check if exam is active or archived
        let examData = await pool.query(`
            SELECT e.*, c.name as class_name, i.name as instructor_name,
                   'active' as status
            FROM exams e
            LEFT JOIN classes c ON e.class_id = c.id
            LEFT JOIN instructors i ON e.instructor_id = i.id
            WHERE e.id = $1
        `, [examId]);
        
        let isArchived = false;
        if (examData.rows.length === 0) {
            // Check archived exams
            examData = await pool.query(`
                SELECT *, 'archived' as status
                FROM audit_exams
                WHERE original_id = $1
                ORDER BY deleted_at DESC
                LIMIT 1
            `, [examId]);
            isArchived = true;
        }
        
        if (examData.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Exam not found' });
        }
        
        const exam = examData.rows[0];
        
        // Get attempts (active or archived)
        let attempts;
        if (isArchived) {
            attempts = await pool.query(`
                SELECT aa.*, 
                       'archived' as status,
                       aa.blockchain_hash,
                       aa.blockchain_tx
                FROM audit_attempts aa
                WHERE aa.exam_id = $1
                ORDER BY aa.submitted_at DESC
            `, [examId]);
        } else {
            attempts = await pool.query(`
                SELECT a.*, u.full_name as student_name, u.student_id as student_identifier,
                       'active' as status,
                       a.blockchain_hash,
                       a.blockchain_tx
                FROM attempts a
                JOIN users u ON a.student_id = u.id
                WHERE a.exam_id = $1
                ORDER BY a.submitted_at DESC
            `, [examId]);
        }
        
        // Get proctor logs summary
        let proctorSummary;
        if (isArchived) {
            proctorSummary = await pool.query(`
                SELECT 
                    COUNT(*) as total_logs,
                    COUNT(DISTINCT student_id) as unique_students,
                    COUNT(DISTINCT event_type) as unique_violations
                FROM audit_proctor_logs
                WHERE exam_title = $1
            `, [exam.title]);
        } else {
            proctorSummary = await pool.query(`
                SELECT 
                    COUNT(*) as total_logs,
                    COUNT(DISTINCT student_id) as unique_students,
                    COUNT(DISTINCT violation_type) as unique_violations
                FROM proctor_logs
                WHERE exam_id = $1
            `, [examId]);
        }

        // ── ON-CHAIN VERIFICATION ─────────────────────────────────────────────
        // Re-verify each attempt against the blockchain (original attempt id is
        // used for archived records, since hashes were recorded against it).
        const chainReady = isBlockchainReady();
        const attemptsToVerify = attempts.rows.slice(0, 100);

        for (const att of attemptsToVerify) {
            if (!chainReady) {
                att.onChainVerified = null;
                continue;
            }

            const attemptData = isArchived
                ? {
                    id: att.original_id,
                    exam_id: att.exam_id,
                    student_id: att.student_id,
                    answers_json: att.answers,
                    score: att.score,
                    submitted_at: att.submitted_at
                  }
                : att;

            const result = await verifyAttemptIntegrity(attemptData.id, attemptData);
            att.onChainVerified = result.verified === true;
            att.onChainVerifiedReason = result.reason || result.error || null;
            att.storedChainHash = result.storedHash || null;
            att.chainRecordedAt = result.recordedAt || null;
        }

        const verifiedOnChain = attempts.rows.filter(a => a.onChainVerified === true).length;
        
        // Calculate integrity metrics
        const integrityReport = {
            exam: exam,
            isArchived,
            chainReady,
            attempts: {
                total: attempts.rows.length,
                withBlockchainHash: attempts.rows.filter(a => a.blockchain_hash).length,
                withBlockchainTx: attempts.rows.filter(a => a.blockchain_tx).length,
                verifiedOnChain,
                data: attempts.rows
            },
            proctorLogs: proctorSummary.rows[0],
            integrityScore: calculateIntegrityScore(attempts.rows, chainReady),
            generatedAt: new Date().toISOString()
        };
        
        res.json({ success: true, report: integrityReport });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Get student identity verification audit
router.get('/audit/identity/:studentId', async (req, res) => {
    try {
        const { studentId } = req.params;
        
        // Get student info
        const student = await pool.query(`
            SELECT id, full_name, email, student_id, face_verification_photo, 
                   enrollment_status, created_at, updated_at
            FROM users
            WHERE id = $1
        `, [studentId]);
        
        if (student.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }
        
        // Get all identity-related logs
        const identityLogs = await pool.query(`
            SELECT pl.*, e.title as exam_title
            FROM proctor_logs pl
            LEFT JOIN exams e ON pl.exam_id = e.id
            WHERE pl.student_id = $1 
            AND pl.violation_type IN ('DIFFERENT_FACE', 'NO_FACE', 'MULTIPLE_FACES', 'IMPERSONATION')
            ORDER BY pl.created_at DESC
        `, [studentId]);
        
        // Get exam attempts with scores
        const attempts = await pool.query(`
            SELECT a.*, e.title as exam_title, c.name as class_name
            FROM attempts a
            JOIN exams e ON a.exam_id = e.id
            LEFT JOIN classes c ON e.class_id = c.id
            WHERE a.student_id = $1
            ORDER BY a.submitted_at DESC
        `, [studentId]);
        
        // Get enrollment history
        const enrollments = await pool.query(`
            SELECT ce.*, c.name as class_name, c.code as class_code
            FROM class_enrollments ce
            JOIN classes c ON ce.class_id = c.id
            WHERE ce.student_id = $1
            ORDER BY ce.enrolled_at DESC
        `, [studentId]);
        
        res.json({
            success: true,
            student: student.rows[0],
            identityIncidents: identityLogs.rows,
            examAttempts: attempts.rows,
            enrollmentHistory: enrollments.rows,
            generatedAt: new Date().toISOString()
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Get comprehensive audit report (dashboard summary)
router.get('/audit/summary', async (req, res) => {
    try {
        // Get counts from all audit tables
        const [
            deletedExams,
            deletedClasses,
            deletedAttempts,
            deletedLogs,
            deletedSessions,
            deletedEnrollments,
            deletedHeartbeats,
            recentDeletions,
            integrityIssues
        ] = await Promise.all([
            pool.query('SELECT COUNT(*) FROM audit_exams'),
            pool.query('SELECT COUNT(*) FROM audit_classes'),
            pool.query('SELECT COUNT(*) FROM audit_attempts'),
            pool.query('SELECT COUNT(*) FROM audit_proctor_logs'),
            pool.query('SELECT COUNT(*) FROM audit_exam_sessions'),
            pool.query('SELECT COUNT(*) FROM audit_class_enrollments'),
            pool.query('SELECT COUNT(*) FROM audit_heartbeat_logs'),
            pool.query(`
                SELECT * FROM audit_deletion_log 
                ORDER BY deleted_at DESC 
                LIMIT 10
            `),
            pool.query(`
                SELECT COUNT(*) as count 
                FROM attempts 
                WHERE blockchain_hash IS NULL AND submitted_at IS NOT NULL
            `)
        ]);
        
        // Get attempts without blockchain verification
        const unverifiedAttempts = await pool.query(`
            SELECT a.id, a.score, a.submitted_at, u.full_name as student_name, e.title as exam_title
            FROM attempts a
            JOIN users u ON a.student_id = u.id
            JOIN exams e ON a.exam_id = e.id
            WHERE a.blockchain_hash IS NULL AND a.submitted_at IS NOT NULL
            ORDER BY a.submitted_at DESC
            LIMIT 20
        `);
        
        res.json({
            success: true,
            summary: {
                archivedRecords: {
                    exams: parseInt(deletedExams.rows[0].count),
                    classes: parseInt(deletedClasses.rows[0].count),
                    attempts: parseInt(deletedAttempts.rows[0].count),
                    proctorLogs: parseInt(deletedLogs.rows[0].count),
                    sessions: parseInt(deletedSessions.rows[0].count),
                    enrollments: parseInt(deletedEnrollments.rows[0].count),
                    heartbeats: parseInt(deletedHeartbeats.rows[0].count)
                },
                recentDeletions: recentDeletions.rows,
                integrityIssues: {
                    unverifiedAttempts: parseInt(integrityIssues.rows[0].count),
                    details: unverifiedAttempts.rows
                }
            },
            generatedAt: new Date().toISOString()
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

export default router;